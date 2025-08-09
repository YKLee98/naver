// packages/backend/src/controllers/MappingController.ts
import { Request, Response, NextFunction } from 'express';
import { MappingService } from '../services/sync/index.js';
import { ProductMapping, Activity, InventoryTransaction } from '../models/index.js';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import * as XLSX from 'xlsx';
import { v4 as uuidv4 } from 'uuid';
import { ShopifyProductSearchService } from '../services/shopify/ShopifyProductSearchService.js';

// 개선된 SKU 검증 함수
function validateSKU(sku: string): boolean {
  if (!sku || typeof sku !== 'string') return false;
  
  const trimmedSku = sku.trim();
  
  // 길이 체크 (1-100자)
  if (trimmedSku.length < 1 || trimmedSku.length > 100) {
    return false;
  }
  
  // 제어 문자나 줄바꿈 문자만 제외 (한글, 특수문자 허용)
  const invalidCharsRegex = /[\x00-\x1F\x7F\r\n\t]/;
  if (invalidCharsRegex.test(trimmedSku)) {
    return false;
  }
  
  return true;
}

export class MappingController {
  private mappingService: MappingService;
  public naverProductService: any;
  public shopifyGraphQLService: any;
  private shopifySearchService: ShopifyProductSearchService | null = null;

  constructor(mappingService: MappingService) {
    this.mappingService = mappingService;
    // MappingService의 private 속성에 접근하기 위한 우회 방법
    this.naverProductService = (mappingService as any).naverProductService;
    this.shopifyGraphQLService = (mappingService as any).shopifyGraphQLService;
    
    // ShopifyProductSearchService 초기화
    try {
      this.shopifySearchService = new ShopifyProductSearchService();
      logger.info('ShopifyProductSearchService initialized in MappingController');
    } catch (error) {
      logger.error('Failed to initialize ShopifyProductSearchService:', error);
      this.shopifySearchService = null;
    }
    
    // Bind all methods to maintain context
    this.createMapping = this.createMapping.bind(this);
    this.updateMapping = this.updateMapping.bind(this);
    this.deleteMapping = this.deleteMapping.bind(this);
    this.getAllMappings = this.getAllMappings.bind(this);
    this.getMappingById = this.getMappingById.bind(this);
    this.getMappingBySku = this.getMappingBySku.bind(this);
    this.autoDiscoverMappings = this.autoDiscoverMappings.bind(this);
    this.validateMapping = this.validateMapping.bind(this);
    this.validateMappingData = this.validateMappingData.bind(this);
    this.bulkUploadMappings = this.bulkUploadMappings.bind(this);
    this.searchProductsBySku = this.searchProductsBySku.bind(this);
    this.retryPendingMapping = this.retryPendingMapping.bind(this);
    this.exportMappings = this.exportMappings.bind(this);
    this.importMappings = this.importMappings.bind(this);
    this.syncMapping = this.syncMapping.bind(this);
    this.getMappingStats = this.getMappingStats.bind(this);
  }

  /**
   * SKU 패턴 추출 함수
   */
  private extractSkuPatterns(text: string): string[] {
    const patterns = [
      // 기본 패턴: 영문-숫자
      /[A-Z]+-\d+/gi,
      // 영문 숫자 조합
      /[A-Z]+\d+/gi,
      // 숫자-영문 조합
      /\d+[A-Z]+/gi,
      // 언더스코어 포함
      /[A-Z]+_\d+/gi,
      // 한글 포함 패턴
      /[가-힣]+[-_]?\d+/g,
      // 복잡한 SKU 패턴
      /[A-Z0-9]{2,}[-_][A-Z0-9]{2,}/gi,
    ];
    
    const foundSkus = new Set<string>();
    
    for (const pattern of patterns) {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach(match => foundSkus.add(match.toUpperCase()));
      }
    }
    
