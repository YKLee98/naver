// packages/backend/src/controllers/ProductController.ts
import { Request, Response, NextFunction } from 'express';
import { ProductMapping, SyncHistory, SystemLog } from '../models';
import { NaverProductService } from '../services/naver';
import { ShopifyGraphQLService } from '../services/shopify';
import { PriceSyncService } from '../services/sync/PriceSyncService';
import { InventorySyncService } from '../services/sync/InventorySyncService';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';
import { getRedisClient } from '../config/redis';

interface SyncOptions {
  syncPrice?: boolean;
  syncInventory?: boolean;
  syncImages?: boolean;
  syncDescription?: boolean;
  forceUpdate?: boolean;
}

interface SyncResult {
  success: boolean;
  sku: string;
  syncedFields: string[];
  changes: {
    price?: { old: number; new: number };
    inventory?: { old: number; new: number };
    images?: { added: number; removed: number };
    description?: boolean;
  };
  errors: string[];
  timestamp: Date;
}

export class ProductController {
  private naverProductService: NaverProductService;
  private shopifyGraphQLService: ShopifyGraphQLService;
  private priceSyncService: PriceSyncService;
  private inventorySyncService: InventorySyncService;
  private redis: any;

  constructor(
    naverProductService: NaverProductService,
    shopifyGraphQLService: ShopifyGraphQLService
  ) {
    this.naverProductService = naverProductService;
    this.shopifyGraphQLService = shopifyGraphQLService;
    this.redis = getRedisClient();

    // 동기화 서비스 초기화
    this.priceSyncService = new PriceSyncService(
      this.redis,
      naverProductService,
      shopifyGraphQLService
    );

    this.inventorySyncService = new InventorySyncService(
      naverProductService,
      shopifyGraphQLService
    );
  }

  /**
   * 상품 목록 조회
   */
  getMappedProducts = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const {
        page = 1,
        limit = 20,
        vendor = 'album',
        isActive,
        syncStatus,
        search,
      } = req.query;

      const query: any = { vendor };

      if (isActive !== undefined) {
        query.isActive = isActive === 'true';
      }

      if (syncStatus) {
        query.syncStatus = syncStatus;
      }

      if (search) {
        query.$or = [
          { sku: { $regex: search, $options: 'i' } },
          { productName: { $regex: search, $options: 'i' } },
        ];
      }

      const skip = (Number(page) - 1) * Number(limit);

      const [products, total] = await Promise.all([
        ProductMapping.find(query)
          .sort({ updatedAt: -1 })
          .skip(skip)
          .limit(Number(limit))
          .lean(),
        ProductMapping.countDocuments(query),
      ]);

