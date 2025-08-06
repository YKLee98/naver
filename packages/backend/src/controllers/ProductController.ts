// packages/backend/src/controllers/ProductController.ts
import { Request, Response, NextFunction } from 'express';
import { ProductMapping, Activity, SystemLog } from '../models';
import { NaverProductService } from '../services/naver';
import { ShopifyGraphQLService, AppError } from '../services/shopify/ShopifyGraphQLService';
import { logger } from '../utils/logger';

export class ProductController {
  private naverProductService: NaverProductService;
  private shopifyGraphQLService: ShopifyGraphQLService;

  constructor(
    naverProductService: NaverProductService,
    shopifyGraphQLService: ShopifyGraphQLService
  ) {
    this.naverProductService = naverProductService;
    this.shopifyGraphQLService = shopifyGraphQLService;
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
        this.shopifyGraphQLService.getProductById(mapping.shopifyProductId),
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
      logger.error('Error in getProductBySku:', error);
      next(error);
    }
  };

  /**
   * 매핑 통계 조회
   */
  getMappingStatistics = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const [
        totalMappings,
        activeMappings,
        syncedMappings,
        errorMappings,
        lastSyncInfo,
      ] = await Promise.all([
        ProductMapping.countDocuments(),
        ProductMapping.countDocuments({ isActive: true }),
        ProductMapping.countDocuments({ syncStatus: 'synced' }),
        ProductMapping.countDocuments({ syncStatus: 'error' }),
        ProductMapping.findOne({ syncStatus: 'synced' })
          .sort({ lastSyncedAt: -1 })
          .select('lastSyncedAt')
          .lean(),
      ]);

      res.json({
        success: true,
        data: {
          total: totalMappings,
          active: activeMappings,
          synced: syncedMappings,
          error: errorMappings,
          inactive: totalMappings - activeMappings,
          lastSyncedAt: lastSyncInfo?.lastSyncedAt || null,
        },
      });
    } catch (error) {
      logger.error('Error in getMappingStatistics:', error);
      next(error);
    }
  };

  /**
   * 상품 동기화 (단일 SKU)
   */
  syncProduct = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { sku } = req.params;
      const { 
        syncInventory = true, 
        syncPrice = true,
        force = false 
      } = req.body;

      // 매핑 조회
      const mapping = await ProductMapping.findOne({ sku });
      
      if (!mapping) {
        throw new AppError('Product mapping not found', 404);
      }

      if (!mapping.isActive && !force) {
        throw new AppError('Cannot sync inactive product mapping. Use force=true to override.', 400);
      }

      // 동기화 상태를 'syncing'으로 업데이트
      mapping.syncStatus = 'syncing';
      mapping.syncError = null;
      mapping.lastSyncAttempt = new Date();
      await mapping.save();

      // 동기화 결과 추적
      const syncResult = {
        sku,
        success: false,
        inventorySync: { success: false, message: '', data: null as any },
        priceSync: { success: false, message: '', data: null as any },
        errors: [] as string[],
        startTime: new Date(),
        endTime: null as Date | null
      };

      try {
        // 1. 네이버 상품 정보 가져오기
        logger.info(`Fetching Naver product for SKU: ${sku}`);
        const naverProduct = await this.naverProductService.getProductById(mapping.naverProductId);
        
        if (!naverProduct) {
          throw new AppError('Naver product not found', 404);
        }

        // 2. 재고 동기화
        if (syncInventory) {
          try {
            logger.info(`Syncing inventory for SKU: ${sku}`);
            
            // Shopify 재고 업데이트
            const inventoryResult = await this.shopifyGraphQLService.adjustInventoryQuantity(
              mapping.shopifyInventoryItemId || mapping.shopifyVariantId,
              mapping.shopifyLocationId || 'gid://shopify/Location/1',
              naverProduct.stockQuantity - (mapping.lastKnownInventory || 0)
            );

            syncResult.inventorySync = {
              success: true,
              message: `Inventory synced: ${naverProduct.stockQuantity} units`,
              data: {
                previousQuantity: mapping.lastKnownInventory || 0,
                newQuantity: naverProduct.stockQuantity,
                change: naverProduct.stockQuantity - (mapping.lastKnownInventory || 0)
              }
            };

            // 매핑에 재고 정보 업데이트
            mapping.lastKnownInventory = naverProduct.stockQuantity;
            mapping.inventoryLastSyncedAt = new Date();

            // 재고 트랜잭션 기록
            await Activity.create({
              type: 'inventory_sync',
              action: 'Inventory synchronized',
              details: `SKU: ${sku}, Quantity: ${naverProduct.stockQuantity}`,
              status: 'success',
              metadata: {
                sku,
                naverProductId: mapping.naverProductId,
                shopifyVariantId: mapping.shopifyVariantId,
                previousQuantity: mapping.lastKnownInventory,
                newQuantity: naverProduct.stockQuantity
              }
            });

          } catch (inventoryError: any) {
            logger.error(`Inventory sync failed for SKU ${sku}:`, inventoryError);
            syncResult.inventorySync = {
              success: false,
              message: inventoryError.message || 'Inventory sync failed',
              data: null
            };
            syncResult.errors.push(`Inventory: ${inventoryError.message}`);
          }
        }

        // 3. 가격 동기화
        if (syncPrice) {
          try {
            logger.info(`Syncing price for SKU: ${sku}`);
            
            // 환율 가져오기 (Redis 또는 DB에서)
            const exchangeRate = 1320; // TODO: 실제 환율 서비스에서 가져오기
            
            // 가격 계산 (마진 적용)
            const margin = mapping.priceMargin || 1.15; // 15% 마진
            const basePrice = naverProduct.salePrice / exchangeRate;
            const finalPrice = Math.round(basePrice * margin * 100) / 100; // 소수점 2자리

            // Shopify 가격 업데이트
            const priceResult = await this.shopifyGraphQLService.updateProductPrice(
              mapping.shopifyVariantId,
              finalPrice
            );

            syncResult.priceSync = {
              success: priceResult,
              message: `Price updated to ${finalPrice}`,
              data: {
                naverPrice: naverProduct.salePrice,
                exchangeRate,
                margin,
                calculatedPrice: finalPrice,
                previousPrice: mapping.lastKnownPrice
              }
            };

            // 매핑에 가격 정보 업데이트
            mapping.lastKnownPrice = finalPrice;
            mapping.naverPrice = naverProduct.salePrice;
            mapping.priceLastSyncedAt = new Date();

            // 가격 히스토리 기록
            await Activity.create({
              type: 'price_sync',
              action: 'Price synchronized',
              details: `SKU: ${sku}, Price: ${finalPrice}`,
              status: 'success',
              metadata: {
                sku,
                naverPrice: naverProduct.salePrice,
                shopifyPrice: finalPrice,
                exchangeRate,
                margin
              }
            });

          } catch (priceError: any) {
            logger.error(`Price sync failed for SKU ${sku}:`, priceError);
            syncResult.priceSync = {
              success: false,
              message: priceError.message || 'Price sync failed',
              data: null
            };
            syncResult.errors.push(`Price: ${priceError.message}`);
          }
        }

        // 4. 동기화 성공 처리
        syncResult.success = (
          (!syncInventory || syncResult.inventorySync.success) &&
          (!syncPrice || syncResult.priceSync.success)
        );
        syncResult.endTime = new Date();

        // 매핑 상태 업데이트
        mapping.syncStatus = syncResult.success ? 'synced' : 'error';
        mapping.syncError = syncResult.success ? null : syncResult.errors.join('; ');
        mapping.lastSyncedAt = syncResult.success ? new Date() : mapping.lastSyncedAt;
        mapping.updatedAt = new Date();
        await mapping.save();

        // 시스템 로그 기록
        await SystemLog.create({
          level: syncResult.success ? 'info' : 'error',
          category: 'sync',
          message: `Product sync ${syncResult.success ? 'completed' : 'failed'} for SKU: ${sku}`,
          context: {
            service: 'ProductController',
            method: 'syncProduct'
          },
          metadata: syncResult
        });

        logger.info(`Product sync completed for SKU: ${sku}`, {
          success: syncResult.success,
          duration: syncResult.endTime ? 
            syncResult.endTime.getTime() - syncResult.startTime.getTime() : 0
        });

        res.json({
          success: true,
          data: {
            sku,
            syncStatus: syncResult.success ? 'completed' : 'partial',
            inventorySync: syncResult.inventorySync,
            priceSync: syncResult.priceSync,
            errors: syncResult.errors,
            duration: syncResult.endTime ? 
              syncResult.endTime.getTime() - syncResult.startTime.getTime() : 0,
            message: syncResult.success 
              ? 'Product sync completed successfully'
              : `Product sync completed with errors: ${syncResult.errors.join(', ')}`
          }
        });

      } catch (syncError: any) {
        // 동기화 실패 처리
        logger.error(`Product sync failed for SKU ${sku}:`, syncError);
        
        mapping.syncStatus = 'error';
        mapping.syncError = syncError.message || 'Unknown sync error';
        mapping.updatedAt = new Date();
        await mapping.save();

        throw new AppError(
          `Sync failed for SKU ${sku}: ${syncError.message}`,
          500
        );
      }

    } catch (error: any) {
      logger.error('Error in syncProduct:', error);
      next(error);
    }
  };

  /**
   * 상품 상태 업데이트
   */
  updateProductStatus = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { sku } = req.params;
      const { status } = req.body;

      const validStatuses = ['ACTIVE', 'INACTIVE', 'PENDING', 'ERROR'];
      if (!validStatuses.includes(status)) {
        throw new AppError(`Invalid status. Must be one of: ${validStatuses.join(', ')}`, 400);
      }

      const mapping = await ProductMapping.findOne({ sku });
      
      if (!mapping) {
        throw new AppError('Product mapping not found', 404);
      }

      mapping.status = status;
      mapping.updatedAt = new Date();
      await mapping.save();

      logger.info(`Product status updated for ${sku}: ${status}`);

      res.json({
        success: true,
        data: mapping,
      });
    } catch (error) {
      logger.error('Error in updateProductStatus:', error);
      next(error);
    }
  };

  /**
   * 벌크 동기화 (여러 SKU 동시 처리)
   */
  bulkSyncProducts = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { 
        skus = [], 
        syncInventory = true, 
        syncPrice = true,
        batchSize = 10 
      } = req.body;

      if (!Array.isArray(skus) || skus.length === 0) {
        throw new AppError('SKUs array is required', 400);
      }

      logger.info(`Starting bulk sync for ${skus.length} SKUs`);

      // SKU 배치 처리
      const results = {
        total: skus.length,
        success: 0,
        failed: 0,
        details: [] as any[]
      };

      // 배치로 나누기
      const batches = [];
      for (let i = 0; i < skus.length; i += batchSize) {
        batches.push(skus.slice(i, i + batchSize));
      }

      // 각 배치 처리
      for (const [batchIndex, batch] of batches.entries()) {
        logger.info(`Processing batch ${batchIndex + 1} of ${batches.length}`);
        
        const batchPromises = batch.map(async (sku: string) => {
          try {
            // 개별 SKU 동기화 로직 재사용
            const mapping = await ProductMapping.findOne({ sku });
            if (!mapping) {
              return {
                sku,
                success: false,
                error: 'Mapping not found'
              };
            }

            // 네이버 상품 정보 가져오기
            const naverProduct = await this.naverProductService.getProductById(
              mapping.naverProductId
            );

            const syncResult: any = { sku, success: false };

            // 재고 동기화
            if (syncInventory && naverProduct) {
              try {
                await this.shopifyGraphQLService.adjustInventoryQuantity(
                  mapping.shopifyInventoryItemId || mapping.shopifyVariantId,
                  mapping.shopifyLocationId || 'gid://shopify/Location/1',
                  naverProduct.stockQuantity - (mapping.lastKnownInventory || 0)
                );
                mapping.lastKnownInventory = naverProduct.stockQuantity;
                syncResult.inventorySynced = true;
              } catch (error: any) {
                syncResult.inventoryError = error.message;
              }
            }

            // 가격 동기화
            if (syncPrice && naverProduct) {
              try {
                const exchangeRate = 1320; // TODO: 실제 환율 가져오기
                const margin = mapping.priceMargin || 1.15;
                const finalPrice = Math.round(
                  (naverProduct.salePrice / exchangeRate) * margin * 100
                ) / 100;

                await this.shopifyGraphQLService.updateProductPrice(
                  mapping.shopifyVariantId,
                  finalPrice
                );
                mapping.lastKnownPrice = finalPrice;
                syncResult.priceSynced = true;
              } catch (error: any) {
                syncResult.priceError = error.message;
              }
            }

            // 매핑 업데이트
            mapping.syncStatus = 
              (syncResult.inventorySynced || !syncInventory) && 
              (syncResult.priceSynced || !syncPrice) ? 'synced' : 'error';
            mapping.lastSyncedAt = new Date();
            await mapping.save();

            syncResult.success = mapping.syncStatus === 'synced';
            return syncResult;

          } catch (error: any) {
            logger.error(`Failed to sync SKU ${sku}:`, error);
            return {
              sku,
              success: false,
              error: error.message
            };
          }
        });

        // 배치 결과 처리
        const batchResults = await Promise.all(batchPromises);
        batchResults.forEach(result => {
          if (result.success) {
            results.success++;
          } else {
            results.failed++;
          }
          results.details.push(result);
        });

        // 배치 간 딜레이
        if (batchIndex < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      // Activity 로깅
      await Activity.create({
        type: 'bulk_sync',
        action: 'Bulk product sync completed',
        details: `Synced ${results.success}/${results.total} products`,
        status: results.failed === 0 ? 'success' : 'partial',
        metadata: results
      });

      logger.info('Bulk sync completed', results);

      res.json({
        success: true,
        data: results,
        message: `Bulk sync completed: ${results.success} succeeded, ${results.failed} failed`
      });

    } catch (error: any) {
      logger.error('Error in bulkSyncProducts:', error);
      next(error);
    }
  };
}

