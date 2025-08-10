// packages/backend/src/controllers/InventoryController.ts
import { Request, Response, NextFunction } from 'express';
import { InventorySyncService } from '../services/sync/index.js';
import { logger } from '../utils/logger.js';
import { ProductMapping, InventoryTransaction } from '../models/index.js';

export class InventoryController {
  private inventorySyncService: InventorySyncService;

  constructor(inventorySyncService: InventorySyncService) {
    this.inventorySyncService = inventorySyncService;
  }

  /**
   * Get all inventory status
   */
  async getAllInventoryStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page = 1, limit = 20, search } = req.query;
      
      // Mock data - 배열 형태로 반환
      const inventoryItems = [
        {
          id: '1',
          sku: 'TEST-001',
          naverStock: 10,
          shopifyStock: 10,
          lastSyncedAt: new Date(),
          status: 'synced'
        },
        {
          id: '2',
          sku: 'TEST-002',
          naverStock: 5,
          shopifyStock: 3,
          lastSyncedAt: new Date(),
          status: 'mismatch'
        }
      ];

      res.json({
        success: true,
        data: inventoryItems,
        pagination: {
          total: inventoryItems.length,
          page: Number(page),
          limit: Number(limit),
          totalPages: Math.ceil(inventoryItems.length / Number(limit))
        }
      });
    } catch (error) {
      logger.error('Get all inventory status error:', error);
      next(error);
    }
  }

  /**
   * Get inventory status for a specific SKU
   */
  async getInventoryStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { sku } = req.params;
      
      // 실제 데이터 조회
      const mapping = await ProductMapping.findOne({ sku: sku.toUpperCase() });
      
      if (!mapping) {
        res.json({
          success: true,
          data: {
            sku,
            naverStock: 0,
            shopifyStock: 0,
            synced: false,
            lastSyncedAt: null,
            message: '매핑되지 않은 SKU입니다.'
          }
        });
        return;
      }

      // 실제 재고 정보 조회 로직 (구현 필요)
      const status = {
        sku,
        naverStock: mapping.inventory?.naver?.available || 0,
        shopifyStock: mapping.inventory?.shopify?.available || 0,
        synced: mapping.syncStatus === 'completed',
        lastSyncedAt: mapping.lastSyncedAt,
        status: mapping.status
      };

      res.json({
        success: true,
        data: status
      });
    } catch (error) {
      logger.error('Get inventory status error:', error);
      next(error);
    }
  }

  /**
   * Get inventory history
   */
  async getInventoryHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { sku } = req.params;
      const { startDate, endDate, limit = 50 } = req.query;

      // 날짜 필터 생성
      const filter: any = { sku: sku.toUpperCase() };
      
      if (startDate || endDate) {
        filter.createdAt = {};
        if (startDate) filter.createdAt.$gte = new Date(startDate as string);
        if (endDate) filter.createdAt.$lte = new Date(endDate as string);
      }

      // 재고 변동 이력 조회
      const history = await InventoryTransaction.find(filter)
        .sort({ createdAt: -1 })
        .limit(Number(limit));

      res.json({
        success: true,
        data: history
      });
    } catch (error) {
      logger.error('Get inventory history error:', error);
      next(error);
    }
  }

  /**
   * Adjust inventory
   */
  async adjustInventory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { sku } = req.params;
      const { quantity, reason, platform } = req.body;

      // 유효성 검사
      if (!quantity || !reason || !platform) {
        res.status(400).json({
          success: false,
          error: '수량, 사유, 플랫폼은 필수 입력 항목입니다.'
        });
        return;
      }

      // 재고 조정 로직 구현
      logger.info(`Adjusting inventory for SKU ${sku}`, { quantity, reason, platform });

      // 재고 변동 기록 생성
      const transaction = new InventoryTransaction({
        sku: sku.toUpperCase(),
        type: 'adjustment',
        platform,
        quantity,
        reason,
        previousQuantity: 0, // 실제 이전 수량 조회 필요
        newQuantity: quantity,
        userId: (req as any).user?.id || 'system',
        createdAt: new Date()
      });

      await transaction.save();

      res.json({
        success: true,
        message: '재고가 조정되었습니다.',
        data: {
          sku,
          platform,
          adjustedQuantity: quantity,
          reason
        }
      });
    } catch (error) {
      logger.error('Adjust inventory error:', error);
      next(error);
    }
  }

  /**
   * Sync inventory for a specific SKU
   */
  async syncInventory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { sku } = req.params;
      
      logger.info(`Starting inventory sync for SKU: ${sku}`);
      
      // 실제 동기화 로직 호출
      if (this.inventorySyncService) {
        await this.inventorySyncService.syncSingleProduct(sku.toUpperCase());
      }

      res.json({
        success: true,
        message: `SKU ${sku}의 재고 동기화가 시작되었습니다.`
      });
    } catch (error) {
      logger.error('Sync inventory error:', error);
      next(error);
    }
  }

  /**
   * Get low stock products
   */
  async getLowStockProducts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { threshold = 10, page = 1, limit = 20 } = req.query;
      
      // 낮은 재고 상품 조회 로직
      const filter = {
        $or: [
          { 'inventory.naver.available': { $lte: Number(threshold) } },
          { 'inventory.shopify.available': { $lte: Number(threshold) } }
        ],
        status: 'ACTIVE'
      };

      const total = await ProductMapping.countDocuments(filter);
      const products = await ProductMapping.find(filter)
        .skip((Number(page) - 1) * Number(limit))
        .limit(Number(limit))
        .sort({ 'inventory.naver.available': 1 });

      const lowStockProducts = products.map(product => ({
        sku: product.sku,
        naverStock: product.inventory?.naver?.available || 0,
        shopifyStock: product.inventory?.shopify?.available || 0,
        productName: product.productName,
        status: product.status,
        lastSyncedAt: product.lastSyncedAt
      }));

      res.json({
        success: true,
        data: lowStockProducts,
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          totalPages: Math.ceil(total / Number(limit))
        }
      });
    } catch (error) {
      logger.error('Get low stock products error:', error);
      next(error);
    }
  }

  /**
   * Get inventory discrepancies
   */
  async getInventoryDiscrepancies(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page = 1, limit = 20, threshold = 5 } = req.query;
      
      // 재고 불일치 상품 조회
      const mappings = await ProductMapping.find({ status: 'ACTIVE' });
      
      const discrepancies = mappings.filter(mapping => {
        const naverStock = mapping.inventory?.naver?.available || 0;
        const shopifyStock = mapping.inventory?.shopify?.available || 0;
        return Math.abs(naverStock - shopifyStock) >= Number(threshold);
      });

      const paginatedDiscrepancies = discrepancies
        .slice((Number(page) - 1) * Number(limit), Number(page) * Number(limit))
        .map(mapping => ({
          sku: mapping.sku,
          naverStock: mapping.inventory?.naver?.available || 0,
          shopifyStock: mapping.inventory?.shopify?.available || 0,
          difference: Math.abs((mapping.inventory?.naver?.available || 0) - (mapping.inventory?.shopify?.available || 0)),
          productName: mapping.productName,
          lastSyncedAt: mapping.lastSyncedAt
        }));

      res.json({
        success: true,
        data: paginatedDiscrepancies,
        pagination: {
          total: discrepancies.length,
          page: Number(page),
          limit: Number(limit),
          totalPages: Math.ceil(discrepancies.length / Number(limit))
        }
      });
    } catch (error) {
      logger.error('Get inventory discrepancies error:', error);
      next(error);
    }
  }

  /**
   * Sync all inventory
   */
  async syncAllInventory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      logger.info('Starting full inventory sync');
      
      // 전체 재고 동기화 시작
      if (this.inventorySyncService) {
        // 비동기로 처리하고 즉시 응답
        this.inventorySyncService.syncAllProducts().catch(error => {
          logger.error('Full inventory sync error:', error);
        });
      }

      res.json({
        success: true,
        message: '전체 재고 동기화가 시작되었습니다. 잠시 후 결과를 확인해주세요.'
      });
    } catch (error) {
      logger.error('Sync all inventory error:', error);
      next(error);
    }
  }

  /**
   * Get inventory metrics
   */
  async getInventoryMetrics(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const [
        totalProducts,
        syncedProducts,
        lowStockProducts,
        outOfStockProducts
      ] = await Promise.all([
        ProductMapping.countDocuments({ status: 'ACTIVE' }),
        ProductMapping.countDocuments({ status: 'ACTIVE', syncStatus: 'completed' }),
        ProductMapping.countDocuments({
          status: 'ACTIVE',
          $or: [
            { 'inventory.naver.available': { $lte: 10 } },
            { 'inventory.shopify.available': { $lte: 10 } }
          ]
        }),
        ProductMapping.countDocuments({
          status: 'ACTIVE',
          $or: [
            { 'inventory.naver.available': 0 },
            { 'inventory.shopify.available': 0 }
          ]
        })
      ]);

      res.json({
        success: true,
        data: {
          totalProducts,
          syncedProducts,
          lowStockProducts,
          outOfStockProducts,
          syncRate: totalProducts > 0 ? (syncedProducts / totalProducts) * 100 : 0
        }
      });
    } catch (error) {
      logger.error('Get inventory metrics error:', error);
      next(error);
    }
  }
}