// packages/backend/src/controllers/DashboardController.ts
import { Request, Response, NextFunction } from 'express';
import { ProductMapping, InventoryTransaction, Activity } from '../models';
import { getRedisClient } from '../config/redis';
import { logger } from '../utils/logger';

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

export class DashboardController {
  /**
   * 대시보드 통계 조회
   * ✅ 메서드 이름 변경: getStats → getStatistics
   */
  getStatistics = async (
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

      // 재고 상태 계산
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
      logger.error('Error in getStatistics:', error);
      next(error);
    }
  };

  /**
   * 최근 활동 조회
   * ✅ 메서드 이름 변경: getRecentActivity → getRecentActivities
   */
  getRecentActivities = async (
    req: Request<{}, {}, {}, { limit?: string }>,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { limit = '10' } = req.query;
      const limitNum = Math.min(parseInt(limit), 100);

      const activities = await Activity.find()
        .sort({ createdAt: -1 })
        .limit(limitNum)
        .lean();

      res.json({
        success: true,
        data: {
          activities,
          total: activities.length,
        }
      });
    } catch (error) {
      logger.error('Error in getRecentActivities:', error);
      next(error);
    }
  };

  /**
   * 가격 차트 데이터 조회
   * ✅ 메서드 이름 변경: getSalesChartData → getPriceChartData
   */
  getPriceChartData = async (
    req: Request<{}, {}, {}, ChartDataQuery>,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { period = 'day', startDate, endDate } = req.query;

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
          $project: {
            _id: 0,
            date: '$_id',
            platforms: 1,
            totalCount: 1,
            totalQuantity: 1,
          },
        },
      ]);

      res.json({
        success: true,
        data: salesData,
      });
    } catch (error) {
      logger.error('Error in getPriceChartData:', error);
      next(error);
    }
  };

  /**
   * 재고 차트 데이터 조회
   * ✅ 메서드 이름 유지
   */
  getInventoryChartData = async (
    req: Request<{}, {}, {}, { groupBy?: string }>,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { groupBy = 'status' } = req.query;

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
                      { $eq: ['$latestQuantity', 0] },
                      'outOfStock',
                      {
                        $cond: [
                          { $lte: ['$latestQuantity', 10] },
                          'lowStock',
                          'inStock'
                        ]
                      }
                    ]
                  },
                  count: { $sum: 1 },
                  totalQuantity: { $sum: '$latestQuantity' },
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
   * Helper: 날짜 필터 생성
   */
  private getDateFilter(period?: string, startDate?: string, endDate?: string): any {
    const filter: any = {};

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
      return filter;
    }

    // 기간별 필터
    const now = new Date();
    switch (period) {
      case 'hour':
        filter.createdAt = { $gte: new Date(now.getTime() - 60 * 60 * 1000) };
        break;
      case 'day':
        filter.createdAt = { $gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) };
        break;
      case 'week':
        filter.createdAt = { $gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) };
        break;
      case 'month':
        filter.createdAt = { $gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) };
        break;
      default:
        filter.createdAt = { $gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) };
    }

    return filter;
  }
}