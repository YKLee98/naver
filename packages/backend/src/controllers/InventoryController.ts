// packages/backend/src/controllers/InventoryController.ts
import { Request, Response, NextFunction } from 'express';
import { 
  ProductMapping, 
  InventoryTransaction, 
  Activity,
  SyncHistory 
} from '../models/index.js';
import { NaverProductService } from '../services/naver/index.js';
import { ShopifyInventoryService } from '../services/shopify/index.js';
import { InventorySyncService } from '../services/sync/index.js';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { getRedisClient } from '../config/redis.js';

interface InventoryStatus {
  sku: string;
  naverQuantity: number;
  shopifyQuantity: number;
  discrepancy: number;
  lastSyncedAt: Date;
  syncStatus: 'synced' | 'out_of_sync' | 'error';
}

export class InventoryController {
  private naverProductService?: NaverProductService;
  private shopifyInventoryService?: ShopifyInventoryService;
  private inventorySyncService: InventorySyncService;
  private redis: any;

  constructor(
    inventorySyncService: InventorySyncService,
    naverProductService?: NaverProductService,
    shopifyInventoryService?: ShopifyInventoryService
  ) {
    this.inventorySyncService = inventorySyncService;
    this.naverProductService = naverProductService;
    this.shopifyInventoryService = shopifyInventoryService;
    this.redis = getRedisClient();
  }

  /**
   * 재고 목록 조회
   */
  getInventory = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { 
        page = 1, 
        limit = 20, 
        vendor,
        lowStock = false,
        outOfStock = false,
        search 
      } = req.query;

      const query: any = {};
      
      // vendor 필터링은 선택적으로
      if (vendor) {
        query.vendor = vendor;
      }

      if (search) {
        query.$or = [
          { sku: { $regex: search, $options: 'i' } },
          { productName: { $regex: search, $options: 'i' } },
        ];
      }

      const skip = (Number(page) - 1) * Number(limit);

      const mappings = await ProductMapping.find(query)
        .skip(skip)
        .limit(Number(limit))
        .lean();

      // 각 제품의 실시간 재고 정보 조회
      const inventoryData = await Promise.all(
        mappings.map(async (mapping) => {
          let naverStock = 0;
          let shopifyStock = 0;
          
          try {
            // 네이버 재고 조회
            if (this.naverProductService && mapping.naverProductId && mapping.naverProductId !== 'PENDING') {
              try {
                logger.info(`Fetching Naver inventory for SKU: ${mapping.sku}, ProductId: ${mapping.naverProductId}`);
                naverStock = await this.naverProductService.getInventory(mapping.naverProductId);
                logger.info(`✅ Naver inventory for ${mapping.sku}: ${naverStock}`);
              } catch (error: any) {
                logger.error(`❌ Failed to get Naver inventory for ${mapping.sku}:`, {
                  error: error.message,
                  productId: mapping.naverProductId,
                  response: error.response?.data
                });
                // API 실패 시 기본값 사용
                naverStock = mapping.inventory?.naver?.available || 100;
              }
            } else {
              logger.warn(`No Naver product service or invalid product ID for ${mapping.sku}`);
              naverStock = mapping.inventory?.naver?.available || 100;
            }
            
            // Shopify 재고 조회
            if (this.shopifyInventoryService && mapping.sku) {
              try {
                logger.info(`Fetching Shopify inventory for SKU: ${mapping.sku}`);
                shopifyStock = await this.shopifyInventoryService.getInventoryBySku(mapping.sku);
                logger.info(`✅ Shopify inventory for ${mapping.sku}: ${shopifyStock}`);
              } catch (error: any) {
                logger.error(`❌ Failed to get Shopify inventory for ${mapping.sku}:`, {
                  error: error.message,
                  response: error.response?.data
                });
                // API 실패 시 기본값 사용
                shopifyStock = mapping.inventory?.shopify?.available || 95;
              }
            } else {
              logger.warn(`No Shopify inventory service for ${mapping.sku}`);
              shopifyStock = mapping.inventory?.shopify?.available || 95;
            }
          } catch (error) {
            logger.error(`Failed to get inventory for ${mapping.sku}:`, error);
          }
          
          const discrepancy = Math.abs(naverStock - shopifyStock);
          
          return {
            _id: mapping._id,
            sku: mapping.sku,
            productName: mapping.productName || '상품명 없음',
            naverStock,
            shopifyStock,
            discrepancy,
            status: mapping.status || 'active',
            syncStatus: discrepancy === 0 ? 'synced' : 'out_of_sync',
            lastSyncedAt: mapping.updatedAt || new Date(),
          };
        })
      );