    return Array.from(foundSkus);
  }

  /**
   * 문자열 유사도 계산 (Levenshtein Distance 기반)
   */
  private calculateSimilarity(str1: string, str2: string): number {
    if (!str1 || !str2) return 0;
    
    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();
    
    if (s1 === s2) return 100;
    if (s1.includes(s2) || s2.includes(s1)) return 80;
    
    // Levenshtein Distance 계산
    const matrix = [];
    for (let i = 0; i <= s2.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= s1.length; j++) {
      matrix[0][j] = j;
    }
    for (let i = 1; i <= s2.length; i++) {
      for (let j = 1; j <= s1.length; j++) {
        if (s2.charAt(i - 1) === s1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    const distance = matrix[s2.length][s1.length];
    const maxLength = Math.max(s1.length, s2.length);
    return Math.round((1 - distance / maxLength) * 100);
  }

  /**
   * 내부 검색 함수 - ShopifyProductSearchService 사용
   */
  private async searchShopifyProducts(sku: string): Promise<any> {
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
  async createMapping(req: Request, res: Response, next: NextFunction): Promise<void> {
    const session = await ProductMapping.startSession();
    session.startTransaction();
    
    try {
      const {
        sku,
        naverProductId,
        shopifyProductId,
        shopifyVariantId,
        priceMargin = 15,
        isActive = true,
        autoSearch = false
      } = req.body;

      if (!sku) {
        throw new AppError('SKU is required', 400);
      }

      // SKU 유효성 검사
      if (!validateSKU(sku)) {
        throw new AppError('Invalid SKU format', 400);
      }

      // 중복 확인
      const existingMapping = await ProductMapping.findOne({ 
        sku: sku.toUpperCase() 
      }).session(session);
      
      if (existingMapping) {
        throw new AppError('SKU already exists', 409);
      }

      let finalNaverProductId = naverProductId;
      let finalShopifyProductId = shopifyProductId;
      let finalShopifyVariantId = shopifyVariantId;
      let productName = '';
      let vendor = 'album';

      // 자동 검색이 활성화된 경우 - ShopifyProductSearchService 사용
      if (autoSearch) {
        try {
          // 네이버 검색 - 올바른 파라미터 사용
          if (!naverProductId && this.naverProductService) {
            try {
              const naverProducts = await this.naverProductService.searchProducts({
                searchKeyword: sku,  // keyword 대신 searchKeyword 사용
                searchType: 'SELLER_MANAGEMENT_CODE',  // searchType 추가
                page: 1,
                size: 1
              });
              if (naverProducts && naverProducts.contents && naverProducts.contents.length > 0) {
                const naverProduct = naverProducts.contents[0];
                finalNaverProductId = naverProduct.productNo || naverProduct.productId || 'PENDING';
                productName = naverProduct.name || sku;
              }
            } catch (naverError) {
              logger.warn(`Naver auto-search failed for SKU ${sku}:`, naverError);
            }
          }
          
          // Shopify 검색 - ShopifyProductSearchService 사용
          if (!shopifyProductId && this.shopifySearchService) {
            const shopifyProduct = await this.searchShopifyProducts(sku);
            if (shopifyProduct) {
              finalShopifyProductId = shopifyProduct.product_id || 'PENDING';
              finalShopifyVariantId = shopifyProduct.id || 'PENDING';
              vendor = shopifyProduct.vendor || 'album';
              if (!productName) {
                productName = shopifyProduct.product_title || sku;
              }
            }
          }
        } catch (searchError) {
          logger.warn(`Auto-search failed for SKU ${sku}:`, searchError);
        }
      }

      // 매핑 상태 결정
      const mappingStatus = (
        finalNaverProductId === 'PENDING' || 
        finalShopifyProductId === 'PENDING' || 
        finalShopifyVariantId === 'PENDING'
      ) ? 'PENDING' : 'ACTIVE';

      // 매핑 생성
      const mapping = await ProductMapping.create([{
        sku: sku.toUpperCase(),
        naverProductId: finalNaverProductId || 'PENDING',
        shopifyProductId: finalShopifyProductId || 'PENDING',
        shopifyVariantId: finalShopifyVariantId || 'PENDING',
        productName: productName || sku,
        vendor: vendor,
        priceMargin: priceMargin / 100,
        isActive: mappingStatus === 'ACTIVE' ? isActive : false,
        status: mappingStatus,
        syncStatus: 'pending',
        retryCount: 0,
        metadata: {
          createdBy: (req as any).user?.id,
          autoSearchUsed: autoSearch,
          createdAt: new Date()
        }
      }], { session });

      await session.commitTransaction();

      // 활동 로그 기록
      await Activity.create({
        type: 'mapping_created',
        action: `매핑 생성: ${sku}`,
        details: {
          autoSearch,
          status: mappingStatus
        },
        userId: (req as any).user?.id
      });

      res.status(201).json({
        success: true,
        data: mapping[0],
        message: mappingStatus === 'PENDING' 
          ? '매핑이 생성되었으나 일부 정보가 누락되었습니다. 수동으로 업데이트해주세요.'
          : '매핑이 성공적으로 생성되었습니다.'
      });
    } catch (error) {
      await session.abortTransaction();
      next(error);
    } finally {
      session.endSession();
    }
  }

  /**
   * 매핑 업데이트
   * PUT /api/v1/mappings/:id
   */
  async updateMapping(req: Request, res: Response, next: NextFunction): Promise<void> {
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
        'status'
      ];

      allowedUpdates.forEach(field => {
        if (updates[field] !== undefined) {
          (mapping as any)[field] = updates[field];
        }
      });

      // PENDING 상태에서 모든 ID가 채워지면 ACTIVE로 변경
      if (mapping.status === 'PENDING' &&
          mapping.naverProductId !== 'PENDING' &&
          mapping.shopifyProductId !== 'PENDING' &&
          mapping.shopifyVariantId !== 'PENDING') {
        mapping.status = 'ACTIVE';
        mapping.isActive = true;
      }

      await mapping.save();

      // 활동 로그 기록
      await Activity.create({
        type: 'mapping_updated',
        action: `매핑 업데이트: ${mapping.sku}`,
        details: updates,
        userId: (req as any).user?.id
      });

      res.json({
        success: true,
        data: mapping,
        message: '매핑이 업데이트되었습니다.'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 매핑 삭제
   * DELETE /api/v1/mappings/:id
   */
  async deleteMapping(req: Request, res: Response, next: NextFunction): Promise<void> {
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
        userId: (req as any).user?.id
      });

      res.json({
        success: true,
        message: '매핑이 삭제되었습니다.'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 모든 매핑 조회 - 프론트엔드 형식에 맞게 수정
   * GET /api/v1/mappings
   */
  async getAllMappings(req: Request, res: Response, next: NextFunction): Promise<void> {
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
        order = 'desc'  // sortOrder 대신 order도 지원
      } = req.query;

      const query: any = {};

      if (status) {
        query.status = status;
      }

      if (syncStatus) {
        query.syncStatus = syncStatus;
      }

      if (vendor && vendor !== 'all') {
        query.vendor = vendor;
      }

      if (isActive !== undefined) {
        query.isActive = isActive === 'true';
      }

      if (search) {
        query.$or = [
          { sku: { $regex: search, $options: 'i' } },
          { productName: { $regex: search, $options: 'i' } },
          { vendor: { $regex: search, $options: 'i' } },
          { naverProductId: { $regex: search, $options: 'i' } },
          { shopifyProductId: { $regex: search, $options: 'i' } }
        ];
      }

      const sort: any = {};
      const finalSortOrder = sortOrder || order;
      sort[sortBy as string] = finalSortOrder === 'asc' ? 1 : -1;

      const mappings = await ProductMapping
        .find(query)
        .sort(sort)
        .limit(Number(limit))
        .skip((Number(page) - 1) * Number(limit));

      const total = await ProductMapping.countDocuments(query);

      // 통계 데이터 집계
      const [
        totalCount,
        activeCount,
        inactiveCount,
        errorCount,
        pendingCount,
        syncNeededCount
      ] = await Promise.all([
        ProductMapping.countDocuments({}),
        ProductMapping.countDocuments({ isActive: true, status: 'ACTIVE' }),
        ProductMapping.countDocuments({ isActive: false }),
        ProductMapping.countDocuments({ status: 'ERROR' }),
        ProductMapping.countDocuments({ status: 'PENDING' }),
        ProductMapping.countDocuments({ 
          syncStatus: { $in: ['pending', 'failed'] },
          status: 'ACTIVE'
        })
      ]);

      // 프론트엔드가 기대하는 형식으로 응답
      res.json({
        success: true,
        data: {
          mappings: mappings,  // 배열을 mappings 키로 감싸기
          pagination: {
            total,
            page: Number(page),
            limit: Number(limit),
            totalPages: Math.ceil(total / Number(limit))
          },
          stats: {
            total: totalCount,
            active: activeCount,
            inactive: inactiveCount,
            error: errorCount,
            pending: pendingCount,
            syncNeeded: syncNeededCount
          }
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * ID로 매핑 조회
   * GET /api/v1/mappings/:id
   */
  async getMappingById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;

      const mapping = await ProductMapping.findById(id);
      if (!mapping) {
        throw new AppError('Mapping not found', 404);
      }

      res.json({
        success: true,
        data: mapping
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * SKU로 매핑 조회
   * GET /api/v1/mappings/sku/:sku
   */
  async getMappingBySku(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { sku } = req.params;

      const mapping = await ProductMapping.findOne({ 
        sku: sku.toUpperCase() 
      });

      if (!mapping) {
        throw new AppError('Mapping not found', 404);
      }

      res.json({
        success: true,
        data: mapping
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 자동 매핑 탐색 - ShopifyProductSearchService 사용
   * POST /api/v1/mappings/auto-discover
   */
  async autoDiscoverMappings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { matchBy = 'sku', limit = 100 } = req.body;

      const discoveries = [];

      // 네이버 상품 목록 가져오기
      if (this.naverProductService) {
        try {
          const naverProducts = await this.naverProductService.listProducts({ 
            limit,
            saleStatus: 'ALL'  // 모든 상태의 상품 포함
          });
          
          if (naverProducts && naverProducts.items) {
            for (const naverProduct of naverProducts.items) {
              const sku = naverProduct.sellerManagementCode || naverProduct.sku;
              
              if (sku) {
                // 이미 매핑이 있는지 확인
                const existingMapping = await ProductMapping.findOne({ 
                  sku: sku.toUpperCase() 
                });
                
                if (!existingMapping) {
                  // Shopify에서 동일한 SKU 검색 - ShopifyProductSearchService 사용
                  const shopifyProduct = await this.searchShopifyProducts(sku);
                  
                  if (shopifyProduct) {
                    discoveries.push({
                      sku: sku.toUpperCase(),
                      naver: {
                        productId: naverProduct.productNo || naverProduct.productId,
                        name: naverProduct.name,
                        price: naverProduct.salePrice
                      },
                      shopify: {
                        productId: shopifyProduct.product_id,
                        variantId: shopifyProduct.id,
                        title: shopifyProduct.product_title,
                        price: shopifyProduct.price
                      },
                      confidence: 100 // SKU 정확히 일치
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

      res.json({
        success: true,
        data: discoveries,
        message: `${discoveries.length}개의 매핑을 발견했습니다.`
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 매핑 검증
   * POST /api/v1/mappings/:id/validate
   */
  async validateMapping(req: Request, res: Response, next: NextFunction): Promise<void> {
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
        data: validation
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 대량 매핑 업로드
   * POST /api/v1/mappings/bulk
   */
  async bulkUploadMappings(req: Request, res: Response, next: NextFunction): Promise<void> {
    const session = await ProductMapping.startSession();
    session.startTransaction();

    try {
      const { mappings } = req.body;

      if (!Array.isArray(mappings)) {
        throw new AppError('mappings must be an array', 400);
      }

      const results = {
        success: 0,
        failed: 0,
        errors: [] as any[]
      };

      for (const mappingData of mappings) {
        try {
          // SKU 유효성 검사
          if (!validateSKU(mappingData.sku)) {
            results.failed++;
            results.errors.push({
              sku: mappingData.sku,
              error: 'Invalid SKU format'
            });
            continue;
          }

          // 중복 확인
          const existing = await ProductMapping.findOne({ 
            sku: mappingData.sku.toUpperCase() 
          }).session(session);

          if (existing) {
            results.failed++;
            results.errors.push({
              sku: mappingData.sku,
              error: 'SKU already exists'
            });
            continue;
          }

          // 매핑 생성
          await ProductMapping.create([{
            ...mappingData,
            sku: mappingData.sku.toUpperCase(),
            status: 'ACTIVE',
            syncStatus: 'pending'
          }], { session });

          results.success++;
        } catch (error: any) {
          results.failed++;
          results.errors.push({
            sku: mappingData.sku,
            error: error.message
          });
        }
      }

      await session.commitTransaction();

      res.json({
        success: true,
        data: results,
        message: `${results.success}개 성공, ${results.failed}개 실패`
      });
    } catch (error) {
      await session.abortTransaction();
      next(error);
    } finally {
      session.endSession();
    }
  }

  /**
   * SKU로 상품 검색 - 네이버 API 파라미터 수정 및 성능 최적화
   * GET /api/v1/mappings/search/:sku
   * GET /api/v1/mappings/search-by-sku
   */
  async searchProductsBySku(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // params에서 sku를 가져오거나 query에서 가져옴
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
          error: ''
        },
        shopify: {
          found: false,
          products: [] as any[],
          message: '',
          error: ''
        },
        recommendations: {
          autoMappingPossible: false,
          confidence: 0
        }
      };

      // 네이버와 Shopify 검색을 병렬로 처리하여 성능 개선
      const searchPromises = [];

      // 네이버 상품 검색 Promise
      if (this.naverProductService) {
        const naverPromise = (async () => {
          try {
            logger.info('Searching Naver products...');
            
            let naverProducts: any[] = [];
            
            // SKU로 직접 검색
            try {
              const skuSearchResult = await this.naverProductService.searchProducts({
                searchKeyword: skuUpper,
                searchType: 'SELLER_MANAGEMENT_CODE',
                page: 1,
                size: 5  // 성능을 위해 크기 제한
              });
              
              // 디버깅: API 응답 구조 확인
              logger.info('=== Naver API Response Structure ===');
              if (skuSearchResult) {
                logger.info('Response type:', typeof skuSearchResult);
                logger.info('Response keys:', Object.keys(skuSearchResult));
                
                if (skuSearchResult.contents && skuSearchResult.contents.length > 0) {
                  const firstItem = skuSearchResult.contents[0];
                  logger.info('First content item keys:', Object.keys(firstItem));
                  
                  // channelProducts 구조 확인
                  if (firstItem.channelProducts) {
                    logger.info('channelProducts type:', typeof firstItem.channelProducts);
                    logger.info('channelProducts is array:', Array.isArray(firstItem.channelProducts));
                    
                    if (Array.isArray(firstItem.channelProducts) && firstItem.channelProducts.length > 0) {
                      logger.info('First channelProduct keys:', Object.keys(firstItem.channelProducts[0]));
                      logger.info('First channelProduct sample:', {
                        productNo: firstItem.channelProducts[0].productNo,
                        channelProductNo: firstItem.channelProducts[0].channelProductNo,
                        name: firstItem.channelProducts[0].name,
                        salePrice: firstItem.channelProducts[0].salePrice,
                        sellerManagementCode: firstItem.channelProducts[0].sellerManagementCode,
                        statusType: firstItem.channelProducts[0].statusType
                      });
                    }
                  }
                }
              }
              
              // channelProducts 배열을 평탄화
              if (skuSearchResult && skuSearchResult.contents) {
                const flatProducts = [];
                for (const item of skuSearchResult.contents) {
                  if (item.channelProducts && Array.isArray(item.channelProducts)) {
                    for (const channelProduct of item.channelProducts) {
                      // originProductNo를 추가
                      flatProducts.push({
                        ...channelProduct,
                        originProductNo: item.originProductNo
                      });
                    }
                  }
                }
                
                if (flatProducts.length > 0) {
                  naverProducts = flatProducts;
                  logger.info(`Flattened ${flatProducts.length} products from channelProducts`);
                } else {
                  // channelProducts가 없으면 기존 방식 시도
                  naverProducts = skuSearchResult.contents;
                }
              } else if (skuSearchResult) {
                if (skuSearchResult.items && Array.isArray(skuSearchResult.items)) {
                  naverProducts = skuSearchResult.items;
                } else if (skuSearchResult.content && Array.isArray(skuSearchResult.content)) {
                  naverProducts = skuSearchResult.content;
                } else if (Array.isArray(skuSearchResult)) {
                  naverProducts = skuSearchResult;
                }
              }
            } catch (e: any) {
              logger.warn('Naver SKU search failed:', e.message);
            }

            if (naverProducts.length > 0) {
              logger.info(`Processing ${naverProducts.length} Naver products`);
              
              // 중복 제거: ID가 같거나 비어있는 경우 처리
              const uniqueProducts = new Map();
              naverProducts.forEach((product: any, index: number) => {
                const productId = product.channelProductNo ||
                                 product.productNo || 
                                 product.originProductNo ||
                                 product.id || 
                                 product.productId;
                
                // ID가 있고 중복되지 않은 경우만 추가
                if (productId && !uniqueProducts.has(productId)) {
                  uniqueProducts.set(productId, product);
                } else if (!productId && uniqueProducts.size < 5) {
                  // ID가 없는 경우 인덱스를 키로 사용 (최대 5개)
                  uniqueProducts.set(`temp-${index}`, product);
                }
              });
              
              // Map을 배열로 변환
              const dedupedProducts = Array.from(uniqueProducts.values());
              
              logger.info(`After deduplication: ${dedupedProducts.length} unique products`);
              
              searchResults.naver = {
                found: true,
                products: dedupedProducts.slice(0, 5).map((product: any, index: number) => {
                  // 디버깅: 첫 번째 상품의 실제 데이터 확인
                  if (index === 0) {
                    logger.info('First Naver product raw data:', {
                      hasProductNo: !!product.productNo,
                      hasChannelProductNo: !!product.channelProductNo,
                      hasOriginProductNo: !!product.originProductNo,
                      hasId: !!product.id,
                      hasName: !!product.name,
                      hasSalePrice: !!product.salePrice,
                      actualProductNo: product.productNo,
                      actualChannelProductNo: product.channelProductNo,
                      actualName: product.name,
                      actualSalePrice: product.salePrice
                    });
                  }
                  
                  // 다양한 ID 필드 확인 (channelProductNo 우선)
                  const productId = product.channelProductNo ||
                                   product.productNo || 
                                   product.originProductNo ||
                                   product.id || 
                                   product.productId || 
                                   `naver-${index}`;  // fallback ID
                  
                  // 다양한 이름 필드 확인
                  const productName = product.name || 
                                     product.productName || 
                                     product.modelName || 
                                     product.title ||
                                     'Unknown Product';
                  
                  // 다양한 가격 필드 확인
                  const productPrice = product.salePrice || 
                                      product.discountedPrice || 
                                      product.price || 
                                      product.supplyPrice ||
                                      0;
                  
                  return {
                    id: productId,
                    name: productName,
                    sku: product.sellerManagementCode || product.sellerProductTag || product.sku || skuUpper,
                    price: productPrice,
                    imageUrl: product.representativeImage?.url || product.imageUrl || '',
                    stockQuantity: product.stockQuantity || 0,
                    status: product.statusType || product.channelProductDisplayStatusType || product.saleStatus || product.status || 'SALE',
                    similarity: this.calculateSimilarity(
                      skuUpper, 
                      product.sellerManagementCode || product.sellerProductTag || product.sku || ''
                    )
                  };
                }),
                message: `네이버에서 ${dedupedProducts.length}개의 상품을 찾았습니다.`,
                error: ''
              };
              
              logger.info(`Found ${dedupedProducts.length} unique Naver products for SKU: ${skuUpper}`);
            } else {
              searchResults.naver.message = '네이버에서 일치하는 상품을 찾을 수 없습니다.';
              logger.info(`No Naver products found for SKU: ${skuUpper}`);
            }
          } catch (naverError: any) {
            logger.error('Naver search error:', naverError);
            searchResults.naver.error = naverError.message || 'Naver 검색 중 오류가 발생했습니다.';
          }
        })();
        
        searchPromises.push(naverPromise);
      }

      // Shopify 상품 검색 Promise
      if (this.shopifySearchService) {
        const shopifyPromise = (async () => {
          try {
            logger.info('Searching Shopify products with ShopifyProductSearchService...');
            
            const shopifyResult = await this.shopifySearchService.searchBySKU(skuUpper);
            
            if (shopifyResult && shopifyResult.found && shopifyResult.products.length > 0) {
              searchResults.shopify = {
                found: true,
                products: shopifyResult.products.slice(0, 5).map((product: any) => ({
                  id: product.product_id || product.id,
                  variantId: product.id || product.variant_id,
                  title: product.product_title || product.title || '',
                  variantTitle: product.variant_title || '',
                  sku: product.sku || skuUpper,
                  price: product.price || '0',
                  imageUrl: product.imageUrl || '',
                  inventoryQuantity: product.inventory_quantity || 0,
                  vendor: product.vendor || 'album',
                  similarity: this.calculateSimilarity(skuUpper, product.sku || '')
                })),
                message: `Shopify에서 ${shopifyResult.products.length}개의 상품을 찾았습니다.`,
                error: ''
              };
            } else {
              searchResults.shopify.message = 'Shopify에서 일치하는 상품을 찾을 수 없습니다.';
            }
          } catch (shopifyError: any) {
            logger.error('Shopify search error:', shopifyError);
            searchResults.shopify.error = shopifyError.message || 'Shopify 검색 중 오류가 발생했습니다.';
          }
        })();
        
        searchPromises.push(shopifyPromise);
      }

      // 모든 검색을 병렬로 실행
      await Promise.all(searchPromises);

      // 자동 매핑 가능 여부 판단
      if (searchResults.naver.found && searchResults.shopify.found) {
        const naverProduct = searchResults.naver.products[0];
        const shopifyProduct = searchResults.shopify.products[0];
        
        if (naverProduct && shopifyProduct) {
          const skuMatch = naverProduct.similarity > 80 && shopifyProduct.similarity > 80;
          searchResults.recommendations = {
            autoMappingPossible: skuMatch,
            confidence: skuMatch ? Math.min(naverProduct.similarity, shopifyProduct.similarity) : 0
          };
        }
      }

      logger.info('Search results:', {
        sku: skuUpper,
        naverFound: searchResults.naver.found,
        naverCount: searchResults.naver.products.length,
        shopifyFound: searchResults.shopify.found,
        shopifyCount: searchResults.shopify.products.length
      });

      res.json({
        success: true,
        data: searchResults
      });

    } catch (error) {
      logger.error('Search products error:', error);
      next(error);
    }
  }

  /**
   * 매핑 데이터 검증 (생성 전)
   * POST /api/v1/mappings/validate
   */
  async validateMappingData(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { sku, naverProductId, shopifyProductId, shopifyVariantId } = req.body;

      if (!sku) {
        throw new AppError('SKU is required for validation', 400);
      }

      const validation = {
        isValid: true,
        errors: [] as string[],
        warnings: [] as string[],
        naverProduct: null as any,
        shopifyProduct: null as any
      };

      // SKU 유효성 검사
      if (!validateSKU(sku)) {
        validation.errors.push('Invalid SKU format');
        validation.isValid = false;
      }

      // 중복 확인
      const existing = await ProductMapping.findOne({ 
        sku: sku.toUpperCase() 
      });
      
      if (existing) {
        validation.errors.push('SKU already exists');
        validation.isValid = false;
      }

      // 네이버 상품 확인
      if (naverProductId && naverProductId !== 'PENDING') {
        if (this.naverProductService) {
          try {
            const naverProduct = await this.naverProductService.getProduct(naverProductId);
            if (naverProduct) {
              validation.naverProduct = naverProduct;
            } else {
              validation.warnings.push('Naver product not found');
            }
          } catch (error) {
            validation.warnings.push('Unable to verify Naver product');
          }
        }
      } else {
        validation.warnings.push('Naver product ID is missing');
      }

      // Shopify 상품 확인 - ShopifyProductSearchService 사용
      if (shopifyProductId && shopifyProductId !== 'PENDING') {
        if (this.shopifySearchService) {
          try {
            const shopifyProduct = await this.searchShopifyProducts(sku);
            if (shopifyProduct) {
              validation.shopifyProduct = shopifyProduct;
              
              // Variant 확인
              if (shopifyVariantId && shopifyVariantId !== 'PENDING') {
                if (shopifyProduct.id !== shopifyVariantId) {
                  validation.warnings.push('Shopify variant ID mismatch');
                }
              }
            } else {
              validation.warnings.push('Shopify product not found');
            }
          } catch (error) {
            validation.warnings.push('Unable to verify Shopify product');
          }
        }
      } else {
        validation.warnings.push('Shopify product ID is missing');
      }

      res.json({
        success: true,
        data: validation
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PENDING 매핑 재시도 - 네이버 API 파라미터 수정
   * POST /api/v1/mappings/:id/retry
   */
  async retryPendingMapping(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;

      const mapping = await ProductMapping.findById(id);
      if (!mapping) {
        throw new AppError('Mapping not found', 404);
      }

      if (mapping.status !== 'PENDING') {
        throw new AppError('Mapping is not in PENDING status', 400);
      }

      let updated = false;

      // 네이버 재검색 - 올바른 파라미터 사용
      if (mapping.naverProductId === 'PENDING' && this.naverProductService) {
        try {
          const naverProducts = await this.naverProductService.searchProducts({
            searchKeyword: mapping.sku,  // keyword가 아닌 searchKeyword 사용
            searchType: 'SELLER_MANAGEMENT_CODE',  // searchType 추가
            page: 1,
            size: 1
          });
          if (naverProducts && naverProducts.contents && naverProducts.contents.length > 0) {
            mapping.naverProductId = naverProducts.contents[0].productNo || mapping.naverProductId;
            updated = true;
          }
        } catch (error) {
          logger.warn('Failed to retry Naver search:', error);
        }
      }

      // Shopify 재검색 - ShopifyProductSearchService 사용
      if (mapping.shopifyProductId === 'PENDING' && this.shopifySearchService) {
        const shopifyProduct = await this.searchShopifyProducts(mapping.sku);
        if (shopifyProduct) {
          mapping.shopifyProductId = shopifyProduct.product_id;
          mapping.shopifyVariantId = shopifyProduct.id;
          updated = true;
        }
      }

      if (updated) {
        // 모든 ID가 채워졌는지 확인
        if (mapping.naverProductId !== 'PENDING' &&
            mapping.shopifyProductId !== 'PENDING' &&
            mapping.shopifyVariantId !== 'PENDING') {
          mapping.status = 'ACTIVE';
          mapping.isActive = true;
        }
        
        mapping.retryCount = (mapping.retryCount || 0) + 1;
        mapping.lastRetryAt = new Date();
        
        await mapping.save();
      }

      res.json({
        success: true,
        data: mapping,
        message: updated 
          ? '매핑이 업데이트되었습니다.'
          : '일부 정보를 찾을 수 없습니다. 수동으로 입력해주세요.'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 매핑 내보내기
   * GET /api/v1/mappings/export
   */
  async exportMappings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { format = 'json' } = req.query;

      const mappings = await ProductMapping.find({ status: 'ACTIVE' });

      if (format === 'csv') {
        // CSV 형식으로 변환
        const csv = this.convertToCSV(mappings);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=mappings.csv');
        res.send(csv);
      } else if (format === 'xlsx') {
        // Excel 형식으로 변환
        const worksheet = XLSX.utils.json_to_sheet(mappings.map(m => m.toObject()));
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Mappings');
        const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=mappings.xlsx');
        res.send(buffer);
      } else {
        res.json({
          success: true,
          data: mappings
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
  async importMappings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { data, format = 'json' } = req.body;

      let mappings = [];

      if (format === 'csv') {
        // CSV 파싱
        mappings = this.parseCSV(data);
      } else {
        mappings = data;
      }

      // 대량 업로드 처리
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
  async syncMapping(req: Request, res: Response, next: NextFunction): Promise<void> {
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
        message: '동기화가 시작되었습니다.'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 매핑 통계
   * GET /api/v1/mappings/stats
   */
  async getMappingStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const stats = await ProductMapping.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]);

      const total = await ProductMapping.countDocuments();
      const active = stats.find(s => s._id === 'ACTIVE')?.count || 0;
      const pending = stats.find(s => s._id === 'PENDING')?.count || 0;
      const inactive = stats.find(s => s._id === 'INACTIVE')?.count || 0;

      res.json({
        success: true,
        data: {
          total,
          active,
          pending,
          inactive,
          syncedToday: await ProductMapping.countDocuments({
            lastSyncAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) }
          })
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * CSV 변환 헬퍼
   */
  private convertToCSV(data: any[]): string {
    if (!data.length) return '';
    
    const headers = Object.keys(data[0].toObject());
    const csv = [
      headers.join(','),
      ...data.map(item => {
        const obj = item.toObject();
        return headers.map(header => {
          const value = obj[header];
          return typeof value === 'string' && value.includes(',') 
            ? `"${value}"` 
            : value;
        }).join(',');
      })
    ].join('\n');
    
    return csv;
  }

  /**
   * CSV 파싱 헬퍼
   */
  private parseCSV(csvData: string): any[] {
    const lines = csvData.split('\n');
    if (lines.length < 2) return [];
    
    const headers = lines[0].split(',');
    const mappings = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',');
      const mapping: any = {};
      
      headers.forEach((header, index) => {
        mapping[header.trim()] = values[index]?.trim();
      });
      
      if (mapping.sku) {
        mappings.push(mapping);
      }
    }
    
    return mappings;
  }
}