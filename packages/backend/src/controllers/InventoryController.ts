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
            // 네이버 재고 조회 - searchProducts 사용
            if (this.naverProductService && mapping.sku) {
              try {
                logger.info(`Fetching Naver inventory for SKU: ${mapping.sku}`);
                const searchResult = await this.naverProductService.searchProducts({
                  searchKeyword: mapping.sku,
                  searchType: 'SELLER_MANAGEMENT_CODE',
                  page: 1,
                  size: 10
                });
                
                logger.info(`Naver search result for ${mapping.sku}:`, {
                  found: searchResult?.contents?.length || 0,
                  firstProduct: searchResult?.contents?.[0] ? {
                    sellerManagementCode: searchResult.contents[0].sellerManagementCode,
                    stockQuantity: searchResult.contents[0].stockQuantity,
                    channelProducts: searchResult.contents[0].channelProducts?.map((cp: any) => ({
                      stockQuantity: cp.stockQuantity
                    }))
                  } : null
                });
                
                if (searchResult?.contents && searchResult.contents.length > 0) {
                  // EnhancedInventorySyncService와 동일한 로직 사용
                  for (const item of searchResult.contents) {
                    // channelProducts 체크
                    if (item.channelProducts && Array.isArray(item.channelProducts)) {
                      for (const channelProduct of item.channelProducts) {
                        const prodId = String(channelProduct.channelProductNo || channelProduct.productNo || '');
                        if (prodId === String(mapping.naverProductId)) {
                          naverStock = channelProduct.stockQuantity || 0;
                          logger.info(`✅ Naver inventory for ${mapping.sku}: ${naverStock} via channel products`);
                          break;
                        }
                      }
                      if (naverStock > 0) break;
                    }
                    
                    // 직접 상품 체크
                    const itemId = String(item.productNo || item.originProductNo || item.id || '');
                    if (itemId === String(mapping.naverProductId)) {
                      naverStock = item.stockQuantity || 0;
                      logger.info(`✅ Naver inventory for ${mapping.sku}: ${naverStock} via direct match`);
                      break;
                    }
                  }
                  
                  // ID 매칭 실패 시 첫 번째 결과 사용
                  if (naverStock === 0 && searchResult.contents.length > 0) {
                    const firstItem = searchResult.contents[0];
                    naverStock = firstItem.stockQuantity || 0;
                    logger.info(`✅ Naver inventory for ${mapping.sku}: ${naverStock} (using first match)`);
                  }
                } else {
                  logger.warn(`No product found for SKU ${mapping.sku} in Naver`);
                  naverStock = mapping.inventory?.naver?.available || 0;
                }
              } catch (error: any) {
                const errorMessage = error?.message || 'Unknown error';
                logger.error(`❌ Failed to search Naver inventory for ${mapping.sku}: ${errorMessage}`);
                // API 실패 시 기본값 사용
                naverStock = mapping.inventory?.naver?.available || 0;
              }
            } else {
              logger.warn(`No Naver product service for ${mapping.sku}`);
              naverStock = mapping.inventory?.naver?.available || 0;
            }
            
            // Shopify 재고 조회
            if (this.shopifyInventoryService && mapping.sku) {
              try {
                logger.info(`Fetching Shopify inventory for SKU: ${mapping.sku}`);
                shopifyStock = await this.shopifyInventoryService.getInventoryBySku(mapping.sku);
                logger.info(`✅ Shopify inventory for ${mapping.sku}: ${shopifyStock}`);
              } catch (error: any) {
                const errorMessage = error?.message || 'Unknown error';
                logger.error(`❌ Failed to get Shopify inventory for ${mapping.sku}: ${errorMessage}`);
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

      // 네이버 재고 조회 - searchProducts 사용
      let naverInventory = 0;
      try {
        const searchResult = await this.naverProductService.searchProducts({
          searchKeyword: sku,
          searchType: 'SELLER_MANAGEMENT_CODE',
          page: 1,
          size: 10
        });
        if (searchResult?.contents && searchResult.contents.length > 0) {
          naverInventory = searchResult.contents[0].stockQuantity || 0;
        }
      } catch (error) {
        logger.error(`Failed to search Naver inventory for ${sku}:`, error);
      }
      
      const shopifyInventory = await this.shopifyInventoryService.getInventoryBySku(sku);

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
            performedBy: 'system',
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
          // originProductNo 찾기
          let originProductNo = mapping.naverProductId;
          
          try {
            const searchResult = await this.naverProductService.searchProducts({
              searchKeyword: sku,
              searchType: 'SELLER_MANAGEMENT_CODE',
              page: 1,
              size: 10
            });
            
            if (searchResult?.contents && searchResult.contents.length > 0) {
              const product = searchResult.contents.find((p: any) => 
                p.channelProductNo === mapping.naverProductId || 
                p.sellerManagementCode === sku
              ) || searchResult.contents[0];
              
              if (product?.originProductNo) {
                originProductNo = product.originProductNo;
                logger.info(`Found originProductNo ${originProductNo} for SKU ${sku}`);
              }
            }
          } catch (searchError) {
            logger.warn(`Could not search for originProductNo, using mapped ID: ${originProductNo}`);
          }
          
          // updateProductStock 사용
          const success = await this.naverProductService.updateProductStock(originProductNo, targetStock);
          results.naver.success = success;
          
          if (success) {
            logger.info(`✅ Successfully synced Naver inventory for ${sku} to ${targetStock}`);
          } else {
            logger.error(`Failed to sync Naver inventory for ${sku}`);
          }
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
          // originProductNo 찾기
          let originProductNo = mapping.naverProductId;
          
          // SKU로 실제 originProductNo 찾기
          try {
            const searchResult = await this.naverProductService.searchProducts({
              searchKeyword: mapping.sku,
              searchType: 'SELLER_MANAGEMENT_CODE',
              page: 1,
              size: 10
            });
            
            if (searchResult?.contents && searchResult.contents.length > 0) {
              const product = searchResult.contents.find((p: any) => 
                p.channelProductNo === mapping.naverProductId || 
                p.sellerManagementCode === mapping.sku
              ) || searchResult.contents[0];
              
              if (product?.originProductNo) {
                originProductNo = product.originProductNo;
                logger.info(`Found originProductNo ${originProductNo} for SKU ${mapping.sku}`);
              }
            }
          } catch (searchError) {
            logger.warn(`Could not search for originProductNo, using mapped ID: ${originProductNo}`);
          }
          
          // updateProductStock 사용 (originProductNo로)
          const success = await this.naverProductService.updateProductStock(
            originProductNo,
            quantity
          );
          
          if (success) {
            results.naver = { success: true, message: 'Updated successfully' };
            logger.info(`✅ Successfully updated Naver inventory for ${mapping.sku} to ${quantity}`);
          } else {
            results.naver = { success: false, message: 'Update failed' };
            logger.error(`Failed to update Naver inventory for ${mapping.sku}`);
          }
        } catch (error: any) {
          results.naver = { success: false, message: error.message };
          logger.error(`Error updating Naver inventory: ${error.message}`);
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
      const { adjustment, adjustType = 'relative', platform = 'both', quantity, shopifyQuantity, naverQuantity, reason, notes } = req.body;
      
      // Handle different quantity parameter names from frontend
      const targetQuantity = quantity || shopifyQuantity || naverQuantity || 0;

      const mapping = await ProductMapping.findOne({ sku });

      if (!mapping) {
        throw new AppError('Product mapping not found', 404);
      }

      if (!this.shopifyInventoryService || !this.naverProductService) {
        throw new AppError('Inventory services not available', 503);
      }

      // 현재 재고 조회 및 originProductNo 가져오기
      let currentNaverStock = 0;
      let currentShopifyStock = 0;
      let naverOriginProductNo: string | null = null;
      let naverChannelProductNo: string | null = null;
      
      try {
        // 매핑 정보 확인
        const mappedChannelNo = mapping.naverProductId;  // 이것이 channelProductNo
        const mappedProductName = mapping.productName;
        
        logger.info(`🔍 Looking for mapped product:`, {
          sku,
          mappedChannelProductNo: mappedChannelNo,
          mappedProductName
        });
        
        // 1. 매핑된 ID로 직접 조회 시도 (이것이 originProductNo일 가능성이 높음)
        let correctProduct = null;
        let useOriginProductNo = mappedChannelNo;  // 매핑에 저장된 ID를 originProductNo로 사용
        
        try {
          // v2 API로 직접 조회 시도
          const directProduct = await this.naverProductService.getProduct(mappedChannelNo);
          if (directProduct) {
            logger.info(`✅ Found product by direct ID lookup: ${mappedChannelNo}`);
            correctProduct = directProduct;
            naverOriginProductNo = mappedChannelNo;  // 매핑된 ID를 originProductNo로 사용
            naverChannelProductNo = directProduct.channelProductNo || mappedChannelNo;
            currentNaverStock = directProduct.stockQuantity || 0;
          }
        } catch (directError) {
          logger.debug(`Direct lookup failed for ID ${mappedChannelNo}, will search by SKU`);
        }
        
        // 2. 직접 조회 실패 시 SKU로 검색
        if (!correctProduct) {
          const searchResult = await this.naverProductService.searchProducts({
            searchKeyword: sku,
            searchType: 'SELLER_MANAGEMENT_CODE',
            page: 1,
            size: 50  // 많은 결과 가져오기 (같은 SKU 상품이 여러 개)
          });
          
          if (searchResult?.contents && searchResult.contents.length > 0) {
            logger.info(`📋 Found ${searchResult.contents.length} products with SKU ${sku}`);
            
            // 검색 결과 모두 로깅
            searchResult.contents.forEach((p: any, idx: number) => {
              logger.debug(`  ${idx + 1}. ${p.name} (channel: ${p.channelProductNo}, origin: ${p.originProductNo})`);
            });
            
            // 매핑된 channelProductNo와 정확히 일치하는 상품 찾기
            correctProduct = searchResult.contents.find((p: any) => 
              p.channelProductNo === mappedChannelNo
            );
            
            if (correctProduct) {
              logger.info(`✅ Found exact match by channelProductNo: ${mappedChannelNo}`);
            } else {
              // channelProductNo 매칭 실패 시 상품명으로 찾기
              logger.info(`⚠️ No exact channelProductNo match, trying by product name`);
              
              // 정확한 상품명 일치
              correctProduct = searchResult.contents.find((p: any) => 
                p.name === mappedProductName && p.sellerManagementCode === sku
              );
              
              if (!correctProduct) {
                // 부분 상품명 일치 (첫 단어나 주요 키워드)
                correctProduct = searchResult.contents.find((p: any) => {
                  const nameMatch = p.name?.includes(mappedProductName) || 
                                   mappedProductName?.includes(p.name) ||
                                   (mappedProductName && p.name?.includes(mappedProductName.split(' ')[0]));
                  return p.sellerManagementCode === sku && nameMatch;
                });
              }
            }
            
            if (!correctProduct && mappedChannelNo) {
              // SKU 검색 실패 시 매핑된 ID를 그대로 사용
              logger.warn(`⚠️ SKU search didn't find exact match, will use mapped ID: ${mappedChannelNo}`);
              naverOriginProductNo = mappedChannelNo;  // 매핑된 ID를 originProductNo로 사용
              currentNaverStock = 0;  // 재고를 알 수 없으므로 0으로 설정
            } else if (!correctProduct) {
              logger.error(`❌ Cannot find product matching mapping:`, {
                sku,
                searchedChannelNo: mappedChannelNo,
                searchedProductName: mappedProductName,
                foundProducts: searchResult.contents.map((p: any) => ({
                  name: p.name,
                  channelNo: p.channelProductNo
                }))
              });
            }
          } else {
            logger.error(`❌ No products found for SKU ${sku}`);
          }
        }
        
        if (correctProduct) {
          currentNaverStock = correctProduct.stockQuantity || 0;
          naverOriginProductNo = correctProduct.originProductNo;
          naverChannelProductNo = correctProduct.channelProductNo;
          
          logger.info(`✅ Found correct Naver product for SKU ${sku}:`, {
            productName: correctProduct.name,
            channelProductNo: naverChannelProductNo,
            originProductNo: naverOriginProductNo,
            currentStock: currentNaverStock
          });
        } else {
          logger.warn(`⚠️ Could not find correct Naver product for SKU ${sku} with channelProductNo ${mappedChannelNo}`);
        }
      } catch (error: any) {
        const errorMessage = error?.message || 'Unknown error';
        logger.error(`Failed to get Naver inventory for adjustment: ${errorMessage}`);
      }
      
      currentShopifyStock = await this.shopifyInventoryService.getInventoryBySku(sku);

      // 새 재고 계산
      let newNaverStock = currentNaverStock;
      let newShopifyStock = currentShopifyStock;

      if (adjustType === 'set') {
        // 절대값으로 설정
        if (platform === 'naver' || platform === 'both') {
          newNaverStock = targetQuantity;
        }
        if (platform === 'shopify' || platform === 'both') {
          newShopifyStock = targetQuantity;
        }
      } else if (adjustType === 'relative') {
        // 상대적 조정
        const adjustmentValue = adjustment || 0;
        if (platform === 'naver' || platform === 'both') {
          newNaverStock = currentNaverStock + adjustmentValue;
        }
        if (platform === 'shopify' || platform === 'both') {
          newShopifyStock = currentShopifyStock + adjustmentValue;
        }
      } else if (adjustType === 'sync') {
        // 동기화 - 더 낮은 재고로 맞춤
        const minStock = Math.min(currentNaverStock, currentShopifyStock);
        newNaverStock = minStock;
        newShopifyStock = minStock;
      }

      // 음수 체크
      if (newNaverStock < 0 || newShopifyStock < 0) {
        throw new AppError('Adjustment would result in negative inventory', 400);
      }

      // 재고 업데이트 (개선된 버전)
      const updateResults = {
        naver: { success: false, error: null as any, previousStock: currentNaverStock, newStock: newNaverStock },
        shopify: { success: false, error: null as any, previousStock: currentShopifyStock, newStock: newShopifyStock }
      };
      
      // 네이버 재고 업데이트
      logger.info(`Naver update check: platform=${platform}, naverProductId=${mapping.naverProductId}`);
      if (platform === 'naver' || platform === 'both') {
        try {
          logger.info(`🔄 Updating Naver inventory for SKU ${sku}: ${currentNaverStock} -> ${newNaverStock}`);
          
          // originProductNo가 없으면 매핑된 ID 사용
          if (!naverOriginProductNo && mapping.naverProductId && mapping.naverProductId !== 'PENDING') {
            naverOriginProductNo = mapping.naverProductId;
            logger.info(`📦 Using mapped product ID as originProductNo: ${naverOriginProductNo}`);
          }
          
          if (!naverOriginProductNo) {
            updateResults.naver.error = 'No originProductNo found for this SKU';
            updateResults.naver.success = false;
            logger.error(`No originProductNo found for SKU ${sku}`);
          } else {
            try {
              logger.info(`🔄 Using originProductNo ${naverOriginProductNo} (from SKU ${sku}) to update Naver stock to ${newNaverStock}`);
              
              // originProductNo로 재고 업데이트
              const success = await this.naverProductService.updateProductStock(naverOriginProductNo, newNaverStock);
              
              if (success) {
                updateResults.naver.success = true;
                logger.info(`✅ Successfully updated Naver inventory for ${sku} to ${newNaverStock}`);
                
                // 업데이트 후 검증
                try {
                  await new Promise(resolve => setTimeout(resolve, 1000));
                  const verifyResult = await this.naverProductService.searchProducts({
                    searchKeyword: sku,
                    searchType: 'SELLER_MANAGEMENT_CODE',
                    page: 1,
                    size: 10
                  });
                  
                  if (verifyResult?.contents && verifyResult.contents.length > 0) {
                    const verifiedStock = verifyResult.contents[0].stockQuantity || 0;
                    if (verifiedStock === newNaverStock) {
                      logger.info(`✅ Verified Naver stock update for ${sku}: ${verifiedStock}`);
                    } else {
                      logger.warn(`⚠️ Naver stock verification mismatch for ${sku}. Expected: ${newNaverStock}, Got: ${verifiedStock}`);
                    }
                  }
                } catch (verifyError) {
                  logger.warn('Could not verify Naver stock update:', verifyError);
                }
              } else {
                updateResults.naver.error = 'Update returned false';
                logger.error(`Failed to update Naver inventory for ${sku}`);
              }
            } catch (error: any) {
              updateResults.naver.error = error.message || 'Update failed';
              updateResults.naver.success = false;
              logger.error(`Failed to update Naver inventory for ${sku}:`, error);
            }
          }
        } catch (err: any) {
          updateResults.naver.error = err?.message || 'Unknown error';
          logger.error(`❌ Failed to update Naver inventory for ${sku}: ${updateResults.naver.error}`, err);
        }
      }
      
      // Shopify 재고 업데이트  
      if (platform === 'shopify' || platform === 'both') {
        try {
          logger.info(`🔄 Updating Shopify inventory for SKU ${sku}: ${currentShopifyStock} -> ${newShopifyStock}`);
          
          const success = await this.shopifyInventoryService.updateInventoryBySku(sku, newShopifyStock);
          
          if (success) {
            updateResults.shopify.success = true;
            logger.info(`✅ Successfully updated Shopify inventory for ${sku} to ${newShopifyStock}`);
            
            // 업데이트 후 검증
            try {
              await new Promise(resolve => setTimeout(resolve, 1000));
              const verifiedStock = await this.shopifyInventoryService.getInventoryBySku(sku);
              if (verifiedStock === newShopifyStock) {
                logger.info(`✅ Verified Shopify stock update for ${sku}: ${verifiedStock}`);
              } else {
                logger.warn(`⚠️ Shopify stock verification mismatch for ${sku}. Expected: ${newShopifyStock}, Got: ${verifiedStock}`);
              }
            } catch (verifyError) {
              logger.warn('Could not verify Shopify stock update:', verifyError);
            }
          } else {
            updateResults.shopify.error = 'Update returned false';
            logger.error(`Failed to update Shopify inventory for ${sku}`);
          }
        } catch (err: any) {
          updateResults.shopify.error = err?.message || 'Unknown error';
          logger.error(`❌ Failed to update Shopify inventory for ${sku}: ${updateResults.shopify.error}`, err);
        }
      }

      // 트랜잭션 기록
      const transactionQuantity = adjustType === 'set' 
        ? (quantity || 0) 
        : (adjustment || 0);
      
      await InventoryTransaction.create({
        sku,
        type: 'adjustment',
        transactionType: 'adjustment',
        platform: platform as any,
        quantity: transactionQuantity,
        previousQuantity: platform === 'naver' ? currentNaverStock : currentShopifyStock,
        newQuantity: platform === 'naver' ? newNaverStock : newShopifyStock,
        reason,
        notes,
        performedBy: 'system',
        metadata: {
          adjustmentType: adjustType,
          platform,
          naverStock: { previous: currentNaverStock, new: newNaverStock },
          shopifyStock: { previous: currentShopifyStock, new: newShopifyStock },
          notes
        }
      });

      // MongoDB 업데이트
      await ProductMapping.updateOne(
        { _id: mapping._id },
        {
          $set: {
            'inventory.naver.available': newNaverStock,
            'inventory.shopify.available': newShopifyStock,
            'inventory.lastSync': new Date(),
            'inventory.discrepancy': Math.abs(newNaverStock - newShopifyStock),
            'inventory.syncStatus': newNaverStock === newShopifyStock ? 'synced' : 'out_of_sync',
          },
        }
      );

      res.json({
        success: true,
        data: {
          sku,
          adjustType,
          platform,
          previous: {
            naver: currentNaverStock,
            shopify: currentShopifyStock
          },
          current: {
            naver: newNaverStock,
            shopify: newShopifyStock
          },
          adjustment: adjustType === 'set' ? quantity : adjustment,
          reason,
          updateResults
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
          
          // originProductNo 찾기
          let originProductNo = mapping.naverProductId;
          try {
            const searchResult = await this.naverProductService.searchProducts({
              searchKeyword: sku,
              searchType: 'SELLER_MANAGEMENT_CODE',
              page: 1,
              size: 10
            });
            
            if (searchResult?.contents && searchResult.contents.length > 0) {
              const product = searchResult.contents.find((p: any) => 
                p.channelProductNo === mapping.naverProductId || 
                p.sellerManagementCode === sku
              ) || searchResult.contents[0];
              
              if (product?.originProductNo) {
                originProductNo = product.originProductNo;
              }
            }
          } catch (searchError) {
            logger.warn(`Could not search for originProductNo, using mapped ID`);
          }
          
          await this.naverProductService.updateProductStock(
            originProductNo,
            targetQuantity
          );
          break;
        case 'use_average':
          targetQuantity = Math.round((naverInventory + shopifyInventory) / 2);
          source = 'average';
          
          // originProductNo 찾기 (use_average에서도 필요)
          let avgOriginProductNo = mapping.naverProductId;
          try {
            const searchResult = await this.naverProductService.searchProducts({
              searchKeyword: sku,
              searchType: 'SELLER_MANAGEMENT_CODE',
              page: 1,
              size: 10
            });
            
            if (searchResult?.contents && searchResult.contents.length > 0) {
              const product = searchResult.contents.find((p: any) => 
                p.channelProductNo === mapping.naverProductId || 
                p.sellerManagementCode === sku
              ) || searchResult.contents[0];
              
              if (product?.originProductNo) {
                avgOriginProductNo = product.originProductNo;
              }
            }
          } catch (searchError) {
            logger.warn(`Could not search for originProductNo, using mapped ID`);
          }
          
          await Promise.all([
            this.naverProductService.updateProductStock(avgOriginProductNo, targetQuantity),
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