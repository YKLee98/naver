// packages/backend/src/controllers/DashboardController.ts
import { Request, Response, NextFunction } from 'express';
import { ProductMapping, InventoryTransaction, PriceHistory, OrderSyncStatus } from '../models';
import { startOfDay, endOfDay, subDays } from 'date-fns';
export class DashboardController {
  /**
   * 대시보드 통계
   */
  getStatistics = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const now = new Date();
      const todayStart = startOfDay(now);
      const todayEnd = endOfDay(now);
      const last7DaysStart = startOfDay(subDays(now, 7));

      const [
        totalMappings,
        activeMappings,
        todayTransactions,
        weekTransactions,
        pendingSyncs,
        failedSyncs,
        todayOrders,
        weekOrders,
      ] = await Promise.all([
        ProductMapping.countDocuments(),
        ProductMapping.countDocuments({ isActive: true }),
        InventoryTransaction.countDocuments({
          createdAt: { $gte: todayStart, $lte: todayEnd },
        }),
        InventoryTransaction.countDocuments({
          createdAt: { $gte: last7DaysStart, $lte: todayEnd },
        }),
        ProductMapping.countDocuments({ syncStatus: 'pending' }),
        ProductMapping.countDocuments({ syncStatus: 'error' }),
        OrderSyncStatus.countDocuments({
          createdAt: { $gte: todayStart, $lte: todayEnd },
        }),
        OrderSyncStatus.countDocuments({
          createdAt: { $gte: last7DaysStart, $lte: todayEnd },
        }),
      ]);

      res.json({
        success: true,
        data: {
          mappings: {
            total: totalMappings,
            active: activeMappings,
            pending: pendingSyncs,
            failed: failedSyncs,
          },
          transactions: {
            today: todayTransactions,
            week: weekTransactions,
          },
          orders: {
            today: todayOrders,
            week: weekOrders,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * 최근 활동 내역
   */
  getRecentActivities = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { limit = 20 } = req.query;

      const [transactions, orders] = await Promise.all([
        InventoryTransaction.find()
          .sort({ createdAt: -1 })
          .limit(Number(limit) / 2)
          .populate('sku', 'productName')
          .lean(),
        OrderSyncStatus.find()
          .sort({ createdAt: -1 })
          .limit(Number(limit) / 2)
          .lean(),
      ]);

      // 활동 내역 병합 및 정렬
      const activities = [
        ...transactions.map(t => ({
          type: 'inventory',
          data: t,
          timestamp: t.createdAt,
        })),
        ...orders.map(o => ({
          type: 'order',
          data: o,
          timestamp: o.createdAt,
        })),
      ].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
        .slice(0, Number(limit));

      res.json({
        success: true,
        data: activities,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * 가격 변동 차트 데이터
   */
  getPriceChartData = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { sku, days = 30 } = req.query;
      const startDate = subDays(new Date(), Number(days));

      const query: any = { createdAt: { $gte: startDate } };
      if (sku) query.sku = sku;

      const priceHistory = await PriceHistory.find(query)
        .sort({ createdAt: 1 })
        .select('sku naverPrice finalShopifyPrice exchangeRate createdAt')
        .lean();

      res.json({
        success: true,
        data: priceHistory,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * 재고 변동 차트 데이터
   */
  getInventoryChartData = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { sku, days = 30 } = req.query;
      const startDate = subDays(new Date(), Number(days));

      const query: any = { createdAt: { $gte: startDate } };
      if (sku) query.sku = sku;

      const inventoryHistory = await InventoryTransaction.find(query)
        .sort({ createdAt: 1 })
        .select('sku quantity newQuantity transactionType createdAt')
        .lean();

      res.json({
        success: true,
        data: inventoryHistory,
      });
    } catch (error) {
      next(error);
    }
  };
}
