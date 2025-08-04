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
      ]);

      res.json({
        success: true,
        data: salesData,
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
      const inventoryData = await InventoryTransaction.aggregate([
        {
          $sort: { sku: 1, createdAt: -1 },
        },
        {
          $group: {
            _id: '$sku',
            latestQuantity: { $first: '$newQuantity' },
            platform: { $first: '$platform' },
          },
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
                          'inStock',
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
    req: Request<{}, {}, {}, NotificationQuery>,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { unreadOnly = 'false', limit = '20' } = req.query;
      const redis = getRedisClient();
      const userId = (req as AuthenticatedRequest).user?.id || 'system';

      // Redis에서 알림 조회
      const notificationsKey = `notifications:${userId}`;
      const notifications = await redis.lrange(notificationsKey, 0, parseInt(limit) - 1);

      const parsedNotifications = notifications.map((n: string) => {
        try {
          return JSON.parse(n);
        } catch {
          return null;
        }
      }).filter((n: any) => n !== null);

      // unreadOnly 필터링
      const filteredNotifications = unreadOnly === 'true' 
        ? parsedNotifications.filter((n: any) => !n.read)
        : parsedNotifications;

      res.json({
        success: true,
        data: filteredNotifications,
        total: filteredNotifications.length,
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
    req: Request<{ id: string }>,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const redis = getRedisClient();
      const userId = (req as AuthenticatedRequest).user?.id || 'system';

      // Redis에서 알림 업데이트
      const notificationsKey = `notifications:${userId}`;
      const notifications = await redis.lrange(notificationsKey, 0, -1);

      const updatedNotifications = notifications.map((n: string) => {
        const notification = JSON.parse(n);
        if (notification.id === id) {
          notification.read = true;
          notification.readAt = new Date().toISOString();
        }
        return JSON.stringify(notification);
      });

      // Redis 업데이트
      await redis.del(notificationsKey);
      if (updatedNotifications.length > 0) {
        await redis.rpush(notificationsKey, ...updatedNotifications);
      }

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

      // MongoDB 상태 확인
      try {
        await ProductMapping.findOne().limit(1).exec();
        checks.database = true;
      } catch {
        logger.error('MongoDB health check failed');
      }

      // Redis 상태 확인
      try {
        await redis.ping();
        checks.redis = true;
      } catch {
        logger.error('Redis health check failed');
      }

      // 외부 API 상태는 Redis에 캐시된 값 사용
      const naverHealth = await redis.get('health:naver');
      const shopifyHealth = await redis.get('health:shopify');
      
      checks.naver = naverHealth === 'healthy';
      checks.shopify = shopifyHealth === 'healthy';

      const allHealthy = Object.values(checks).every(v => v === true);
      const anyDown = Object.values(checks).some(v => v === false);

      res.json({
        status: anyDown ? (allHealthy ? 'healthy' : 'degraded') : 'down',
        services: {
          api: true,
          ...checks,
        },
        lastChecked: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Error in getSystemHealth:', error);
      res.status(500).json({
        status: 'error',
        services: {
          api: true,
          database: false,
          redis: false,
          naver: false,
          shopify: false,
        },
        lastChecked: new Date().toISOString(),
      });
    }
  };

  /**
   * 날짜 필터 생성 헬퍼
   */
  private getDateFilter(period?: string, startDate?: string, endDate?: string): any {
    const filter: any = {};

    if (startDate && endDate) {
      filter.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    } else if (period) {
      const now = new Date();
      let start: Date;

      switch (period) {
        case 'day':
          start = new Date(now.setDate(now.getDate() - 1));
          break;
        case 'week':
          start = new Date(now.setDate(now.getDate() - 7));
          break;
        case 'month':
          start = new Date(now.setMonth(now.getMonth() - 1));
          break;
        case 'year':
          start = new Date(now.setFullYear(now.getFullYear() - 1));
          break;
        default:
          start = new Date(now.setDate(now.getDate() - 7));
      }

      filter.createdAt = { $gte: start };
    }

    return filter;
  }
}