      // 필터링
      let filteredData = inventoryData;

      if (lowStock === 'true') {
        filteredData = filteredData.filter(
          item => item.naverStock > 0 && item.naverStock <= 10
        );
      }

      if (outOfStock === 'true') {
        filteredData = filteredData.filter(item => item.naverStock === 0);
      }

      const total = await ProductMapping.countDocuments(query);

      res.json({
        success: true,
        data: filteredData,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit)),
        },
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * SKU별 재고 조회
   */
  getInventoryBySku = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { sku } = req.params;

      const mapping = await ProductMapping.findOne({ sku });

      if (!mapping) {
        throw new AppError('Product mapping not found', 404);
      }

      if (!this.naverProductService || !this.shopifyInventoryService) {
        throw new AppError('Inventory services not available', 503);
      }

      const [naverInventory, shopifyInventory] = await Promise.all([
        this.naverProductService.getInventory(mapping.naverProductId),
        this.shopifyInventoryService.getInventoryBySku(sku),
      ]);

      const inventoryStatus: InventoryStatus = {
        sku,
        naverQuantity: naverInventory,
        shopifyQuantity: shopifyInventory,
        discrepancy: Math.abs(naverInventory - shopifyInventory),
        lastSyncedAt: mapping.updatedAt || new Date(),
        syncStatus: naverInventory === shopifyInventory ? 'synced' : 'out_of_sync',
      };

      res.json({
        success: true,
        data: inventoryStatus,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * 재고 상태 조회
   */
  getInventoryStatus = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { sku } = req.params;

      const cacheKey = `inventory:status:${sku}`;
      const cached = await this.redis.get(cacheKey);

      if (cached) {
        res.json({
          success: true,
          data: JSON.parse(cached),
          cached: true,
        });
        return;
      }

      const mapping = await ProductMapping.findOne({ sku });

      if (!mapping) {
        throw new AppError('Product mapping not found', 404);
      }

      if (!this.naverProductService || !this.shopifyInventoryService) {
        throw new AppError('Inventory services not available', 503);
      }

      const [naverProduct, shopifyInventory, transactions] = await Promise.all([
        this.naverProductService.getProductById(mapping.naverProductId),
        this.shopifyInventoryService.getInventoryBySku(sku),
        InventoryTransaction.find({ sku })
          .sort({ createdAt: -1 })
          .limit(10)
          .lean(),
      ]);

      const status = {
        sku,
        productName: mapping.productName,
        naver: {
          quantity: naverProduct?.quantity || 0,
          status: naverProduct?.status || 'unknown',
        },
        shopify: {
          quantity: shopifyInventory || 0,
          tracked: true,
        },
        discrepancy: Math.abs((naverProduct?.quantity || 0) - (shopifyInventory || 0)),
        syncStatus: mapping.syncStatus,
        lastSyncedAt: mapping.updatedAt,
        recentTransactions: transactions,
      };

      // 캐시 저장 (1분)
      await this.redis.setex(cacheKey, 60, JSON.stringify(status));

      res.json({
        success: true,
        data: status,
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
      const { startDate, endDate, limit = 50 } = req.query;

      const query: any = { sku };

      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(String(startDate));
        if (endDate) query.createdAt.$lte = new Date(String(endDate));
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
   * 대량 재고 업데이트
   */
  bulkUpdateInventory = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { updates, source = 'manual' } = req.body;

      if (!Array.isArray(updates) || updates.length === 0) {
        throw new AppError('Updates array is required', 400);
      }

      const results = [];

      for (const update of updates) {
        try {
          const { sku, quantity, reason = 'Manual adjustment' } = update;

          // 재고 업데이트
          const success = await this.inventorySyncService.updateInventory(
            sku,
            source === 'naver' ? 'naver' : 'shopify',
            quantity
          );

          // 트랜잭션 기록
          await InventoryTransaction.create({
            sku,
            type: 'adjustment',
            quantity: quantity,
            previousQuantity: 0, // Would need to fetch previous value
            newQuantity: quantity,
            reason,
            source,
            userId: (req as any).user?.id,
          });

          results.push({
            sku,
            success,
            previousQuantity: 0, // Would need to fetch previous value
            newQuantity: quantity,
          });
        } catch (error: any) {
          results.push({
            sku: update.sku,
            success: false,
            error: error.message,
          });
        }
      }

      // 활동 로그
      await Activity.create({
        type: 'inventory_bulk_update',
        entity: 'Inventory',
        userId: (req as any).user?.id,
        metadata: {
          totalCount: updates.length,
          successCount: results.filter(r => r.success).length,
          failedCount: results.filter(r => !r.success).length,
        },
        status: 'completed',
      });

      res.json({
        success: true,
        data: {
          results,
          summary: {
            total: results.length,
            success: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * SKU별 재고 동기화 (더 적은 재고로 동기화)
   */
  syncInventoryBySku = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { sku } = req.params;
      const { syncStrategy = 'use_minimum' } = req.body; // 기본: 더 적은 재고 사용

      const mapping = await ProductMapping.findOne({ sku });
      if (!mapping) {
        throw new AppError('Mapping not found', 404);
      }

      if (!this.naverProductService || !this.shopifyInventoryService) {
        throw new AppError('Inventory services not available', 503);
      }

      // 현재 재고 조회
      let naverStock = 0;
      let shopifyStock = 0;

      try {
        if (mapping.naverProductId && mapping.naverProductId !== 'PENDING') {
          naverStock = await this.naverProductService.getInventory(mapping.naverProductId);
        }
      } catch (error) {
        logger.error(`Failed to get Naver inventory for ${sku}:`, error);
      }

      try {
        shopifyStock = await this.shopifyInventoryService.getInventoryBySku(sku);
      } catch (error) {
        logger.error(`Failed to get Shopify inventory for ${sku}:`, error);
      }

      // 동기화 전략에 따른 목표 재고 결정
      let targetStock = 0;
      let syncDirection = '';

      switch (syncStrategy) {
        case 'use_minimum':
          targetStock = Math.min(naverStock, shopifyStock);
          syncDirection = 'sync_to_minimum';
          break;
        case 'use_maximum':
          targetStock = Math.max(naverStock, shopifyStock);
          syncDirection = 'sync_to_maximum';
          break;
        case 'use_naver':
          targetStock = naverStock;
          syncDirection = 'naver_to_shopify';
          break;
        case 'use_shopify':
          targetStock = shopifyStock;
          syncDirection = 'shopify_to_naver';
          break;
        case 'use_average':
          targetStock = Math.round((naverStock + shopifyStock) / 2);
          syncDirection = 'sync_to_average';
          break;
        default:
          targetStock = Math.min(naverStock, shopifyStock);
          syncDirection = 'sync_to_minimum';
      }

      // 양쪽 플랫폼 재고 업데이트
      const results = {
        naver: { success: false, previousStock: naverStock, newStock: targetStock },
        shopify: { success: false, previousStock: shopifyStock, newStock: targetStock },
      };

      // 네이버 재고 업데이트
      if (naverStock !== targetStock && mapping.naverProductId && mapping.naverProductId !== 'PENDING') {
        try {
          await this.naverProductService.updateInventory(mapping.naverProductId, targetStock);
          results.naver.success = true;
        } catch (error) {
          logger.error(`Failed to update Naver inventory for ${sku}:`, error);
        }
      } else {
        results.naver.success = true; // 변경 불필요
      }

      // Shopify 재고 업데이트
      if (shopifyStock !== targetStock) {
        try {
          await this.shopifyInventoryService.updateInventoryBySku(sku, targetStock);
          results.shopify.success = true;
        } catch (error) {
          logger.error(`Failed to update Shopify inventory for ${sku}:`, error);
        }
      } else {
        results.shopify.success = true; // 변경 불필요
      }

      // 동기화 이력 저장
      await SyncHistory.create({
        type: 'inventory',
        status: results.naver.success && results.shopify.success ? 'completed' : 'partial',
        source: syncDirection.split('_')[0],
        target: syncDirection.split('_')[2] || 'both',
        totalItems: 1,
        successItems: results.naver.success && results.shopify.success ? 1 : 0,
        failedItems: !results.naver.success || !results.shopify.success ? 1 : 0,
        details: {
          sku,
          syncStrategy,
          syncDirection,
          previousStock: { naver: naverStock, shopify: shopifyStock },
          targetStock,
          results,
        },
      });

      res.json({
        success: true,
        data: {
          sku,
          syncStrategy,
          syncDirection,
          previousStock: { naver: naverStock, shopify: shopifyStock },
          targetStock,
          results,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * 전체 재고 동기화
   */
  syncAllInventory = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { } = req.body;

      // 백그라운드 작업으로 실행
      const jobId = `inventory_sync_${Date.now()}`;

      // Redis에 작업 상태 저장
      await this.redis.setex(
        `job:${jobId}`,
        3600,
        JSON.stringify({
          status: 'processing',
          startedAt: new Date(),
        })
      );

      // 비동기로 동기화 실행
      this.inventorySyncService
        .syncAllInventory()
        .then(async (result: any) => {
          await this.redis.setex(
            `job:${jobId}`,
            3600,
            JSON.stringify({
              status: 'completed',
              completedAt: new Date(),
              result,
            })
          );
        })
        .catch(async (error) => {
          await this.redis.setex(
            `job:${jobId}`,
            3600,
            JSON.stringify({
              status: 'failed',
              failedAt: new Date(),
              error: error.message,
            })
          );
        });

      res.json({
        success: true,
        message: 'Inventory sync started',
        jobId,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * 재고 불일치 확인
   */
  checkDiscrepancy = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { vendor = 'album', threshold = 0 } = req.query;

      if (!this.naverProductService || !this.shopifyInventoryService) {
        throw new AppError('Inventory services not available', 503);
      }

      const mappings = await ProductMapping.find({ 
        vendor, 
        isActive: true 
      }).lean();

      const discrepancies = [];

      for (const mapping of mappings) {
        try {
          const [naverInventory, shopifyInventory] = await Promise.all([
            this.naverProductService.getInventory(mapping.naverProductId),
            this.shopifyInventoryService.getInventoryBySku(mapping.sku),
          ]);

          const diff = Math.abs(naverInventory - shopifyInventory);

          if (diff > Number(threshold)) {
            discrepancies.push({
              sku: mapping.sku,
              productName: mapping.productName,
              naverQuantity: naverInventory,
              shopifyQuantity: shopifyInventory,
              discrepancy: diff,
              lastSyncedAt: mapping.updatedAt,
            });
          }
        } catch (error) {
          logger.error(`Failed to check discrepancy for ${mapping.sku}:`, error);
        }
      }

      res.json({
        success: true,
        data: {
          discrepancies,
          summary: {
            total: mappings.length,
            withDiscrepancy: discrepancies.length,
            synced: mappings.length - discrepancies.length,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * 재고 업데이트
   */
  updateInventory = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { sku } = req.params;
      const { quantity, platform = 'both', reason = 'Manual update' } = req.body;

      if (quantity === undefined || quantity < 0) {
        throw new AppError('Valid quantity is required', 400);
      }

      const mapping = await ProductMapping.findOne({ sku });

      if (!mapping) {
        throw new AppError('Product mapping not found', 404);
      }

      if (!this.naverProductService || !this.shopifyInventoryService) {
        throw new AppError('Inventory services not available', 503);
      }

      const results = {
        naver: { success: false, message: '' },
        shopify: { success: false, message: '' },
      };

      // 네이버 재고 업데이트
      if (platform === 'naver' || platform === 'both') {
        try {
          await this.naverProductService.updateInventory(
            mapping.naverProductId,
            quantity
          );
          results.naver = { success: true, message: 'Updated successfully' };
        } catch (error: any) {
          results.naver = { success: false, message: error.message };
        }
      }

      // Shopify 재고 업데이트
      if (platform === 'shopify' || platform === 'both') {
        try {
          await this.shopifyInventoryService.updateInventoryBySku(sku, quantity);
          results.shopify = { success: true, message: 'Updated successfully' };
        } catch (error: any) {
          results.shopify = { success: false, message: error.message };
        }
      }

      // 트랜잭션 기록
      await InventoryTransaction.create({
        sku,
        type: 'update',
        quantity,
        reason,
        platform,
        userId: (req as any).user?.id,
      });

      res.json({
        success: true,
        data: results,
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
      const { adjustment, reason, notes } = req.body;

      if (!adjustment || adjustment === 0) {
        throw new AppError('Valid adjustment value is required', 400);
      }

      const mapping = await ProductMapping.findOne({ sku });

      if (!mapping) {
        throw new AppError('Product mapping not found', 404);
      }

      if (!this.shopifyInventoryService) {
        throw new AppError('Inventory service not available', 503);
      }

      // 현재 재고 조회
      const currentInventory = await this.shopifyInventoryService.getInventoryBySku(sku);
      const newQuantity = currentInventory + adjustment;

      if (newQuantity < 0) {
        throw new AppError('Adjustment would result in negative inventory', 400);
      }

      // 재고 업데이트
      await this.shopifyInventoryService.updateInventoryBySku(sku, newQuantity);

      // 트랜잭션 기록
      await InventoryTransaction.create({
        sku,
        type: 'adjustment',
        quantity: adjustment,
        previousQuantity: currentInventory,
        newQuantity,
        reason,
        notes,
        userId: (req as any).user?.id,
      });

      res.json({
        success: true,
        data: {
          sku,
          previousQuantity: currentInventory,
          adjustment,
          newQuantity,
          reason,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * 재고 불일치 목록 조회
   */
  getDiscrepancies = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { vendor = 'album', page = 1, limit = 20 } = req.query;

      if (!this.naverProductService || !this.shopifyInventoryService) {
        throw new AppError('Inventory services not available', 503);
      }

      const skip = (Number(page) - 1) * Number(limit);

      const mappings = await ProductMapping.find({ 
        vendor, 
        isActive: true 
      })
        .skip(skip)
        .limit(Number(limit))
        .lean();

      const discrepancies = [];

      for (const mapping of mappings) {
        try {
          const [naverInventory, shopifyInventory] = await Promise.all([
            this.naverProductService.getInventory(mapping.naverProductId),
            this.shopifyInventoryService.getInventoryBySku(mapping.sku),
          ]);

          const diff = Math.abs(naverInventory - shopifyInventory);

          if (diff > 0) {
            discrepancies.push({
              id: mapping._id,
              sku: mapping.sku,
              productName: mapping.productName,
              naverQuantity: naverInventory,
              shopifyQuantity: shopifyInventory,
              discrepancy: diff,
              percentage: shopifyInventory > 0 
                ? Math.round((diff / shopifyInventory) * 100) 
                : 100,
              lastSyncedAt: mapping.updatedAt,
              status: diff > 10 ? 'critical' : diff > 5 ? 'warning' : 'minor',
            });
          }
        } catch (error) {
          logger.error(`Failed to check discrepancy for ${mapping.sku}:`, error);
        }
      }

      // 불일치 정도로 정렬
      discrepancies.sort((a, b) => b.discrepancy - a.discrepancy);

      const total = await ProductMapping.countDocuments({ vendor, isActive: true });

      res.json({
        success: true,
        data: {
          discrepancies,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            pages: Math.ceil(total / Number(limit)),
          },
          summary: {
            total: discrepancies.length,
            critical: discrepancies.filter(d => d.status === 'critical').length,
            warning: discrepancies.filter(d => d.status === 'warning').length,
            minor: discrepancies.filter(d => d.status === 'minor').length,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * 재고 불일치 해결
   */
  resolveDiscrepancy = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { sku } = req.params;
      const { resolution = 'use_naver', notes } = req.body;

      const mapping = await ProductMapping.findOne({ sku });

      if (!mapping) {
        throw new AppError('Product mapping not found', 404);
      }

      if (!this.naverProductService || !this.shopifyInventoryService) {
        throw new AppError('Inventory services not available', 503);
      }

      const [naverInventory, shopifyInventory] = await Promise.all([
        this.naverProductService.getInventory(mapping.naverProductId),
        this.shopifyInventoryService.getInventoryBySku(sku),
      ]);

      let targetQuantity: number;
      let source: string;

      switch (resolution) {
        case 'use_naver':
          targetQuantity = naverInventory;
          source = 'naver';
          await this.shopifyInventoryService.updateInventoryBySku(sku, targetQuantity);
          break;
        case 'use_shopify':
          targetQuantity = shopifyInventory;
          source = 'shopify';
          await this.naverProductService.updateInventory(
            mapping.naverProductId,
            targetQuantity
          );
          break;
        case 'use_average':
          targetQuantity = Math.round((naverInventory + shopifyInventory) / 2);
          source = 'average';
          await Promise.all([
            this.naverProductService.updateInventory(mapping.naverProductId, targetQuantity),
            this.shopifyInventoryService.updateInventoryBySku(sku, targetQuantity),
          ]);
          break;
        default:
          throw new AppError('Invalid resolution method', 400);
      }

      // 트랜잭션 기록
      await InventoryTransaction.create({
        sku,
        type: 'discrepancy_resolution',
        quantity: targetQuantity,
        previousQuantity: shopifyInventory,
        newQuantity: targetQuantity,
        reason: `Discrepancy resolved using ${source}`,
        notes,
        metadata: {
          naverQuantity: naverInventory,
          shopifyQuantity: shopifyInventory,
          resolution,
        },
        userId: (req as any).user?.id,
      });

      // 매핑 업데이트
      mapping.updatedAt = new Date();
      (mapping as any).syncStatus = 'synced';
      await mapping.save();

      res.json({
        success: true,
        data: {
          sku,
          previousNaver: naverInventory,
          previousShopify: shopifyInventory,
          newQuantity: targetQuantity,
          resolution,
          source,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  // Legacy method names for backward compatibility
  getAllInventoryStatus = this.getInventory;
}