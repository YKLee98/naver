// packages/backend/src/controllers/DashboardController.ts
import { Request, Response, NextFunction } from 'express';
import { ProductMapping, InventoryTransaction, Activity } from '../models';
import { getRedisClient } from '../config/redis';
import { logger } from '../utils/logger';

// Extended Request type with user
interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

interface DashboardStats {
  totalProducts: number;
  activeProducts: number;
  totalSales: {
    count: number;
    quantity: number;
  };
  syncStatus: {
    synced: number;
    pending: number;
    error: number;
  };
  inventoryStatus: {
    inStock: number;
    lowStock: number;
    outOfStock: number;
  };
  recentActivity: any[];
}

interface ChartDataQuery {
  period?: string;
  startDate?: string;
  endDate?: string;
}

interface NotificationQuery {
  unreadOnly?: string;
  limit?: string;
}

export class DashboardController {
  /**
   * 대시보드 통계 조회
   */
  getStats = async (
    _req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const [
        totalProducts,
        activeProducts,
        syncedProducts,
        pendingProducts,
        errorProducts,
        recentTransactions,
        recentActivity,
      ] = await Promise.all([
        ProductMapping.countDocuments(),
        ProductMapping.countDocuments({ isActive: true }),
        ProductMapping.countDocuments({ syncStatus: 'synced' }),
        ProductMapping.countDocuments({ syncStatus: 'pending' }),
        ProductMapping.countDocuments({ syncStatus: 'error' }),
        InventoryTransaction.find()
          .sort({ createdAt: -1 })
          .limit(100)
          .lean(),
        Activity.find()
          .sort({ createdAt: -1 })
          .limit(10)
          .lean(),
      ]);

      // 재고 상태 계산 - 최신 트랜잭션 기반
      const inventoryAggregation = await InventoryTransaction.aggregate([
        {
          $sort: { sku: 1, createdAt: -1 }
        },
        {
          $group: {
            _id: '$sku',
            latestQuantity: { $first: '$newQuantity' },
          }
        },
        {
          $group: {
            _id: null,
            inStock: {
              $sum: {
                $cond: [{ $gt: ['$latestQuantity', 10] }, 1, 0]
              }
            },
            lowStock: {
              $sum: {
                $cond: [
                  { $and: [
                    { $lte: ['$latestQuantity', 10] },
                    { $gt: ['$latestQuantity', 0] }
                  ]},
                  1,
                  0
                ]
              }
            },
            outOfStock: {
              $sum: {
                $cond: [{ $eq: ['$latestQuantity', 0] }, 1, 0]
              }
            }
          }
        }
      ]);

      const inventoryStatus = inventoryAggregation[0] || {
        inStock: 0,
        lowStock: 0,
        outOfStock: 0,
      };

      // 판매 통계 계산
      const salesStats = recentTransactions.reduce(
        (acc: { count: number; quantity: number }, transaction: any) => {
          if (transaction.transactionType === 'sale') {
            acc.count++;
            acc.quantity += Math.abs(transaction.quantity);
          }
          return acc;
        },
        { count: 0, quantity: 0 }
      );

      const stats: DashboardStats = {
        totalProducts,
        activeProducts,
        totalSales: salesStats,
        syncStatus: {
          synced: syncedProducts,
          pending: pendingProducts,
          error: errorProducts,
        },
        inventoryStatus,
        recentActivity,
      };

      logger.debug('Dashboard stats retrieved successfully');

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      logger.error('Error in getStats:', error);
      next(error);
    }
  };

  /**
   * 최근 활동 조회
   */
  getRecentActivity = async (
    req: Request<{}, {}, {}, { limit?: string }>,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { limit = '10' } = req.query;
      const limitNum = Math.min(parseInt(limit), 100); // 최대 100개

      const activities = await Activity.find()
        .sort({ createdAt: -1 })
        .limit(limitNum)
        .lean();

      res.json({
        success: true,
        data: activities,
        total: activities.length,
      });
    } catch (error) {
      logger.error('Error in getRecentActivity:', error);
      next(error);
    }
  };

  /**
   * 판매 차트 데이터 조회
   */
  getSalesChartData = async (
    req: Request<{}, {}, {}, ChartDataQuery>,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { period = 'week', startDate, endDate } = req.query;

      const dateFilter = this.getDateFilter(period, startDate, endDate);

      const salesData = await InventoryTransaction.aggregate([
        {
          $match: {
            ...dateFilter,
            transactionType: 'sale',
          },
        },
        {
          $group: {
            _id: {
              platform: '$platform',
              date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            },
            count: { $sum: 1 },
            quantity: { $sum: { $abs: '$quantity' } },
          },
        },
        {
          $sort: { '_id.date': 1 },
        },
        {
          $group: {
            _id: '$_id.date',
            platforms: {
              $push: {
                platform: '$_id.platform',
                count: '$count',
                quantity: '$quantity',
              },
            },
            totalCount: { $sum: '$count' },
            totalQuantity: { $sum: '$quantity' },
          },
        },
        {
          $sort: { _id: 1 },
        },
      ]);

      res.json({
        success: true,
        data: salesData,
        period,
      });
    } catch (error) {
      logger.error('Error in getSalesChartData:', error);
      next(error);
    }
  };

  /**
   * 재고 차트 데이터 조회
   */
  getInventoryChartData = async (
    _req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      // 최신 재고 상태 기반 차트 데이터
      const inventoryData = await InventoryTransaction.aggregate([
        {
          $sort: { sku: 1, createdAt: -1 }
        },
        {
          $group: {
            _id: '$sku',
            latestQuantity: { $first: '$newQuantity' },
            platform: { $first: '$platform' },
          }
        },
        {
          $facet: {
            byStatus: [
              {
                $group: {
                  _id: {
                    $cond: [
                      { $gt: ['$latestQuantity', 10] },
                      'inStock',
                      {
                        $cond: [
                          { $gt: ['$latestQuantity', 0] },
                          'lowStock',
                          'outOfStock',
                        ],
                      },
                    ],
                  },
                  count: { $sum: 1 },
                },
              },
            ],
            byRange: [
              {
                $bucket: {
                  groupBy: '$latestQuantity',
                  boundaries: [0, 10, 50, 100, 500, 1000],
                  default: 'over1000',
                  output: {
                    count: { $sum: 1 },
                  },
                },
              },
            ],
            byPlatform: [
              {
                $group: {
                  _id: '$platform',
                  averageQuantity: { $avg: '$latestQuantity' },
                  totalQuantity: { $sum: '$latestQuantity' },
                  count: { $sum: 1 },
                },
              },
            ],
          },
        },
      ]);

      res.json({
        success: true,
        data: inventoryData[0] || { byStatus: [], byRange: [], byPlatform: [] },
      });
    } catch (error) {
      logger.error('Error in getInventoryChartData:', error);
      next(error);
    }
  };

  /**
   * 동기화 차트 데이터 조회
   */
  getSyncChartData = async (
    req: Request<{}, {}, {}, ChartDataQuery>,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { period = 'week' } = req.query;

      const dateFilter = this.getDateFilter(period);

      const syncData = await Activity.aggregate([
        {
          $match: {
            type: 'sync',
            ...dateFilter,
          },
        },
        {
          $group: {
            _id: {
              date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
              action: '$action',
            },
            count: { $sum: 1 },
          },
        },
        {
          $group: {
            _id: '$_id.date',
            actions: {
              $push: {
                action: '$_id.action',
                count: '$count',
              },
            },
            totalCount: { $sum: '$count' },
          },
        },
        {
          $sort: { _id: 1 },
        },
      ]);

      res.json({
        success: true,
        data: syncData,
        period,
      });
    } catch (error) {
      logger.error('Error in getSyncChartData:', error);
      next(error);
    }
  };

  /**
   * 알림 조회
   */
  getNotifications = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { unreadOnly = 'false', limit = '20' } = req.query as NotificationQuery;
      const redis = getRedisClient();

      const userId = req.user?.id || 'system';
      const key = `notifications:${userId}`;
      
      const notifications = await redis.lrange(key, 0, parseInt(limit) - 1);

      const parsedNotifications = notifications.map(n => {
        try {
          return JSON.parse(n);
        } catch (e) {
          logger.error('Failed to parse notification:', e);
          return null;
        }
      }).filter(Boolean);

      const filtered = unreadOnly === 'true' 
        ? parsedNotifications.filter(n => !n.read)
        : parsedNotifications;

      res.json({
        success: true,
        data: filtered,
        total: filtered.length,
      });
    } catch (error) {
      logger.error('Error in getNotifications:', error);
      next(error);
    }
  };

  /**
   * 알림 읽음 처리
   */
  markNotificationAsRead = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const redis = getRedisClient();

      const userId = req.user?.id || 'system';
      const key = `notifications:${userId}`;
      
      const notifications = await redis.lrange(key, 0, -1);

      const updated = notifications.map(n => {
        const notification = JSON.parse(n);
        if (notification.id === id) {
          notification.read = true;
          notification.readAt = new Date();
        }
        return JSON.stringify(notification);
      });

      await redis.del(key);
      if (updated.length > 0) {
        await redis.rpush(key, ...updated);
      }

      logger.info(`Notification marked as read: ${id}`);

      res.json({
        success: true,
        message: 'Notification marked as read',
      });
    } catch (error) {
      logger.error('Error in markNotificationAsRead:', error);
      next(error);
    }
  };

  /**
   * 시스템 상태 조회
   */
  getSystemHealth = async (
    _req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const redis = getRedisClient();

      const checks = {
        database: false,
        redis: false,
        naver: false,
        shopify: false,
      };

      // Database 체크
      try {
        await ProductMapping.findOne().limit(1);
        checks.database = true;
      } catch (error) {
        logger.error('Database health check failed:', error);
        checks.database = false;
      }

      // Redis 체크
      try {
        await redis.ping();
        checks.redis = true;
      } catch (error) {
        logger.error('Redis health check failed:', error);
        checks.redis = false;
      }

      // API 연결 상태 (캐시된 값 사용)
      const [naverHealth, shopifyHealth] = await Promise.all([
        redis.get('health:naver'),
        redis.get('health:shopify'),
      ]);

      checks.naver = naverHealth === 'ok';
      checks.shopify = shopifyHealth === 'ok';

      const anyDown = Object.values(checks).some(v => v === false);
      const status = anyDown ? 'degraded' : 'healthy';

      res.json({
        success: true,
        data: {
          status,
          services: {
            api: true,
            ...checks,
          },
          lastChecked: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error('Error in getSystemHealth:', error);
      next(error);
    }
  };

  /**
   * 날짜 필터 생성 헬퍼
   */
  private getDateFilter(period: string, startDate?: string, endDate?: string): any {
    if (startDate && endDate) {
      return {
        createdAt: {
          $gte: new Date(startDate),
          $lte: new Date(endDate),
        },
      };
    }

    const now = new Date();
    let start: Date;

    switch (period) {
      case 'day':
        start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'week':
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case 'year':
        start = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    return {
      createdAt: { $gte: start },
    };
  }
}