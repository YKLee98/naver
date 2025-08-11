// packages/backend/src/controllers/DashboardControllerOptimized.ts
import { Request, Response, NextFunction } from 'express';
import {
  PriceSyncJob,
  InventoryTransaction,
  ProductMapping,
  Activity,
} from '../models/index.js';
import { logger } from '../utils/logger.js';
import { CacheService } from '../services/cache/CacheService.js';
import { getRedisClient } from '../config/redis.js';
import {
  subDays,
  startOfDay,
  endOfDay,
  subHours,
} from 'date-fns';

interface DashboardStats {
  totalInventory: number;
  todaySales: number;
  syncStatus: 'normal' | 'warning' | 'error';
  alertCount: number;
  inventoryValue: number;
  lowStockCount: number;
  outOfStockCount: number;
  syncSuccessRate: number;
  lastSyncTime?: Date;
  activeProducts: number;
  totalProducts: number;
  priceDiscrepancies: number;
  pendingSyncs: number;
}

/**
 * Optimized Dashboard Controller with improved caching and query performance
 */
export class DashboardControllerOptimized {
  private cacheService: CacheService;
  private readonly CACHE_TTL = 300; // 5 minutes for dashboard data
  private readonly CACHE_PREFIX = 'dashboard';

  constructor() {
    const redis = getRedisClient();
    if (redis) {
      this.cacheService = new CacheService(redis);
    } else {
      logger.warn('Redis not available for DashboardController');
      // Create a mock cache service if needed
      this.cacheService = null as any;
    }
  }