      res.json({
        success: true,
        data: {
          products,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            pages: Math.ceil(total / Number(limit)),
          },
        },
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * 상품 상세 조회
   */
  getProductBySku = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { sku } = req.params;

      const mapping = await ProductMapping.findOne({ sku }).lean();

      if (!mapping) {
        throw new AppError('Product mapping not found', 404);
      }

      // 실시간 정보 조회
      const [naverProduct, shopifyVariant] = await Promise.all([
        this.naverProductService.getProductById(mapping.naverProductId),
        this.shopifyGraphQLService.findVariantBySku(sku),
      ]);

      res.json({
        success: true,
        data: {
          mapping,
          naverProduct,
          shopifyVariant,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * 네이버 상품 검색
   */
  searchNaverProducts = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { keyword, page = 1, limit = 20 } = req.query;

      if (!keyword) {
        throw new AppError('Search keyword is required', 400);
      }

      const products = await this.naverProductService.searchProducts(
        String(keyword),
        {
          page: Number(page),
          limit: Number(limit),
        }
      );

      res.json({
        success: true,
        data: products,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Shopify 상품 검색
   */
  searchShopifyProducts = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { query, first = 20 } = req.query;

      if (!query) {
        throw new AppError('Search query is required', 400);
      }

      const products = await this.shopifyGraphQLService.searchProducts(
        String(query),
        Number(first)
      );

      res.json({
        success: true,
        data: products,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * 상품 매핑 업데이트
   */
  updateProductMapping = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { sku } = req.params;
      const updateData = req.body;

      const mapping = await ProductMapping.findOne({ sku });

      if (!mapping) {
        throw new AppError('Product mapping not found', 404);
      }

      // 업데이트 허용 필드만 추출
      const allowedFields = ['isActive', 'priceMargin', 'syncOptions'];
      const updates: any = {};

      for (const field of allowedFields) {
        if (updateData[field] !== undefined) {
          updates[field] = updateData[field];
        }
      }

      Object.assign(mapping, updates);
      await mapping.save();

      res.json({
        success: true,
        data: mapping,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * 상품 동기화 - 실제 구현
   */
  syncProduct = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { sku } = req.params;
      const {
        syncPrice = true,
        syncInventory = true,
        syncImages = false,
        syncDescription = false,
        forceUpdate = false,
      }: SyncOptions = req.body;

      // 매핑 정보 조회
      const mapping = await ProductMapping.findOne({ sku });

      if (!mapping) {
        throw new AppError('Product mapping not found', 404);
      }

      if (!mapping.isActive && !forceUpdate) {
        throw new AppError(
          'Product mapping is not active. Use forceUpdate to sync inactive products.',
          400
        );
      }

      // 동기화 중복 체크 (Redis를 이용한 락)
      const lockKey = `sync:lock:${sku}`;
      const lockExists = await this.redis.get(lockKey);

      if (lockExists) {
        throw new AppError('Sync already in progress for this SKU', 409);
      }

      // 락 설정 (5분 TTL)
      await this.redis.setex(lockKey, 300, Date.now());

      const syncResult: SyncResult = {
        success: false,
        sku,
        syncedFields: [],
        changes: {},
        errors: [],
        timestamp: new Date(),
      };

      try {
        logger.info(`Starting sync for SKU: ${sku}`, { syncOptions: req.body });

        // 동기화 상태 업데이트
        mapping.syncStatus = 'syncing';
        await mapping.save();

        // 네이버와 Shopify 상품 정보 조회
        const [naverProduct, shopifyVariant] = await Promise.all([
          this.naverProductService.getProductById(mapping.naverProductId),
          this.shopifyGraphQLService.findVariantBySku(sku),
        ]);

        if (!naverProduct) {
          throw new AppError('Naver product not found', 404);
        }

        if (!shopifyVariant) {
          throw new AppError('Shopify variant not found', 404);
        }

        // 1. 가격 동기화
        if (syncPrice) {
          try {
            logger.info(`Syncing price for SKU: ${sku}`);

            const oldPrice = parseFloat(shopifyVariant.price);
            const priceResult = await this.priceSyncService.syncSinglePrice(
              sku,
              {
                marginRate: mapping.priceMargin || 10,
                roundTo: 100,
                includeShipping: true,
              }
            );

            if (priceResult.success) {
              syncResult.syncedFields.push('price');
              syncResult.changes.price = {
                old: oldPrice,
                new: priceResult.newPrice || oldPrice,
              };
              logger.info(`Price synced for SKU: ${sku}`, priceResult);
            } else {
              syncResult.errors.push(`Price sync failed: ${priceResult.error}`);
            }
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : 'Unknown error';
            syncResult.errors.push(`Price sync error: ${errorMessage}`);
            logger.error(`Price sync failed for SKU: ${sku}`, error);
          }
        }

        // 2. 재고 동기화
        if (syncInventory) {
          try {
            logger.info(`Syncing inventory for SKU: ${sku}`);

            const oldInventory = shopifyVariant.inventoryQuantity || 0;
            const inventoryResult =
              await this.inventorySyncService.syncInventoryBySku(sku);

            if (inventoryResult.success) {
              syncResult.syncedFields.push('inventory');
              syncResult.changes.inventory = {
                old: oldInventory,
                new: inventoryResult.newQuantity || oldInventory,
              };
              logger.info(`Inventory synced for SKU: ${sku}`, inventoryResult);
            } else {
              syncResult.errors.push(
                `Inventory sync failed: ${inventoryResult.error}`
              );
            }
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : 'Unknown error';
            syncResult.errors.push(`Inventory sync error: ${errorMessage}`);
            logger.error(`Inventory sync failed for SKU: ${sku}`, error);
          }
        }

        // 3. 이미지 동기화
        if (syncImages) {
          try {
            logger.info(`Syncing images for SKU: ${sku}`);

            // 네이버 상품 이미지 가져오기
            const naverImages = naverProduct.images || [];

            if (naverImages.length > 0) {
              // Shopify에 이미지 업데이트
              const imageUpdateResult =
                await this.shopifyGraphQLService.updateProductImages(
                  shopifyVariant.product?.id || '',
                  naverImages
                );

              if (imageUpdateResult.success) {
                syncResult.syncedFields.push('images');
                syncResult.changes.images = {
                  added: imageUpdateResult.added || 0,
                  removed: imageUpdateResult.removed || 0,
                };
                logger.info(`Images synced for SKU: ${sku}`, imageUpdateResult);
              } else {
                syncResult.errors.push('Image sync failed');
              }
            }
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : 'Unknown error';
            syncResult.errors.push(`Image sync error: ${errorMessage}`);
            logger.error(`Image sync failed for SKU: ${sku}`, error);
          }
        }

        // 4. 설명 동기화
        if (syncDescription) {
          try {
            logger.info(`Syncing description for SKU: ${sku}`);

            const descriptionResult =
              await this.shopifyGraphQLService.updateProductDescription(
                shopifyVariant.product?.id || '',
                naverProduct.description || ''
              );

            if (descriptionResult.success) {
              syncResult.syncedFields.push('description');
              syncResult.changes.description = true;
              logger.info(`Description synced for SKU: ${sku}`);
            } else {
              syncResult.errors.push('Description sync failed');
            }
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : 'Unknown error';
            syncResult.errors.push(`Description sync error: ${errorMessage}`);
            logger.error(`Description sync failed for SKU: ${sku}`, error);
          }
        }

        // 동기화 성공 여부 판단
        syncResult.success = syncResult.syncedFields.length > 0;

        // 매핑 정보 업데이트
        mapping.syncStatus = syncResult.success ? 'success' : 'failed';
        mapping.lastSyncAt = new Date();
        mapping.lastSyncResult = {
          success: syncResult.success,
          syncedFields: syncResult.syncedFields,
          errors: syncResult.errors,
        };
        await mapping.save();

        // 동기화 이력 저장
        await SyncHistory.create({
          sku,
          vendor: mapping.vendor,
          syncType: 'manual',
          status: syncResult.success ? 'success' : 'failed',
          details: {
            syncedFields: syncResult.syncedFields,
            changes: syncResult.changes,
            errors: syncResult.errors,
          },
          duration: Date.now() - syncResult.timestamp.getTime(),
        });

        // 시스템 로그 저장
        await SystemLog.create({
          level: syncResult.success ? 'info' : 'warn',
          category: 'sync',
          message: `Product sync ${syncResult.success ? 'completed' : 'failed'} for SKU: ${sku}`,
          context: {
            service: 'ProductController',
            method: 'syncProduct',
          },
          metadata: syncResult,
        });

        logger.info(`Sync completed for SKU: ${sku}`, syncResult);
      } finally {
        // 락 해제
        await this.redis.del(lockKey);
      }

      res.json({
        success: syncResult.success,
        message: syncResult.success
          ? `Product sync completed successfully for SKU: ${sku}`
          : `Product sync completed with errors for SKU: ${sku}`,
        data: syncResult,
      });
    } catch (error) {
      logger.error(`Sync failed for SKU: ${req.params.sku}`, error);
      next(error);
    }
  };

  /**
   * 대량 동기화
   */
  bulkSyncProducts = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const {
        skus,
        syncOptions = {},
      }: { skus: string[]; syncOptions: SyncOptions } = req.body;

      if (!skus || !Array.isArray(skus) || skus.length === 0) {
        throw new AppError('SKUs array is required', 400);
      }

      if (skus.length > 100) {
        throw new AppError('Maximum 100 SKUs can be synced at once', 400);
      }

      const results = [];

      for (const sku of skus) {
        try {
          // 각 SKU에 대해 개별 동기화 실행
          const mapping = await ProductMapping.findOne({ sku });

          if (!mapping) {
            results.push({
              sku,
              success: false,
              error: 'Mapping not found',
            });
            continue;
          }

          // 가격 동기화
          if (syncOptions.syncPrice) {
            const priceResult = await this.priceSyncService.syncSinglePrice(
              sku,
              {
                marginRate: mapping.priceMargin || 10,
              }
            );

            results.push({
              sku,
              success: priceResult.success,
              type: 'price',
              changes: priceResult,
            });
          }

          // 재고 동기화
          if (syncOptions.syncInventory) {
            const inventoryResult =
              await this.inventorySyncService.syncInventoryBySku(sku);

            results.push({
              sku,
              success: inventoryResult.success,
              type: 'inventory',
              changes: inventoryResult,
            });
          }
        } catch (error) {
          results.push({
            sku,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      const successCount = results.filter((r) => r.success).length;
      const failedCount = results.filter((r) => !r.success).length;

      res.json({
        success: true,
        message: `Bulk sync completed. Success: ${successCount}, Failed: ${failedCount}`,
        data: {
          totalProcessed: skus.length,
          successCount,
          failedCount,
          results,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * 동기화 이력 조회
   */
  getSyncHistory = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { sku } = req.params;
      const { limit = 50, startDate, endDate } = req.query;

      const query: any = { sku };

      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(String(startDate));
        if (endDate) query.createdAt.$lte = new Date(String(endDate));
      }

      const history = await SyncHistory.find(query)
        .sort({ createdAt: -1 })
        .limit(Number(limit))
        .lean();

      res.json({
        success: true,
        data: history,
      });
    } catch (error) {
      next(error);
    }
  };
}
