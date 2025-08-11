// packages/backend/src/controllers/MappingController.ts
import { Request, Response, NextFunction } from 'express';
import { ProductMapping, Activity } from '../models';
import { MappingService } from '../services/sync';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';
import { validateSKU } from '../utils/validators';
import { ShopifyProductSearchService } from '../services/shopify/ShopifyProductSearchService';
import * as XLSX from 'xlsx';
import mongoose from 'mongoose';

// MongoDB replica set 확인 헬퍼 함수
async function isReplicaSet(): Promise<boolean> {
  try {
    const admin = mongoose.connection.db.admin();
    const status = await admin.replSetGetStatus();
    return !!status;
  } catch (error) {
    // replica set이 아닌 경우 오류 발생
    return false;
  }
}

// 환경에 따른 트랜잭션 사용 결정
function shouldUseTransaction(): boolean {
  // 개발 환경에서는 트랜잭션 사용하지 않음
  if (process.env.NODE_ENV === 'development') {
    return false;
  }
  // 테스트 환경에서도 트랜잭션 사용하지 않음
  if (process.env.NODE_ENV === 'test') {
    return false;
  }
  // 프로덕션에서만 트랜잭션 사용
  return true;
}

export class MappingController {
  private mappingService: MappingService | null;
  private shopifySearchService: ShopifyProductSearchService | null;

  constructor(mappingService?: MappingService) {
    this.mappingService = mappingService || null;
    this.shopifySearchService = null;

    try {
      this.shopifySearchService = new ShopifyProductSearchService();
    } catch (error) {
      logger.warn('ShopifyProductSearchService initialization failed:', error);
    }
  }

  /**
   * Shopify 상품 검색 헬퍼
   */
  private async searchShopifyProducts(sku: string): Promise<any | null> {
    if (!this.shopifySearchService) {
      logger.warn('ShopifyProductSearchService not available');
      return null;
    }

    try {
      const result = await this.shopifySearchService.searchBySKU(sku);
      if (result && result.found && result.products.length > 0) {
        return result.products[0]; // 첫 번째 매칭 상품 반환
      }
      return null;
    } catch (error) {
      logger.error('Error searching Shopify products:', error);
      return null;
    }
  }

  /**
   * 매핑 생성
   * POST /api/v1/mappings
   */
  async createMapping(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    let session: any = null;
    const useTransaction = shouldUseTransaction() && (await isReplicaSet());

    try {
      const {
        sku,
        naverProductId,
        shopifyProductId,
        shopifyVariantId,
        productName,
        vendor = 'album',
        priceMargin = 0.15,
        isActive = true,
        autoSearch = false,
      } = req.body;

      if (!sku) {
        throw new AppError('SKU is required', 400);
      }

      // SKU 유효성 검사
      if (!validateSKU(sku)) {
        throw new AppError('Invalid SKU format', 400);
      }

      // 트랜잭션 시작 (replica set인 경우에만)
      if (useTransaction) {
        session = await ProductMapping.startSession();
        session.startTransaction();
      }

      // 중복 확인
      const existingMapping = await ProductMapping.findOne({
        sku: sku.toUpperCase(),
      }).session(useTransaction ? session : null);

      if (existingMapping) {
        throw new AppError('SKU already exists', 409);
      }

      // 매핑 상태 결정
      const mappingStatus =
        !naverProductId ||
        naverProductId === 'PENDING' ||
        !shopifyProductId ||
        shopifyProductId === 'PENDING' ||
        !shopifyVariantId ||
        shopifyVariantId === 'PENDING'
          ? 'PENDING'
          : 'ACTIVE';

      // 매핑 생성
      const mappingData = {
        sku: sku.toUpperCase(),
        naverProductId: naverProductId || 'PENDING',
        shopifyProductId: shopifyProductId || 'PENDING',
        shopifyVariantId: shopifyVariantId || 'PENDING',
        productName: productName || sku,
        vendor: vendor || 'album',
        priceMargin: typeof priceMargin === 'number' ? priceMargin : 0.15,
        isActive: mappingStatus === 'ACTIVE' ? isActive : false,
        status: mappingStatus,
        syncStatus: 'pending',
        retryCount: 0,
        metadata: {
          createdBy: (req as any).user?.id,
          autoSearchUsed: autoSearch,
          createdAt: new Date(),
        },
      };

      const mapping = useTransaction
        ? await ProductMapping.create([mappingData], { session })
        : await ProductMapping.create(mappingData);

      if (useTransaction && session) {
        await session.commitTransaction();
      }

      // 활동 로그 기록 (트랜잭션 외부에서)
      try {
        await Activity.create({
          type: 'mapping_created',
          action: `매핑 생성: ${sku}`,
          details: {
            autoSearch,
            status: mappingStatus,
          },
          userId: (req as any).user?.id,
        });
      } catch (activityError) {
        logger.error('Failed to create activity log:', activityError);
      }

      logger.info(`Mapping created successfully: ${sku}`);

      const responseMapping = Array.isArray(mapping) ? mapping[0] : mapping;

      res.status(201).json({
        success: true,
        data: responseMapping,
        message:
          mappingStatus === 'PENDING'
            ? '매핑이 생성되었으나 일부 정보가 누락되었습니다. 수동으로 업데이트해주세요.'
            : '매핑이 성공적으로 생성되었습니다.',
      });
    } catch (error) {
      if (useTransaction && session) {
        await session.abortTransaction();
      }
      logger.error('Failed to create mapping:', error);
      next(error);
    } finally {
      if (session) {
        session.endSession();
      }
    }
  }