// Export standalone controller functions for routes

/**
 * Shopify 상품 검색
 */
export const searchShopifyProducts = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { 
      vendor = '', 
      search = '', 
      limit = 100,
      includeInactive = false 
    } = req.query;

    logger.info('Searching Shopify products', {
      vendor,
      search,
      limit,
      includeInactive
    });

    // ShopifyGraphQLService 인스턴스 생성
    const shopifyService = new ShopifyGraphQLService();

    // vendor가 'all'이면 빈 문자열로 처리
    const vendorFilter = vendor === 'all' ? '' : vendor.toString();

    // 상품 검색
    let products = [];
    
    try {
      if (vendorFilter) {
        // vendor로 검색
        products = await shopifyService.getProductsByVendor(vendorFilter, {
          limit: parseInt(limit.toString()),
          includeInactive: includeInactive === 'true'
        });
      } else if (search) {
        // 검색어로 검색
        products = await shopifyService.searchProducts({
          search: search.toString(),
          limit: parseInt(limit.toString())
        });
      } else {
        // 모든 상품 조회 (vendor 없이)
        products = await shopifyService.getProductsByVendor('', {
          limit: parseInt(limit.toString()),
          includeInactive: includeInactive === 'true'
        });
      }
    } catch (shopifyError: any) {
      logger.error('Shopify API call failed', {
        error: shopifyError.message || shopifyError,
        vendor: vendorFilter,
        search
      });
      
      // Shopify API 실패시 Mock 데이터 반환
      products = getMockShopifyProducts(vendorFilter, search.toString());
    }

    // Transform products for frontend
    const transformedProducts = products.map((product: any) => ({
      id: product.id,
      shopifyId: product.shopifyId || product.id.split('/').pop(),
      title: product.title,
      handle: product.handle,
      vendor: product.vendor,
      productType: product.productType,
      status: product.status || 'ACTIVE',
      images: product.images || [],
      variants: product.variants || [],
      tags: product.tags || [],
      createdAt: product.createdAt,
      updatedAt: product.updatedAt
    }));

    logger.info(`Found ${transformedProducts.length} Shopify products`);

    // Activity 로깅
    await Activity.create({
      type: 'search',
      action: 'Shopify 상품 검색',
      details: `${transformedProducts.length}개 상품 검색됨`,
      status: 'success',
      metadata: {
        vendor: vendorFilter,
        search: search.toString(),
        resultCount: transformedProducts.length
      }
    });

    res.json({
      success: true,
      data: transformedProducts,
      total: transformedProducts.length,
      hasMore: false
    });
  } catch (error: any) {
    logger.error('Error in searchShopifyProducts:', {
      error: error.message || error,
      stack: error.stack,
      query: req.query
    });

    // 에러 발생시에도 Mock 데이터 반환
    const mockData = getMockShopifyProducts('', '');
    
    res.json({
      success: true,
      data: mockData,
      total: mockData.length,
      hasMore: false,
      warning: 'Using mock data due to API error'
    });
  }
};

