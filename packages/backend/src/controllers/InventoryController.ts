// packages/backend/src/controllers/InventoryController.ts
import { Request, Response, NextFunction } from 'express';
import { InventoryTransaction } from '../models';
import { InventorySyncService } from '../services/sync';
import { AppError } from '../middlewares/error.middleware';

export class InventoryController {
  private inventorySyncService: InventorySyncService;

  constructor(inventorySyncService: InventorySyncService) {
    this.inventorySyncService = inventorySyncService;
  }

  /**
   * 재고 현황 조회
   */
  getInventoryStatus = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { sku } = req.params;

      const transactions = await InventoryTransaction.find({ sku })
        .sort({ createdAt: -1 })
        .limit(1)
        .lean();

      const latestTransaction = transactions[0];

      res.json({
        success: true,
        data: {
          sku,
          currentQuantity: latestTransaction?.newQuantity || 0,
          lastUpdated: latestTransaction?.createdAt || null,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * 재고 이력 조회
   */
  getInventoryHistory = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { sku } = req.params;
      const { limit = 100, startDate, endDate } = req.query;

      const query: any = { sku };

      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate as string);
        if (endDate) query.createdAt.$lte = new Date(endDate as string);
      }

      const transactions = await InventoryTransaction.find(query)
        .sort({ createdAt: -1 })
        .limit(Number(limit))
        .lean();

      res.json({
        success: true,
        data: transactions,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * 재고 조정
   */
  adjustInventory = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { sku } = req.params;
      const { adjustment, reason, platform = 'naver' } = req.body;

      if (!adjustment || !reason) {
        throw new AppError('Adjustment and reason are required', 400);
      }

      await this.inventorySyncService.adjustInventory(
        sku,
        adjustment,
        reason,
        platform
      );

      res.json({
        success: true,
        message: 'Inventory adjusted successfully',
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * 재고 부족 상품 조회
   */
  getLowStockProducts = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { threshold = 10 } = req.query;

      // 최신 재고 트랜잭션에서 부족 상품 찾기
      const lowStockProducts = await InventoryTransaction.aggregate([
        {
          $sort: { sku: 1, createdAt: -1 },
        },
        {
          $group: {
            _id: '$sku',
            latestQuantity: { $first: '$newQuantity' },
            lastUpdated: { $first: '$createdAt' },
          },
        },
        {
          $match: {
            latestQuantity: { $lte: Number(threshold) },
          },
        },
        {
          $lookup: {
            from: 'product_mappings',
            localField: '_id',
            foreignField: 'sku',
            as: 'mapping',
          },
        },
        {
          $unwind: '$mapping',
        },
        {
          $project: {
            sku: '$_id',
            quantity: '$latestQuantity',
            lastUpdated: 1,
            productName: '$mapping.productName',
          },
        },
      ]);

      res.json({
        success: true,
        data: lowStockProducts,
      });
    } catch (error) {
      next(error);
    }
  };
}
