// ===== 3. packages/backend/src/controllers/InventoryController.ts =====
// (메서드 추가)
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
   * 전체 재고 현황 목록 조회
   */
  getInventoryStatusList = async (
    req: Request<{}, {}, {}, { page?: string; limit?: string; search?: string }>,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { page = '1', limit = '20', search } = req.query;
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);

      // 검색 조건
      const query: any = {};
      if (search) {
        query.$or = [
          { sku: { $regex: search, $options: 'i' } },
          { productName: { $regex: search, $options: 'i' } }
        ];
      }

      // 매핑된 상품 조회
      const [mappings, total] = await Promise.all([
        ProductMapping.find(query)
          .skip((pageNum - 1) * limitNum)
          .limit(limitNum)
          .lean(),
        ProductMapping.countDocuments(query)
      ]);

      // SKU별 최신 재고 정보 조회
      const skus = mappings.map(m => m.sku);
      const latestInventory = await InventoryTransaction.aggregate([
        { $match: { sku: { $in: skus } } },
        { $sort: { createdAt: -1 } },
        {
          $group: {
            _id: '$sku',
            latestQuantity: { $first: '$newQuantity' },
            lastUpdated: { $first: '$createdAt' }
          }
        }
      ]);

      // 재고 정보 맵 생성
      const inventoryMap = new Map(
        latestInventory.map(inv => [inv._id, inv])
      );

      // 응답 데이터 생성
      const inventoryStatus = mappings.map(mapping => ({
        sku: mapping.sku,
        productName: mapping.productName,
        currentQuantity: inventoryMap.get(mapping.sku)?.latestQuantity || 0,
        lastUpdated: inventoryMap.get(mapping.sku)?.lastUpdated || null,
        syncStatus: mapping.syncStatus,
        isActive: mapping.isActive
      }));

      res.json({
        success: true,
        data: inventoryStatus,
        total,
        page: pageNum,
        totalPages: Math.ceil(total / limitNum)
      });
    } catch (error) {
      logger.error('Error in getInventoryStatusList:', error);
      next(error);
    }
  };

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
   * 재고 조정
   */
  adjustInventory = async (
    req: Request<{ sku: string }, {}, InventoryAdjustmentBody>,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { sku } = req.params;
      const { adjustment, reason, platform = 'shopify', notifyOtherPlatform = false } = req.body;

      if (!sku || adjustment === undefined || !reason) {
        throw new AppError('SKU, adjustment, and reason are required', 400);
      }

      // 현재 재고 조회
      const latestTransaction = await InventoryTransaction.findOne({ sku })
        .sort({ createdAt: -1 })
        .lean();

      const currentQuantity = latestTransaction?.newQuantity || 0;
      const newQuantity = currentQuantity + adjustment;

      if (newQuantity < 0) {
        throw new AppError('Inventory cannot be negative', 400);
      }

      // 재고 조정 트랜잭션 생성
      const transaction = await InventoryTransaction.create({
        sku,
        platform,
        transactionType: 'adjustment',
        quantity: adjustment,
        previousQuantity: currentQuantity,
        newQuantity,
        reason,
        createdBy: (req as any).user?.id || 'system',
      });

      // 다른 플랫폼에도 동기화
      if (notifyOtherPlatform) {
        // 동기화 서비스 호출
        await this.inventorySyncService.syncInventoryBySku(sku);
      }

      logger.info(`Inventory adjusted for SKU: ${sku}, adjustment: ${adjustment}, new quantity: ${newQuantity}`);

      res.json({
        success: true,
        data: {
          transaction,
          currentQuantity: newQuantity,
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
        threshold = '10', 
        vendor,
        includeInactive = false 
      } = req.query;

      const thresholdNum = Number(threshold);

      // 활성 상품만 조회할지 설정
      const mappingQuery: any = {};
      if (!includeInactive) {
        mappingQuery.isActive = true;
      }
      if (vendor) {
        mappingQuery.vendor = vendor;
      }

      // 매핑된 상품 조회
      const mappings = await ProductMapping.find(mappingQuery).lean();
      const skus = mappings.map(m => m.sku);

      // SKU별 최신 재고 조회
      const lowStockProducts = await InventoryTransaction.aggregate([
        { $match: { sku: { $in: skus } } },
        { $sort: { createdAt: -1 } },
        {
          $group: {
            _id: '$sku',
            latestQuantity: { $first: '$newQuantity' },
            lastUpdated: { $first: '$createdAt' },
          },
        },
        {
          $match: {
            latestQuantity: { $lte: thresholdNum },
          },
        },
      ]);

      // 매핑 정보와 결합
      const result = lowStockProducts.map(product => {
        const mapping = mappings.find(m => m.sku === product._id);
        return {
          sku: product._id,
          productName: mapping?.productName || 'Unknown',
          currentQuantity: product.latestQuantity,
          lastUpdated: product.lastUpdated,
          vendor: mapping?.vendor,
          isActive: mapping?.isActive,
        };
      });

      logger.info(`Low stock products retrieved: ${result.length} products below ${thresholdNum}`);

      res.json({
        success: true,
        data: result,
        threshold: thresholdNum,
        total: result.length,
      });
    } catch (error) {
      logger.error('Error in getLowStockProducts:', error);
      next(error);
    }
  };
}