  /**
   * 매핑 업데이트
   * PUT /api/v1/mappings/:id
   */
  async updateMapping(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { id } = req.params;
      const updates = req.body;

      const mapping = await ProductMapping.findById(id);
      if (!mapping) {
        throw new AppError('Mapping not found', 404);
      }

      // SKU는 변경 불가
      if (updates.sku && updates.sku !== mapping.sku) {
        throw new AppError('SKU cannot be changed', 400);
      }

      // 업데이트 가능한 필드만 선택
      const allowedUpdates = [
        'naverProductId',
        'shopifyProductId',
        'shopifyVariantId',
        'shopifyInventoryItemId',
        'shopifyLocationId',
        'productName',
        'vendor',
        'priceMargin',
        'isActive',
        'status',
      ];

      allowedUpdates.forEach((field) => {
        if (updates[field] !== undefined) {
          (mapping as any)[field] = updates[field];
        }
      });

      // PENDING 상태에서 모든 ID가 채워지면 ACTIVE로 변경
      if (
        mapping.status === 'PENDING' &&
        mapping.naverProductId !== 'PENDING' &&
        mapping.shopifyProductId !== 'PENDING' &&
        mapping.shopifyVariantId !== 'PENDING'
      ) {
        mapping.status = 'ACTIVE';
        mapping.isActive = true;
      }

      await mapping.save();

      // 활동 로그 기록
      await Activity.create({
        type: 'mapping_updated',
        action: `매핑 업데이트: ${mapping.sku}`,
        details: updates,
        userId: (req as any).user?.id,
      });

      res.json({
        success: true,
        data: mapping,
        message: '매핑이 업데이트되었습니다.',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 매핑 삭제
   * DELETE /api/v1/mappings/:id
   */
  async deleteMapping(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { id } = req.params;

      const mapping = await ProductMapping.findById(id);
      if (!mapping) {
        throw new AppError('Mapping not found', 404);
      }

      await mapping.deleteOne();

      // 활동 로그 기록
      await Activity.create({
        type: 'mapping_deleted',
        action: `매핑 삭제: ${mapping.sku}`,
        userId: (req as any).user?.id,
      });

      res.json({
        success: true,
        message: '매핑이 삭제되었습니다.',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 모든 매핑 조회
   * GET /api/v1/mappings
   */
  async getAllMappings(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const {
        page = 1,
        limit = 20,
        status,
        search,
        isActive,
        syncStatus,
        vendor,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        order = 'desc',
      } = req.query;

      const query: any = {};

      if (status && status !== 'all') {
        query.status = status;
      }

      if (syncStatus && syncStatus !== 'all') {
        query.syncStatus = syncStatus;
      }

      if (vendor && vendor !== 'all') {
        query.vendor = vendor;
      }

      if (isActive !== undefined && isActive !== '' && isActive !== 'all') {
        query.isActive = isActive === 'true';
      }

      if (search) {
        const searchRegex = { $regex: search, $options: 'i' };
        query.$or = [
          { sku: searchRegex },
          { productName: searchRegex },
          { vendor: searchRegex },
          { naverProductId: searchRegex },
          { shopifyProductId: searchRegex },
        ];
      }

      const sort: any = {};
      const finalSortOrder = sortOrder || order;
      sort[sortBy as string] = finalSortOrder === 'asc' ? 1 : -1;

      logger.info('Fetching mappings with query:', query);

      const mappings = await ProductMapping.find(query)
        .sort(sort)
        .limit(Number(limit))
        .skip((Number(page) - 1) * Number(limit))
        .lean();

      const total = await ProductMapping.countDocuments(query);

      // 통계 데이터 집계
      const [
        totalCount,
        activeCount,
        inactiveCount,
        errorCount,
        pendingCount,
        syncNeededCount,
      ] = await Promise.all([
        ProductMapping.countDocuments({}),
        ProductMapping.countDocuments({ isActive: true, status: 'ACTIVE' }),
        ProductMapping.countDocuments({ isActive: false }),
        ProductMapping.countDocuments({ status: 'ERROR' }),
        ProductMapping.countDocuments({ status: 'PENDING' }),
        ProductMapping.countDocuments({
          syncStatus: { $in: ['pending', 'failed'] },
          status: 'ACTIVE',
        }),
      ]);

      logger.info(`Found ${mappings.length} mappings, total: ${total}`);

      res.json({
        success: true,
        data: {
          mappings: mappings,
          pagination: {
            total,
            page: Number(page),
            limit: Number(limit),
            totalPages: Math.ceil(total / Number(limit)),
          },
          stats: {
            total: totalCount,
            active: activeCount,
            inactive: inactiveCount,
            error: errorCount,
            pending: pendingCount,
            syncNeeded: syncNeededCount,
          },
        },
      });
    } catch (error) {
      logger.error('Failed to get mappings:', error);
      next(error);
    }
  }

  /**
   * ID로 매핑 조회
   * GET /api/v1/mappings/:id
   */
  async getMappingById(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { id } = req.params;

      const mapping = await ProductMapping.findById(id);
      if (!mapping) {
        throw new AppError('Mapping not found', 404);
      }

      res.json({
        success: true,
        data: mapping,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * SKU로 매핑 조회
   * GET /api/v1/mappings/sku/:sku
   */
  async getMappingBySku(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { sku } = req.params;

      const mapping = await ProductMapping.findOne({
        sku: sku.toUpperCase(),
      });

      if (!mapping) {
        throw new AppError('Mapping not found', 404);
      }

      res.json({
        success: true,
        data: mapping,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 자동 매핑 탐색
   * POST /api/v1/mappings/auto-discover
   */
  async autoDiscoverMappings(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { matchBy = 'sku', limit = 100 } = req.body;

      const discoveries = [];

      if (this.mappingService) {
        const naverProductService = (this.mappingService as any)
          .naverProductService;

        if (naverProductService) {
          try {
            const naverProducts = await naverProductService.listProducts({
              limit,
              saleStatus: 'ALL',
            });

            if (naverProducts && naverProducts.items) {
              for (const naverProduct of naverProducts.items) {
                const sku =
                  naverProduct.sellerManagementCode || naverProduct.sku;

                if (sku) {
                  const existingMapping = await ProductMapping.findOne({
                    sku: sku.toUpperCase(),
                  });

                  if (!existingMapping) {
                    const shopifyProduct =
                      await this.searchShopifyProducts(sku);

                    if (shopifyProduct) {
                      discoveries.push({
                        sku: sku.toUpperCase(),
                        naver: {
                          productId:
                            naverProduct.productNo || naverProduct.productId,
                          name: naverProduct.name,
                          price: naverProduct.salePrice,
                        },
                        shopify: {
                          productId: shopifyProduct.product_id,
                          variantId: shopifyProduct.id,
                          title: shopifyProduct.product_title,
                          price: shopifyProduct.price,
                        },
                        confidence: 100,
                      });
                    }
                  }
                }
              }
            }
          } catch (error) {
            logger.error('Error discovering mappings:', error);
          }
        }
      }

      res.json({
        success: true,
        data: discoveries,
        message: `${discoveries.length}개의 매핑을 발견했습니다.`,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 매핑 검증
   * POST /api/v1/mappings/:id/validate
   */
  async validateMapping(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { id } = req.params;

      const mapping = await ProductMapping.findById(id);
      if (!mapping) {
        throw new AppError('Mapping not found', 404);
      }

      if (!this.mappingService) {
        throw new AppError('Mapping service not available', 500);
      }

      const validation = await this.mappingService.validateMapping(mapping.sku);

      res.json({
        success: true,
        data: validation,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 대량 매핑 업로드
   * POST /api/v1/mappings/bulk
   */
  async bulkUploadMappings(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    let session: any = null;
    const useTransaction = shouldUseTransaction() && (await isReplicaSet());

    try {
      const { mappings } = req.body;

      if (!Array.isArray(mappings)) {
        throw new AppError('mappings must be an array', 400);
      }

      // 트랜잭션 시작 (replica set인 경우에만)
      if (useTransaction) {
        session = await ProductMapping.startSession();
        session.startTransaction();
      }

      const results = {
        success: 0,
        failed: 0,
        errors: [] as any[],
      };

      for (const mappingData of mappings) {
        try {
          if (!validateSKU(mappingData.sku)) {
            results.failed++;
            results.errors.push({
              sku: mappingData.sku,
              error: 'Invalid SKU format',
            });
            continue;
          }

          const existing = await ProductMapping.findOne({
            sku: mappingData.sku.toUpperCase(),
          }).session(useTransaction ? session : null);

          if (existing) {
            results.failed++;
            results.errors.push({
              sku: mappingData.sku,
              error: 'SKU already exists',
            });
            continue;
          }

          const newMappingData = {
            ...mappingData,
            sku: mappingData.sku.toUpperCase(),
            status: 'ACTIVE',
            syncStatus: 'pending',
          };

          if (useTransaction) {
            await ProductMapping.create([newMappingData], { session });
          } else {
            await ProductMapping.create(newMappingData);
          }

          results.success++;
        } catch (error: any) {
          results.failed++;
          results.errors.push({
            sku: mappingData.sku,
            error: error.message,
          });
        }
      }

      if (useTransaction && session) {
        await session.commitTransaction();
      }

      res.json({
        success: true,
        data: results,
        message: `${results.success}개 성공, ${results.failed}개 실패`,
      });
    } catch (error) {
      if (useTransaction && session) {
        await session.abortTransaction();
      }
      logger.error('Bulk upload failed:', error);
      next(error);
    } finally {
      if (session) {
        session.endSession();
      }
    }
  }

  /**
   * SKU로 상품 검색
   * GET /api/v1/mappings/search-by-sku
   */
  async searchProductsBySku(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const sku = req.params.sku || req.query.sku;

      if (!sku || (typeof sku === 'string' && sku.length < 2)) {
        throw new AppError('SKU must be at least 2 characters', 400);
      }

      const skuString = sku as string;
      const skuUpper = skuString.toUpperCase();

      logger.info(`Searching products for SKU: ${skuUpper}`);

      const searchResults = {
        sku: skuUpper,
        naver: {
          found: false,
          products: [] as any[],
          message: '',
          error: '',
        },
        shopify: {
          found: false,
          products: [] as any[],
          message: '',
          error: '',
        },
        recommendations: {
          autoMappingPossible: false,
          confidence: 0,
        },
      };

      const searchPromises = [];

      // 네이버 상품 검색
      if (this.mappingService) {
        const naverProductService = (this.mappingService as any)
          .naverProductService;

        if (naverProductService) {
          const naverPromise = (async () => {
            try {
              logger.info('Searching Naver products...');

              let naverProducts: any[] = [];

              try {
                const skuSearchResult =
                  await naverProductService.searchProducts({
                    searchKeyword: skuUpper,
                    searchType: 'SELLER_MANAGEMENT_CODE',
                    page: 1,
                    size: 10,
                  });

                if (skuSearchResult && skuSearchResult.contents) {
                  const flatProducts = [];
                  for (const item of skuSearchResult.contents) {
                    if (
                      item.channelProducts &&
                      Array.isArray(item.channelProducts)
                    ) {
                      for (const channelProduct of item.channelProducts) {
                        flatProducts.push({
                          ...channelProduct,
                          originProductNo: item.originProductNo,
                        });
                      }
                    } else {
                      flatProducts.push(item);
                    }
                  }

                  if (flatProducts.length > 0) {
                    naverProducts = flatProducts.map((product) => ({
                      id:
                        product.channelProductNo ||
                        product.productNo ||
                        product.id,
                      name: product.name || product.productName || '',
                      sku: product.sellerManagementCode || skuUpper,
                      price: product.salePrice || 0,
                      imageUrl:
                        product.representativeImage?.url ||
                        product.images?.[0]?.url ||
                        '',
                      stockQuantity: product.stockQuantity || 0,
                      status:
                        product.statusType || product.saleStatus || 'UNKNOWN',
                      similarity: 100,
                    }));
                  }
                }
              } catch (skuError: any) {
                logger.warn(
                  'SKU search failed, trying keyword search:',
                  skuError.message
                );
              }

              if (naverProducts.length === 0) {
                const keywordResult = await naverProductService.searchProducts({
                  searchKeyword: skuUpper,
                  searchType: 'PRODUCT_NAME',
                  page: 1,
                  size: 5,
                });

                if (keywordResult && keywordResult.contents) {
                  naverProducts = keywordResult.contents.map(
                    (product: any) => ({
                      id: product.productNo || product.id,
                      name: product.name || '',
                      sku: product.sellerManagementCode || '',
                      price: product.salePrice || 0,
                      imageUrl: product.representativeImage?.url || '',
                      stockQuantity: product.stockQuantity || 0,
                      status: product.statusType || 'UNKNOWN',
                      similarity: product.sellerManagementCode?.includes(
                        skuUpper
                      )
                        ? 80
                        : 50,
                    })
                  );
                }
              }

              if (naverProducts.length > 0) {
                searchResults.naver.found = true;
                searchResults.naver.products = naverProducts;
                searchResults.naver.message = `${naverProducts.length}개의 상품을 찾았습니다.`;
              } else {
                searchResults.naver.message = '검색 결과가 없습니다.';
              }
            } catch (error: any) {
              logger.error('Naver search error:', error);
              searchResults.naver.error =
                error.message || 'Naver 검색 중 오류가 발생했습니다.';
            }
          })();

          searchPromises.push(naverPromise);
        }
      }

      // Shopify 상품 검색
      if (this.shopifySearchService) {
        const shopifyPromise = (async () => {
          try {
            logger.info('Searching Shopify products...');

            const shopifyResult =
              await this.shopifySearchService.searchBySKU(skuUpper);

            if (
              shopifyResult &&
              shopifyResult.found &&
              shopifyResult.products.length > 0
            ) {
              searchResults.shopify.found = true;
              searchResults.shopify.products = shopifyResult.products.map(
                (product: any) => ({
                  id: product.product_id,
                  variantId: product.id,
                  title: product.product_title,
                  variantTitle: product.title,
                  sku: product.sku,
                  price: product.price,
                  imageUrl: product.image?.src || '',
                  inventoryQuantity: product.inventory_quantity || 0,
                  vendor: product.vendor || '',
                  similarity: product.similarity || 100,
                })
              );
              searchResults.shopify.message = `${shopifyResult.products.length}개의 상품을 찾았습니다.`;
            } else {
              searchResults.shopify.message = '검색 결과가 없습니다.';
            }
          } catch (error: any) {
            logger.error('Shopify search error:', error);
            searchResults.shopify.error =
              error.message || 'Shopify 검색 중 오류가 발생했습니다.';
          }
        })();

        searchPromises.push(shopifyPromise);
      }

      // 모든 검색 완료 대기
      await Promise.all(searchPromises);

      // 자동 매핑 가능 여부 판단
      if (searchResults.naver.found && searchResults.shopify.found) {
        const naverExactMatch = searchResults.naver.products.find(
          (p) => p.sku === skuUpper
        );
        const shopifyExactMatch = searchResults.shopify.products.find(
          (p) => p.sku === skuUpper
        );

        if (naverExactMatch && shopifyExactMatch) {
          searchResults.recommendations.autoMappingPossible = true;
          searchResults.recommendations.confidence = 100;
        } else if (
          searchResults.naver.products.length === 1 &&
          searchResults.shopify.products.length === 1
        ) {
          searchResults.recommendations.autoMappingPossible = true;
          searchResults.recommendations.confidence = 80;
        }
      }

      res.json({
        success: true,
        data: searchResults,
      });
    } catch (error) {
      logger.error('Product search error:', error);
      next(error);
    }
  }

  /**
   * PENDING 매핑 재시도
   * POST /api/v1/mappings/:id/retry
   */
  async retryPendingMapping(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { id } = req.params;

      const mapping = await ProductMapping.findById(id);
      if (!mapping) {
        throw new AppError('Mapping not found', 404);
      }

      if (mapping.status !== 'PENDING') {
        throw new AppError('Only PENDING mappings can be retried', 400);
      }

      // 재시도 카운트 증가
      mapping.retryCount = (mapping.retryCount || 0) + 1;
      mapping.lastRetryAt = new Date();

      // 자동 검색 시도
      const searchResults = await this.searchProductsBySku(
        {
          params: { sku: mapping.sku },
          query: {},
        } as any,
        res,
        next
      );

      // 검색 결과가 있으면 업데이트
      if (searchResults) {
        const naverProduct = searchResults.naver?.products?.[0];
        const shopifyProduct = searchResults.shopify?.products?.[0];

        if (naverProduct && mapping.naverProductId === 'PENDING') {
          mapping.naverProductId = naverProduct.id;
        }

        if (shopifyProduct) {
          if (mapping.shopifyProductId === 'PENDING') {
            mapping.shopifyProductId = shopifyProduct.id;
          }
          if (mapping.shopifyVariantId === 'PENDING') {
            mapping.shopifyVariantId = shopifyProduct.variantId;
          }
        }

        // 모든 필드가 채워졌으면 ACTIVE로 변경
        if (
          mapping.naverProductId !== 'PENDING' &&
          mapping.shopifyProductId !== 'PENDING' &&
          mapping.shopifyVariantId !== 'PENDING'
        ) {
          mapping.status = 'ACTIVE';
          mapping.isActive = true;
        }
      }

      await mapping.save();

      res.json({
        success: true,
        data: mapping,
        message:
          mapping.status === 'ACTIVE'
            ? '매핑이 업데이트되었습니다.'
            : '일부 정보를 찾을 수 없습니다. 수동으로 입력해주세요.',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 매핑 내보내기
   * GET /api/v1/mappings/export
   */
  async exportMappings(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { format = 'json' } = req.query;

      const mappings = await ProductMapping.find({ status: 'ACTIVE' });

      if (format === 'csv') {
        const csv = this.convertToCSV(mappings);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader(
          'Content-Disposition',
          'attachment; filename=mappings.csv'
        );
        res.send(csv);
      } else if (format === 'xlsx') {
        const worksheet = XLSX.utils.json_to_sheet(
          mappings.map((m) => m.toObject())
        );
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Mappings');
        const buffer = XLSX.write(workbook, {
          type: 'buffer',
          bookType: 'xlsx',
        });

        res.setHeader(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader(
          'Content-Disposition',
          'attachment; filename=mappings.xlsx'
        );
        res.send(buffer);
      } else {
        res.json({
          success: true,
          data: mappings,
        });
      }
    } catch (error) {
      next(error);
    }
  }

  /**
   * 매핑 가져오기
   * POST /api/v1/mappings/import
   */
  async importMappings(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { data, format = 'json' } = req.body;

      let mappings = [];

      if (format === 'csv') {
        mappings = this.parseCSV(data);
      } else {
        mappings = data;
      }

      req.body.mappings = mappings;
      await this.bulkUploadMappings(req, res, next);
    } catch (error) {
      next(error);
    }
  }

  /**
   * 매핑 동기화
   * POST /api/v1/mappings/:id/sync
   */
  async syncMapping(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { id } = req.params;

      const mapping = await ProductMapping.findById(id);
      if (!mapping) {
        throw new AppError('Mapping not found', 404);
      }

      if (!this.mappingService) {
        throw new AppError('Mapping service not available', 500);
      }

      const syncResult = await this.mappingService.syncMapping(mapping.sku);

      res.json({
        success: true,
        data: syncResult,
        message: '동기화가 시작되었습니다.',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 매핑 데이터 검증
   * POST /api/v1/mappings/validate
   */
  async validateMappingData(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { sku, naverProductId, shopifyProductId } = req.body;

      if (!sku || !naverProductId || !shopifyProductId) {
        throw new AppError(
          'SKU, naverProductId, and shopifyProductId are required',
          400
        );
      }

      if (!this.mappingService) {
        throw new AppError('Mapping service not available', 500);
      }

      const validation = await this.mappingService.validateMappingData({
        sku,
        naverProductId,
        shopifyProductId,
      });

      res.json({
        success: true,
        data: validation,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 매핑 통계 조회
   * GET /api/v1/mappings/stats
   */
  async getMappingStats(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const [total, active, inactive, error, pending, syncNeeded] =
        await Promise.all([
          ProductMapping.countDocuments({}),
          ProductMapping.countDocuments({ isActive: true, status: 'ACTIVE' }),
          ProductMapping.countDocuments({ isActive: false }),
          ProductMapping.countDocuments({ status: 'ERROR' }),
          ProductMapping.countDocuments({ status: 'PENDING' }),
          ProductMapping.countDocuments({
            syncStatus: { $in: ['pending', 'failed'] },
            status: 'ACTIVE',
          }),
        ]);

      res.json({
        success: true,
        data: {
          total,
          active,
          inactive,
          error,
          pending,
          syncNeeded,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * CSV 변환 헬퍼
   */
  private convertToCSV(mappings: any[]): string {
    const headers = [
      'SKU',
      'Naver Product ID',
      'Shopify Product ID',
      'Shopify Variant ID',
      'Product Name',
      'Vendor',
      'Price Margin',
      'Active',
      'Status',
      'Sync Status',
      'Created At',
      'Updated At',
    ];

    const rows = mappings.map((m) => [
      m.sku,
      m.naverProductId,
      m.shopifyProductId,
      m.shopifyVariantId,
      m.productName,
      m.vendor,
      m.priceMargin,
      m.isActive,
      m.status,
      m.syncStatus,
      m.createdAt,
      m.updatedAt,
    ]);

    return [headers, ...rows].map((row) => row.join(',')).join('\n');
  }

  /**
   * CSV 파싱 헬퍼
   */
  private parseCSV(data: string): any[] {
    const lines = data.split('\n');
    const headers = lines[0].split(',');

    return lines.slice(1).map((line) => {
      const values = line.split(',');
      const mapping: any = {};

      headers.forEach((header, index) => {
        const key = header.toLowerCase().replace(/ /g, '');
        mapping[key] = values[index];
      });

      return mapping;
    });
  }
}
