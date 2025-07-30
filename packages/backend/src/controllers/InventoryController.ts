// packages/backend/src/controllers/InventoryController.ts
import { Request, Response, NextFunction } from 'express';
import { InventoryTransaction, ProductMapping } from '../models';
import { InventorySyncService } from '../services/sync';
import { AppError } from '../middlewares/error.middleware';
import { logger } from '../utils/logger';

interface InventoryStatusResponse {
  sku: string;
  productName?: string;
  currentQuantity: number;
  lastUpdated: Date | null;
  syncStatus?: string;
  platforms?: {
    naver: number;
    shopify: number;
  };
}

interface InventoryHistoryQuery {
  limit?: string | number;
  startDate?: string;
  endDate?: string;
  platform?: string;
  transactionType?: string;
}

interface InventoryAdjustmentBody {
  adjustment: number;
  reason: string;
  platform?: 'naver' | 'shopify';
  notifyOtherPlatform?: boolean;
}

interface LowStockQuery {
  threshold?: string | number;
  vendor?: string;
  includeInactive?: boolean;
}

export class InventoryController {
  private inventorySyncService: InventorySyncService;

  constructor(inventorySyncService: InventorySyncService) {
    this.inventorySyncService = inventorySyncService;
  }

  /**
   * 재고 현황 조회 - SKU별 최신 재고 정보
   */
  getInventoryStatus = async (
    req: Request<{ sku: string }>,
    res: Response<{ success: boolean; data: InventoryStatusResponse }>,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { sku } = req.params;

      if (!sku) {
        throw new AppError('SKU is required', 400);
      }

      // 최신 트랜잭션 조회
      const transactions = await InventoryTransaction.find({ sku })
        .sort({ createdAt: -1 })
        .limit(1)
        .lean();

      const latestTransaction = transactions[0];

      // 매핑 정보 조회하여 상품명 포함
      const mapping = await ProductMapping.findOne({ sku }).lean();

      const response: InventoryStatusResponse = {
        sku,
        productName: mapping?.productName,
        currentQuantity: latestTransaction?.newQuantity || 0,
        lastUpdated: latestTransaction?.createdAt || null,
        syncStatus: mapping?.syncStatus,
      };

      // 플랫폼별 재고 정보 추가 (최근 트랜잭션 기준)
      if (mapping) {
        const platformTransactions = await InventoryTransaction.aggregate([
          { $match: { sku } },
          { $sort: { createdAt: -1 } },
          {
            $group: {
              _id: '$platform',
              latestQuantity: { $first: '$newQuantity' },
            },
          },
        ]);

        response.platforms = {
          naver: 0,
          shopify: 0,
        };

        platformTransactions.forEach((pt) => {
          if (pt._id === 'naver' || pt._id === 'shopify') {
            response.platforms![pt._id as 'naver' | 'shopify'] = pt.latestQuantity || 0;
          }
        });
      }

      logger.info(`Inventory status retrieved for SKU: ${sku}`);

      res.json({
        success: true,
        data: response,
      });
    } catch (error) {
      logger.error('Error in getInventoryStatus:', error);
      next(error);
    }
  };

  /**
   * 재고 이력 조회 - 트랜잭션 기록
   */
  getInventoryHistory = async (
    req: Request<{ sku: string }, {}, {}, InventoryHistoryQuery>,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { sku } = req.params;
      const {
        limit = 100,
        startDate,
        endDate,
        platform,
        transactionType,
      } = req.query;

      if (!sku) {
        throw new AppError('SKU is required', 400);
      }

      const query: any = { sku };

      // 날짜 범위 필터
      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) {
          query.createdAt.$gte = new Date(startDate);
        }
        if (endDate) {
          query.createdAt.$lte = new Date(endDate);
        }
      }

      // 플랫폼 필터
      if (platform) {
        query.platform = platform;
      }

      // 트랜잭션 타입 필터
      if (transactionType) {
        query.transactionType = transactionType;
      }

      const transactions = await InventoryTransaction.find(query)
        .sort({ createdAt: -1 })
        .limit(Number(limit))
        .lean();

      // 통계 정보 추가
      const stats = await InventoryTransaction.aggregate([
        { $match: query },
        {
          $group: {
            _id: '$transactionType',
            count: { $sum: 1 },
            totalQuantity: { $sum: '$quantity' },
          },
        },
      ]);

      logger.info(`Inventory history retrieved for SKU: ${sku}, records: ${transactions.length}`);

      res.json({
        success: true,
        data: {
          transactions,
          stats,
          filters: {
            sku,
            startDate,
            endDate,
            platform,
            transactionType,
          },
        },
      });
    } catch (error) {
      logger.error('Error in getInventoryHistory:', error);
      next(error);
    }
  };

  /**
   * 재고 조정 - 수동 재고 변경
   */
  adjustInventory = async (
    req: Request<{ sku: string }, {}, InventoryAdjustmentBody>,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { sku } = req.params;
      const {
        adjustment,
        reason,
        platform = 'naver',
        notifyOtherPlatform = true,
      } = req.body;

      if (!sku) {
        throw new AppError('SKU is required', 400);
      }

      if (!adjustment || adjustment === 0) {
        throw new AppError('Valid adjustment amount is required', 400);
      }

      if (!reason || reason.trim().length === 0) {
        throw new AppError('Adjustment reason is required', 400);
      }

      // 매핑 확인
      const mapping = await ProductMapping.findOne({ sku, isActive: true });
      if (!mapping) {
        throw new AppError(`Active mapping not found for SKU: ${sku}`, 404);
      }

      // 재고 조정 실행
      await this.inventorySyncService.adjustInventory(
        sku,
        adjustment,
        reason.trim(),
        platform
      );

      logger.info(`Inventory adjusted for SKU: ${sku}, adjustment: ${adjustment}, platform: ${platform}`);

      res.json({
        success: true,
        message: 'Inventory adjusted successfully',
        data: {
          sku,
          adjustment,
          platform,
          reason,
          notifyOtherPlatform,
          timestamp: new Date(),
        },
      });
    } catch (error) {
      logger.error('Error in adjustInventory:', error);
      next(error);
    }
  };

  /**
   * 재고 부족 상품 조회
   */
  getLowStockProducts = async (
    req: Request<{}, {}, {}, LowStockQuery>,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const {
        threshold = 10,
        vendor,
        includeInactive = false,
      } = req.query;

      const thresholdNumber = Number(threshold);
      if (isNaN(thresholdNumber) || thresholdNumber < 0) {
        throw new AppError('Invalid threshold value', 400);
      }

      // 매핑 필터 구성
      const mappingFilter: any = {};
      if (vendor) {
        mappingFilter.vendor = vendor;
      }
      if (!includeInactive) {
        mappingFilter.isActive = true;
      }

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
            platform: { $first: '$platform' },
          },
        },
        {
          $match: {
            latestQuantity: { $lte: thresholdNumber },
          },
        },
        {
          $lookup: {
            from: 'productmappings', // MongoDB collection name
            localField: '_id',
            foreignField: 'sku',
            as: 'mapping',
          },
        },
        {
          $unwind: '$mapping',
        },
        {
          $match: mappingFilter,
        },
        {
          $project: {
            sku: '$_id',
            quantity: '$latestQuantity',
            lastUpdated: 1,
            platform: 1,
            productName: '$mapping.productName',
            vendor: '$mapping.vendor',
            isActive: '$mapping.isActive',
            shopifyVariantId: '$mapping.shopifyVariantId',
            naverProductId: '$mapping.naverProductId',
          },
        },
        {
          $sort: { quantity: 1, sku: 1 },
        },
      ]);

      // 위험 수준 분류
      const categorizedProducts = lowStockProducts.map((product) => ({
        ...product,
        stockLevel: product.quantity === 0 ? 'out_of_stock' : 
                   product.quantity <= thresholdNumber / 2 ? 'critical' : 'low',
      }));

      logger.info(`Low stock products retrieved: ${lowStockProducts.length} items below threshold ${threshold}`);

      res.json({
        success: true,
        data: {
          products: categorizedProducts,
          summary: {
            total: categorizedProducts.length,
            outOfStock: categorizedProducts.filter(p => p.stockLevel === 'out_of_stock').length,
            critical: categorizedProducts.filter(p => p.stockLevel === 'critical').length,
            low: categorizedProducts.filter(p => p.stockLevel === 'low').length,
          },
          threshold: thresholdNumber,
          filters: {
            vendor,
            includeInactive,
          },
        },
      });
    } catch (error) {
      logger.error('Error in getLowStockProducts:', error);
      next(error);
    }
  };

  /**
   * 재고 차이 분석 - 플랫폼 간 재고 불일치 확인
   */
  getInventoryDiscrepancies = async (
    _req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const discrepancies = await InventoryTransaction.aggregate([
        {
          $sort: { sku: 1, platform: 1, createdAt: -1 },
        },
        {
          $group: {
            _id: {
              sku: '$sku',
              platform: '$platform',
            },
            latestQuantity: { $first: '$newQuantity' },
            lastUpdated: { $first: '$createdAt' },
          },
        },
        {
          $group: {
            _id: '$_id.sku',
            platforms: {
              $push: {
                platform: '$_id.platform',
                quantity: '$latestQuantity',
                lastUpdated: '$lastUpdated',
              },
            },
          },
        },
        {
          $lookup: {
            from: 'productmappings',
            localField: '_id',
            foreignField: 'sku',
            as: 'mapping',
          },
        },
        {
          $unwind: '$mapping',
        },
        {
          $match: {
            'mapping.isActive': true,
          },
        },
        {
          $project: {
            sku: '$_id',
            productName: '$mapping.productName',
            vendor: '$mapping.vendor',
            platforms: 1,
          },
        },
      ]);

      // 차이 계산
      const processedDiscrepancies = discrepancies.map((item) => {
        const naverData = item.platforms.find((p: any) => p.platform === 'naver') || { quantity: 0 };
        const shopifyData = item.platforms.find((p: any) => p.platform === 'shopify') || { quantity: 0 };
        
        const difference = Math.abs(naverData.quantity - shopifyData.quantity);
        const percentageDiff = naverData.quantity > 0 
          ? (difference / naverData.quantity) * 100 
          : shopifyData.quantity > 0 ? 100 : 0;

        return {
          sku: item.sku,
          productName: item.productName,
          vendor: item.vendor,
          naver: {
            quantity: naverData.quantity,
            lastUpdated: naverData.lastUpdated,
          },
          shopify: {
            quantity: shopifyData.quantity,
            lastUpdated: shopifyData.lastUpdated,
          },
          difference,
          percentageDiff: Math.round(percentageDiff * 100) / 100,
          needsSync: difference > 0,
        };
      });

      // 차이가 있는 항목만 필터링하고 차이가 큰 순으로 정렬
      const significantDiscrepancies = processedDiscrepancies
        .filter(d => d.difference > 0)
        .sort((a, b) => b.difference - a.difference);

      logger.info(`Inventory discrepancies found: ${significantDiscrepancies.length} items`);

      res.json({
        success: true,
        data: {
          discrepancies: significantDiscrepancies,
          summary: {
            total: processedDiscrepancies.length,
            withDiscrepancy: significantDiscrepancies.length,
            syncNeeded: significantDiscrepancies.filter(d => d.needsSync).length,
          },
        },
      });
    } catch (error) {
      logger.error('Error in getInventoryDiscrepancies:', error);
      next(error);
    }
  };
}