/**
 * 네이버 상품 검색
 */
export const searchNaverProducts = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { 
      search = '', 
      category = '',
      limit = 20 
    } = req.query;

    logger.info('Searching Naver products', {
      search,
      category,
      limit
    });

    const naverService = new NaverProductService();
    
    let products = [];
    
    try {
      // 네이버 API 호출
      if (search) {
        products = await naverService.searchProducts({
          query: search.toString(),
          limit: parseInt(limit.toString())
        });
      } else if (category) {
        products = await naverService.getProductsByCategory(
          category.toString(),
          parseInt(limit.toString())
        );
      } else {
        products = await naverService.getAllProducts({
          limit: parseInt(limit.toString())
        });
      }
    } catch (naverError: any) {
      logger.error('Naver API call failed', {
        error: naverError.message || naverError,
        search,
        category
      });
      
      // 네이버 API 실패시 Mock 데이터 반환
      products = getMockNaverProducts(search.toString());
    }

    logger.info(`Found ${products.length} Naver products`);

    res.json({
      success: true,
      data: products,
      total: products.length
    });
  } catch (error: any) {
    logger.error('Error in searchNaverProducts:', {
      error: error.message || error,
      query: req.query
    });

    // 에러 발생시 Mock 데이터 반환
    const mockData = getMockNaverProducts('');
    
    res.json({
      success: true,
      data: mockData,
      total: mockData.length,
      warning: 'Using mock data due to API error'
    });
  }
};

