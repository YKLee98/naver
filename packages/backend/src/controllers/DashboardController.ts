// packages/backend/src/controllers/DashboardController.ts
import { Request, Response } from 'express';
import { Product, InventoryTransaction, Activity } from '@/models';
import { catchAsync } from '@/utils/catchAsync';
import { AppError } from '@/utils/errors';
import { getRedisClient } from '@/config/redis';

export class DashboardController {
  /**
   * 대시보드 통계 조회
   */
  getStats = catchAsync(async (req: Request, res: Response) => {
    const [
      totalProducts,
      activeProducts,
      syncedProducts,
      pendingProducts,
      errorProducts,
      recentTransactions,
    ] = await Promise.all([
      Product.countDocuments(),
      Product.countDocuments({ isActive: true }),
      Product.countDocuments({ syncStatus: 'synced' }),
      Product.countDocuments({ syncStatus: 'pending' }),
      Product.countDocuments({ syncStatus: 'error' }),
      InventoryTransaction.find()
        .sort({ createdAt: -1 })
        .limit(100)
        .lean(),
    ]);

    // 재고 상태 계산
    const inventoryStatus = await Product.aggregate([
      {
        $group: {
          _id: null,
          inStock: {
            $sum: {
              $cond: [{ $gt: ['$naverQuantity', 10] }, 1, 0],
            },
          },
          lowStock: {
            $sum: {
              $cond: [
                { $and: [{ $lte: ['$naverQuantity', 10] }, { $gt: ['$naverQuantity', 0] }] },
                1,
                0,
              ],
            },
          },
          outOfStock: {
            $sum: {
              $cond: [{ $eq: ['$naverQuantity', 0] }, 1, 0],
            },
          },
        },
      },
    ]);

    // 최근 활동 조회
    const recentActivity = await Activity.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    // 판매 통계 계산
    const salesStats = recentTransactions.reduce(
      (acc, transaction) => {
        if (transaction.transactionType === 'sale') {
          acc.count++;
          acc.quantity += Math.abs(transaction.quantity);
        }
        return acc;
      },
      { count: 0, quantity: 0 }
    );

    res.json({
      totalProducts,
      activeProducts,
      totalSales: salesStats.count,
      syncStatus: {
        synced: syncedProducts,
        pending: pendingProducts,
        error: errorProducts,
      },
      inventoryStatus: inventoryStatus[0] || {
        inStock: 0,
        lowStock: 0,
        outOfStock: 0,
      },
      recentActivity,
    });
  });

  /**
   * 최근 활동 조회
   */
  getRecentActivity = catchAsync(async (req: Request, res: Response) => {
    const { limit = 10 } = req.query;

    const activities = await Activity.find()
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .lean();

    res.json({
      data: activities,
    });
  });

  /**
   * 판매 차트 데이터 조회
   */
  getSalesChartData = catchAsync(async (req: Request, res: Response) => {
    const { period = 'week', startDate, endDate } = req.query;

    let dateFilter: any = {};
    const now = new Date();

    if (startDate && endDate) {
      dateFilter = {
        createdAt: {
          $gte: new Date(startDate as string),
          $lte: new Date(endDate as string),
        },
      };
    } else {
      // 기본 기간 설정
      switch (period) {
        case 'day':
          dateFilter.createdAt = {
            $gte: new Date(now.getTime() - 24 * 60 * 60 * 1000),
          };
          break;
        case 'week':
          dateFilter.createdAt = {
            $gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
          };
          break;
        case 'month':
          dateFilter.createdAt = {
            $gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
          };
          break;
      }
    }

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
    ]);

    res.json(salesData);
  });

  /**
   * 재고 차트 데이터 조회
   */
  getInventoryChartData = catchAsync(async (req: Request, res: Response) => {
    const inventoryData = await Product.aggregate([
      {
        $facet: {
          byStatus: [
            {
              $group: {
                _id: {
                  $cond: [
                    { $gt: ['$naverQuantity', 10] },
                    'inStock',
                    {
                      $cond: [
                        { $gt: ['$naverQuantity', 0] },
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
                groupBy: '$naverQuantity',
                boundaries: [0, 10, 50, 100, 500, 1000],
                default: 'over1000',
                output: {
                  count: { $sum: 1 },
                },
              },
            },
          ],
        },
      },
    ]);

    res.json(inventoryData[0]);
  });

  /**
   * 동기화 차트 데이터 조회
   */
  getSyncChartData = catchAsync(async (req: Request, res: Response) => {
    const { period = 'week' } = req.query;

    const dateFilter = this.getDateFilter(period as string);

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
        $sort: { '_id.date': 1 },
      },
    ]);

    res.json(syncData);
  });

  /**
   * 알림 조회
   */
  getNotifications = catchAsync(async (req: Request, res: Response) => {
    const { unreadOnly = false, limit = 20 } = req.query;
    const redis = getRedisClient();

    const key = `notifications:${req.user?.id || 'system'}`;
    const notifications = await redis.lrange(key, 0, Number(limit) - 1);

    const parsedNotifications = notifications.map(n => JSON.parse(n));

    if (unreadOnly === 'true') {
      const filtered = parsedNotifications.filter(n => !n.read);
      res.json(filtered);
    } else {
      res.json(parsedNotifications);
    }
  });

  /**
   * 알림 읽음 처리
   */
  markNotificationAsRead = catchAsync(async (req: Request, res: Response) => {
    const { id } = req.params;
    const redis = getRedisClient();

    const key = `notifications:${req.user?.id || 'system'}`;
    const notifications = await redis.lrange(key, 0, -1);

    const updated = notifications.map(n => {
      const notification = JSON.parse(n);
      if (notification.id === id) {
        notification.read = true;
      }
      return JSON.stringify(notification);
    });

    await redis.del(key);
    await redis.rpush(key, ...updated);

    res.json({ message: 'Notification marked as read' });
  });

  /**
   * 시스템 상태 조회
   */
  getSystemHealth = catchAsync(async (req: Request, res: Response) => {
    const redis = getRedisClient();

    const checks = {
      database: false,
      redis: false,
      naver: false,
      shopify: false,
    };

    // Database 체크
    try {
      await Product.findOne().limit(1);
      checks.database = true;
    } catch (error) {
      checks.database = false;
    }

    // Redis 체크
    try {
      await redis.ping();
      checks.redis = true;
    } catch (error) {
      checks.redis = false;
    }

    // API 연결 상태 (캐시된 값 사용)
    checks.naver = (await redis.get('health:naver')) === 'ok';
    checks.shopify = (await redis.get('health:shopify')) === 'ok';

    const allHealthy = Object.values(checks).every(v => v === true);
    const anyDown = Object.values(checks).some(v => v === false);

    res.json({
      status: anyDown ? 'degraded' : 'healthy',
      services: {
        api: true,
        ...checks,
      },
      lastChecked: new Date().toISOString(),
    });
  });

  /**
   * 날짜 필터 생성 헬퍼
   */
  private getDateFilter(period: string): any {
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case 'day':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    return {
      createdAt: { $gte: startDate },
    };
  }
}