  /**
   * Get comprehensive dashboard statistics with optimized queries
   */
  getStatistics = async (
    _req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      // Try cache first
      if (this.cacheService) {
        const cached = await this.cacheService.getOrSet<DashboardStats>(
          'statistics',
          () => this.fetchDashboardStatistics(),
          { prefix: this.CACHE_PREFIX, ttl: this.CACHE_TTL }
        );
        
        res.json({
          success: true,
          data: cached,
          cached: true,
        });
        return;
      }

      // Fallback to direct fetch if no cache
      const statistics = await this.fetchDashboardStatistics();
      res.json({
        success: true,
        data: statistics,
        cached: false,
      });
    } catch (error) {
      logger.error('Error fetching dashboard statistics:', error);
      next(error);
    }
  };

  /**
   * Fetch dashboard statistics using aggregation pipeline for better performance
   */
  private async fetchDashboardStatistics(): Promise<DashboardStats> {
    const today = new Date();
    const startOfToday = startOfDay(today);
    const endOfToday = endOfDay(today);

    // Use aggregation pipeline for efficient data fetching
    const [statsAggregation] = await ProductMapping.aggregate([
      {
        $facet: {
          totalCount: [{ $count: 'count' }],
          activeCount: [
            { $match: { isActive: true, status: 'ACTIVE' } },
            { $count: 'count' },
          ],
          inventory: [
            {
              $group: {
                _id: null,
                totalQuantity: { $sum: '$shopifyQuantity' },
                totalValue: { $sum: { $multiply: ['$shopifyQuantity', '$shopifyPrice'] } },
                lowStock: {
                  $sum: {
                    $cond: [
                      { $and: [
                        { $gt: ['$shopifyQuantity', 0] },
                        { $lte: ['$shopifyQuantity', 10] }
                      ]},
                      1,
                      0
                    ]
                  }
                },
                outOfStock: {
                  $sum: { $cond: [{ $eq: ['$shopifyQuantity', 0] }, 1, 0] }
                },
              },
            },
          ],
          priceDiscrepancies: [
            {
              $match: {
                $expr: {
                  $ne: ['$shopifyPrice', '$naverPrice']
                }
              }
            },
            { $count: 'count' }
          ],
        },
      },
    ]);

    // Fetch sync-related data using optimized queries
    const [
      recentSync,
      syncStats,
      todayTransactions,
      pendingSyncs,
      recentActivities,
    ] = await Promise.all([
      // Get most recent completed sync
      PriceSyncJob.findOne({ status: 'completed' })
        .sort({ completedAt: -1 })
        .select('completedAt status')
        .lean(),
      
      // Get sync success rate using aggregation
      PriceSyncJob.aggregate([
        {
          $match: {
            createdAt: { $gte: subDays(today, 7) }
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            successful: {
              $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
            },
          },
        },
      ]),
      
      // Get today's transactions summary
      InventoryTransaction.aggregate([
        {
          $match: {
            createdAt: { $gte: startOfToday, $lte: endOfToday },
            type: 'SALE',
          },
        },
        {
          $group: {
            _id: null,
            totalSales: { $sum: '$quantity' },
            totalRevenue: { $sum: { $multiply: ['$quantity', '$price'] } },
          },
        },
      ]),
      
      // Count pending syncs
      PriceSyncJob.countDocuments({ status: 'pending' }),
      
      // Count recent activities
      Activity.countDocuments({
        createdAt: { $gte: subDays(today, 1) },
      }),
    ]);

    // Process aggregation results
    const totalProducts = statsAggregation.totalCount[0]?.count || 0;
    const activeProducts = statsAggregation.activeCount[0]?.count || 0;
    const inventoryStats = statsAggregation.inventory[0] || {
      totalQuantity: 0,
      totalValue: 0,
      lowStock: 0,
      outOfStock: 0,
    };
    const priceDiscrepancyCount = statsAggregation.priceDiscrepancies[0]?.count || 0;

    // Calculate sync success rate
    const syncSuccessRate = syncStats[0]
      ? (syncStats[0].successful / syncStats[0].total) * 100
      : 100;

    // Calculate today's sales
    const todaySales = todayTransactions[0]?.totalRevenue || 0;

    // Determine sync status
    const syncStatus = this.determineSyncStatus(recentSync);

    return {
      totalInventory: inventoryStats.totalQuantity,
      todaySales,
      syncStatus,
      alertCount: recentActivities,
      inventoryValue: inventoryStats.totalValue,
      lowStockCount: inventoryStats.lowStock,
      outOfStockCount: inventoryStats.outOfStock,
      syncSuccessRate,
      lastSyncTime: recentSync?.completedAt,
      activeProducts,
      totalProducts,
      priceDiscrepancies: priceDiscrepancyCount,
      pendingSyncs,
    };
  }

  /**
   * Get inventory trends with optimized aggregation
   */
  getInventoryTrends = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { period = '7d' } = req.query;
      const cacheKey = `inventory-trends:${period}`;

      if (this.cacheService) {
        const cached = await this.cacheService.getOrSet(
          cacheKey,
          () => this.fetchInventoryTrends(period as string),
          { prefix: this.CACHE_PREFIX, ttl: this.CACHE_TTL }
        );

        res.json({
          success: true,
          data: cached,
        });
        return;
      }

      const trends = await this.fetchInventoryTrends(period as string);
      res.json({
        success: true,
        data: trends,
      });
    } catch (error) {
      logger.error('Error fetching inventory trends:', error);
      next(error);
    }
  };

  /**
   * Fetch inventory trends using aggregation pipeline
   */
  private async fetchInventoryTrends(period: string): Promise<any> {
    const days = parseInt(period) || 7;
    const startDate = subDays(new Date(), days);

    const trends = await InventoryTransaction.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            type: '$type',
          },
          quantity: { $sum: '$quantity' },
          value: { $sum: { $multiply: ['$quantity', '$price'] } },
        },
      },
      {
        $group: {
          _id: '$_id.date',
          sales: {
            $sum: {
              $cond: [{ $eq: ['$_id.type', 'SALE'] }, '$quantity', 0],
            },
          },
          salesValue: {
            $sum: {
              $cond: [{ $eq: ['$_id.type', 'SALE'] }, '$value', 0],
            },
          },
          restocks: {
            $sum: {
              $cond: [{ $eq: ['$_id.type', 'RESTOCK'] }, '$quantity', 0],
            },
          },
          adjustments: {
            $sum: {
              $cond: [{ $eq: ['$_id.type', 'ADJUSTMENT'] }, '$quantity', 0],
            },
          },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    return {
      labels: trends.map(t => t._id),
      datasets: [
        {
          label: 'Sales',
          data: trends.map(t => t.sales),
          borderColor: 'rgb(75, 192, 192)',
          backgroundColor: 'rgba(75, 192, 192, 0.2)',
        },
        {
          label: 'Restocks',
          data: trends.map(t => t.restocks),
          borderColor: 'rgb(54, 162, 235)',
          backgroundColor: 'rgba(54, 162, 235, 0.2)',
        },
        {
          label: 'Adjustments',
          data: trends.map(t => Math.abs(t.adjustments)),
          borderColor: 'rgb(255, 159, 64)',
          backgroundColor: 'rgba(255, 159, 64, 0.2)',
        },
      ],
      summary: {
        totalSales: trends.reduce((sum, t) => sum + t.sales, 0),
        totalRevenue: trends.reduce((sum, t) => sum + t.salesValue, 0),
        averageDailySales: trends.length > 0 
          ? trends.reduce((sum, t) => sum + t.sales, 0) / trends.length
          : 0,
      },
    };
  }

  /**
   * Get sync performance metrics with caching
   */
  getSyncPerformance = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { period = '24h' } = req.query;
      const cacheKey = `sync-performance:${period}`;

      if (this.cacheService) {
        const cached = await this.cacheService.getOrSet(
          cacheKey,
          () => this.fetchSyncPerformance(period as string),
          { prefix: this.CACHE_PREFIX, ttl: 60 } // Shorter TTL for performance metrics
        );

        res.json({
          success: true,
          data: cached,
        });
        return;
      }

      const performance = await this.fetchSyncPerformance(period as string);
      res.json({
        success: true,
        data: performance,
      });
    } catch (error) {
      logger.error('Error fetching sync performance:', error);
      next(error);
    }
  };

  /**
   * Fetch sync performance metrics using aggregation
   */
  private async fetchSyncPerformance(period: string): Promise<any> {
    const hours = period === '24h' ? 24 : period === '7d' ? 168 : 24;
    const startDate = subHours(new Date(), hours);

    const performance = await PriceSyncJob.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: {
            hour: { $hour: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' },
          },
          avgDuration: {
            $avg: {
              $subtract: ['$completedAt', '$startedAt'],
            },
          },
          successCount: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
          },
          failureCount: {
            $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] },
          },
          totalCount: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 1,
          avgDuration: { $divide: ['$avgDuration', 1000] }, // Convert to seconds
          successRate: {
            $multiply: [
              { $divide: ['$successCount', '$totalCount'] },
              100,
            ],
          },
          successCount: 1,
          failureCount: 1,
        },
      },
      { $sort: { '_id.day': 1, '_id.hour': 1 } },
    ]);

    return {
      hourlyMetrics: performance,
      summary: {
        avgDuration: performance.length > 0
          ? performance.reduce((sum, p) => sum + (p.avgDuration || 0), 0) / performance.length
          : 0,
        avgSuccessRate: performance.length > 0
          ? performance.reduce((sum, p) => sum + p.successRate, 0) / performance.length
          : 100,
        totalSyncs: performance.reduce((sum, p) => sum + p.successCount + p.failureCount, 0),
      },
    };
  }

  /**
   * Invalidate dashboard cache
   */
  invalidateCache = async (
    _req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (this.cacheService) {
        await this.cacheService.deletePattern(`${this.CACHE_PREFIX}:*`);
        res.json({
          success: true,
          message: 'Dashboard cache invalidated',
        });
      } else {
        res.json({
          success: true,
          message: 'No cache to invalidate',
        });
      }
    } catch (error) {
      logger.error('Error invalidating cache:', error);
      next(error);
    }
  };

  /**
   * Determine sync status based on recent sync
   */
  private determineSyncStatus(recentSync: any): 'normal' | 'warning' | 'error' {
    if (!recentSync) return 'error';
    
    const hoursSinceSync = (Date.now() - new Date(recentSync.completedAt).getTime()) / 3600000;
    
    if (hoursSinceSync > 24) return 'error';
    if (hoursSinceSync > 6) return 'warning';
    return 'normal';
  }
}