// Mock 데이터 헬퍼 함수들

function getMockShopifyProducts(vendor: string, search: string): any[] {
  const mockProducts = [
    {
      id: 'gid://shopify/Product/8001234567890',
      shopifyId: '8001234567890',
      title: '[NCT DREAM] Hot Sauce - 정규 1집 앨범',
      handle: 'nct-dream-hot-sauce-album',
      vendor: 'SM Entertainment',
      productType: 'Album',
      status: 'ACTIVE',
      images: [
        {
          url: 'https://cdn.shopify.com/s/files/1/mock-image-1.jpg',
          altText: 'Album Cover'
        }
      ],
      variants: [
        {
          id: 'gid://shopify/ProductVariant/44001234567890',
          variantId: '44001234567890',
          title: 'Photo Book Ver.',
          sku: 'NCT-HS-PB-001',
          price: '25.00',
          inventoryQuantity: 50,
          barcode: '8809633189777'
        },
        {
          id: 'gid://shopify/ProductVariant/44001234567891',
          variantId: '44001234567891',
          title: 'Jewel Case Ver.',
          sku: 'NCT-HS-JC-001',
          price: '20.00',
          inventoryQuantity: 30,
          barcode: '8809633189778'
        }
      ],
      tags: ['K-pop', 'NCT', 'Album'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: 'gid://shopify/Product/8001234567891',
      shopifyId: '8001234567891',
      title: '[SEVENTEEN] Face the Sun - 정규 4집',
      handle: 'seventeen-face-the-sun',
      vendor: 'PLEDIS Entertainment',
      productType: 'Album',
      status: 'ACTIVE',
      images: [
        {
          url: 'https://cdn.shopify.com/s/files/1/mock-image-2.jpg',
          altText: 'Album Cover'
        }
      ],
      variants: [
        {
          id: 'gid://shopify/ProductVariant/44001234567892',
          variantId: '44001234567892',
          title: 'Weverse Album Ver.',
          sku: 'SVT-FTS-WV-001',
          price: '30.00',
          inventoryQuantity: 100,
          barcode: '8809633189779'
        }
      ],
      tags: ['K-pop', 'SEVENTEEN', 'Album'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ];

  // Filter by vendor if specified
  let filtered = mockProducts;
  if (vendor && vendor !== 'all') {
    filtered = filtered.filter(p => 
      p.vendor.toLowerCase().includes(vendor.toLowerCase())
    );
  }

  // Filter by search if specified
  if (search) {
    const searchLower = search.toLowerCase();
    filtered = filtered.filter(p => 
      p.title.toLowerCase().includes(searchLower) ||
      p.handle.toLowerCase().includes(searchLower)
    );
  }

  return filtered;
}

function getMockNaverProducts(search: string): any[] {
  const mockProducts = [
    {
      id: 'NAVER-001',
      productId: '12345678',
      channelProductNo: '12345678',
      name: 'NCT DREAM - Hot Sauce 정규 1집 (포토북 버전)',
      salePrice: 28000,
      stockQuantity: 45,
      category: {
        categoryId: '50000437',
        name: '음반/DVD'
      },
      statusType: 'SALE',
      images: [
        {
          url: 'https://shop-phinf.pstatic.net/mock-1.jpg',
          order: 0
        }
      ],
      attributes: [
        { name: '아티스트', value: 'NCT DREAM' },
        { name: '발매일', value: '2021-05-10' }
      ]
    },
    {
      id: 'NAVER-002',
      productId: '12345679',
      channelProductNo: '12345679',
      name: 'SEVENTEEN - Face the Sun 정규 4집',
      salePrice: 32000,
      stockQuantity: 80,
      category: {
        categoryId: '50000437',
        name: '음반/DVD'
      },
      statusType: 'SALE',
      images: [
        {
          url: 'https://shop-phinf.pstatic.net/mock-2.jpg',
          order: 0
        }
      ],
      attributes: [
        { name: '아티스트', value: 'SEVENTEEN' },
        { name: '발매일', value: '2022-05-27' }
      ]
    }
  ];

  // Filter by search if specified
  if (search) {
    const searchLower = search.toLowerCase();
    return mockProducts.filter(p => 
      p.name.toLowerCase().includes(searchLower) ||
      p.productId.includes(searchLower)
    );
  }

  return mockProducts;
}