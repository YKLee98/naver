// ===== 2. packages/backend/src/controllers/MappingController.ts =====
import { Request, Response, NextFunction } from 'express';
import { MappingService } from '../services/sync';
import { ProductMapping, Activity, InventoryTransaction } from '../models';
import { AppError } from '../middlewares/error.middleware';
import { logger } from '../utils/logger';
import * as XLSX from 'xlsx';
import { NaverProductService } from '../services/naver';
import { ShopifyGraphQLService } from '../services/shopify';
import { getRedisClient } from '../config/redis';
import { v4 as uuidv4 } from 'uuid';

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
  private naverProductService: NaverProductService;
  private shopifyGraphQLService: ShopifyGraphQLService;
  private redis: any;

  constructor(
    mappingService: MappingService,
    naverProductService: NaverProductService,
    shopifyGraphQLService: ShopifyGraphQLService
  ) {
    this.mappingService = mappingService;
    this.naverProductService = naverProductService;
    this.shopifyGraphQLService = shopifyGraphQLService;
    this.redis = getRedisClient();
  }

  /**
   * 개선된 SKU 패턴 추출 함수
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
   * 개선된 네이버 상품 검색
   */
  private async searchNaverProductBySku(sku: string): Promise<{
    found: boolean;
    products: any[];
    message?: string;
    error?: string;
  }> {
    try {
      logger.info(`Searching Naver product for SKU: ${sku}`);
      
      // 여러 검색 전략 시도
      const searchStrategies = [
        // 1. 정확한 SKU 검색
        () => this.naverProductService.searchProducts({ keyword: sku }),
        // 2. SKU 패턴 변형 검색
        () => this.naverProductService.searchProducts({ 
          keyword: sku.replace(/[-_]/g, ' ') 
        }),
        // 3. 부분 문자열 검색
        () => {
          const parts = sku.split(/[-_]/);
          if (parts.length > 1) {
            return this.naverProductService.searchProducts({ 
              keyword: parts[0] 
            });
          }
          return null;
        }
      ];
      
      for (const strategy of searchStrategies) {
        const result = await strategy();
        if (result && result.items && result.items.length > 0) {
          // SKU가 포함된 상품 필터링
          const filteredProducts = result.items.filter(item => {
            const itemText = `${item.name} ${item.detailContent || ''}`.toUpperCase();
            return itemText.includes(sku.toUpperCase()) || 
                   this.calculateSimilarity(item.name, sku) > 60;
          });
          
          if (filteredProducts.length > 0) {
            return {
              found: true,
              products: filteredProducts.map(item => ({
                id: item.productId,
                name: item.name,
                price: item.salePrice,
                status: item.statusType,
                stockQuantity: item.stockQuantity,
                similarity: this.calculateSimilarity(item.name, sku)
              })).sort((a, b) => b.similarity - a.similarity).slice(0, 5)
            };
          }
        }
      }
      
      return {
        found: false,
        products: [],
        message: '네이버에서 상품을 찾을 수 없습니다. 수동으로 ID를 입력해주세요.'
      };
    } catch (error: any) {
      logger.error(`Error searching Naver product for SKU ${sku}:`, error);
      return {
        found: false,
        products: [],
        error: error.message || '네이버 상품 검색 중 오류가 발생했습니다.'
      };
    }
  }

  /**
   * 개선된 Shopify 상품 검색
   */
  private async searchShopifyProductBySku(sku: string): Promise<{
    found: boolean;
    products: any[];
    message?: string;
    error?: string;
  }> {
    try {
      logger.info(`Searching Shopify product for SKU: ${sku}`);
      
      // GraphQL 쿼리로 SKU 검색
      const query = `
        query searchProductsBySku($query: String!) {
          products(first: 10, query: $query) {
            edges {
              node {
                id
                title
                vendor
                status
                variants(first: 10) {
                  edges {
                    node {
                      id
                      sku
                      price
                      inventoryItem {
                        id
                        inventoryLevels(first: 1) {
                          edges {
                            node {
                              location {
                                id
                                name
                              }
                              available
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `;
      
      const response = await this.shopifyGraphQLService.query(query, { query: `sku:${sku}*` });
      
      if (response.data?.products?.edges?.length > 0) {
        const products = [];
        
        for (const edge of response.data.products.edges) {
          const product = edge.node;
          
          for (const variantEdge of product.variants.edges) {
            const variant = variantEdge.node;
            
            // SKU 유사도 확인
            const similarity = this.calculateSimilarity(variant.sku || '', sku);
            
            if (similarity > 50) {
              products.push({
                id: product.id.split('/').pop(),
                variantId: variant.id.split('/').pop(),
                title: product.title,
                sku: variant.sku,
                vendor: product.vendor,
                price: variant.price,
                status: product.status,
                inventoryItemId: variant.inventoryItem?.id?.split('/').pop(),
                locationId: variant.inventoryItem?.inventoryLevels?.edges[0]?.node?.location?.id?.split('/').pop(),
                available: variant.inventoryItem?.inventoryLevels?.edges[0]?.node?.available || 0,
                similarity
              });
            }
          }
        }
        
        if (products.length > 0) {
          return {
            found: true,
            products: products.sort((a, b) => b.similarity - a.similarity).slice(0, 5)
          };
        }
      }
      
      return {
        found: false,
        products: [],
        message: 'Shopify에서 상품을 찾을 수 없습니다. 수동으로 ID를 입력해주세요.'
      };
    } catch (error: any) {
      logger.error(`Error searching Shopify product for SKU ${sku}:`, error);
      return {
        found: false,
        products: [],
        error: error.message || 'Shopify 상품 검색 중 오류가 발생했습니다.'
      };
    }
  }

  /**
   * SKU로 네이버와 Shopify 상품 자동 검색
   * GET /api/v1/mappings/search/:sku
   */
  searchProductsBySku = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { sku } = req.params;
      
      if (!sku || sku.length < 2) {
        throw new AppError('SKU must be at least 2 characters', 400);
      }

      // 동시에 양쪽 플랫폼 검색
      const [naverResults, shopifyResults] = await Promise.all([
        this.searchNaverProductBySku(sku),
        this.searchShopifyProductBySku(sku)
      ]);

      res.json({
        success: true,
        data: {
          sku,
          naver: naverResults,
          shopify: shopifyResults,
          recommendations: {
            autoMappingPossible: naverResults.found && shopifyResults.found,
            confidence: Math.min(
              naverResults.products[0]?.similarity || 0,
              shopifyResults.products[0]?.similarity || 0
            )
          }
        }
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * 개선된 매핑 생성 (자동 복구 기능 포함)
   * POST /api/v1/mappings
   */
  createMapping = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
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
        autoSearch = true
      } = req.body;

      if (!sku) {
        throw new AppError('SKU is required', 400);
      }

      // 개선된 SKU 유효성 검사
      if (!validateSKU(sku)) {
        throw new AppError('Invalid SKU format', 400);
      }

      // 중복 확인
      const existingMapping = await ProductMapping.findOne({ sku: sku.toUpperCase() }).session(session);
      if (existingMapping) {
        throw new AppError('SKU already exists', 409);
      }

      let finalNaverProductId = naverProductId;
      let finalShopifyProductId = shopifyProductId;
      let finalShopifyVariantId = shopifyVariantId;
      let shopifyInventoryItemId = null;
      let shopifyLocationId = null;
      let productName = '';
      let vendor = '';
      let searchConfidence = 100;
      let searchResults = {};

      // 자동 검색이 활성화되어 있고 ID가 제공되지 않은 경우
      if (autoSearch) {
        // 네이버 상품 검색
        if (!naverProductId) {
          logger.info(`Auto-searching Naver product for SKU: ${sku}`);
          const naverResults = await this.searchNaverProductBySku(sku);
          searchResults['naver'] = naverResults;
          
          if (naverResults.found && naverResults.products.length > 0) {
            const bestMatch = naverResults.products[0];
            finalNaverProductId = bestMatch.id;
            productName = bestMatch.name;
            searchConfidence = Math.min(searchConfidence, bestMatch.similarity || 80);
          } else {
            // 자동 검색 실패 시 PENDING 상태로 생성
            logger.warn(`Auto-search failed for Naver product: ${sku}`);
            finalNaverProductId = 'PENDING';
          }
        }

        // Shopify 상품 검색
        if (!shopifyProductId || !shopifyVariantId) {
          logger.info(`Auto-searching Shopify product for SKU: ${sku}`);
          const shopifyResults = await this.searchShopifyProductBySku(sku);
          searchResults['shopify'] = shopifyResults;
          
          if (shopifyResults.found && shopifyResults.products.length > 0) {
            const bestMatch = shopifyResults.products[0];
            finalShopifyProductId = bestMatch.id || 'PENDING';
            finalShopifyVariantId = bestMatch.variantId || 'PENDING';
            vendor = bestMatch.vendor || 'album';
            shopifyInventoryItemId = bestMatch.inventoryItemId || null;
            shopifyLocationId = bestMatch.locationId || null;
            searchConfidence = Math.min(searchConfidence, bestMatch.similarity || 80);
          } else {
            logger.warn(`Auto-search failed for Shopify product: ${sku}`);
            finalShopifyProductId = 'PENDING';
            finalShopifyVariantId = 'PENDING';
          }
        }
      }

      // 매핑 상태 결정
      const mappingStatus = (
        finalNaverProductId === 'PENDING' || 
        finalShopifyProductId === 'PENDING' || 
        finalShopifyVariantId === 'PENDING'
      ) ? 'PENDING' : 'ACTIVE';

      // 매핑 생성 (부분 정보로도 생성 가능)
      const mapping = await ProductMapping.create([{
        sku: sku.toUpperCase(),
        naverProductId: finalNaverProductId || 'PENDING',
        shopifyProductId: finalShopifyProductId || 'PENDING',
        shopifyVariantId: finalShopifyVariantId || 'PENDING',
        shopifyInventoryItemId,
        shopifyLocationId,
        productName: productName || sku,
        vendor: vendor || 'album',
        priceMargin: priceMargin / 100,
        isActive: mappingStatus === 'ACTIVE' ? isActive : false,
        status: mappingStatus,
        syncStatus: 'pending',
        retryCount: 0,
        metadata: {
          createdBy: (req as any).user?.id,
          autoSearchUsed: autoSearch,
          searchConfidence,
          searchResults
        }
      }], { session });

      // 초기 동기화 시도 (ACTIVE 상태인 경우만)
      if (mappingStatus === 'ACTIVE' && isActive) {
        try {
          await this.triggerInitialSync(sku, session);
        } catch (syncError) {
          logger.warn(`Initial sync failed for ${sku}, will retry later:`, syncError);
        }
      }

      // 검증 실행 (실패해도 매핑은 생성)
      let validation = { isValid: true, errors: [], warnings: [] };
      if (mappingStatus === 'ACTIVE') {
        try {
          validation = await this.mappingService.validateMapping(sku);
        } catch (validationError) {
          logger.warn(`Validation failed for ${sku}:`, validationError);
        }
      }

      await session.commitTransaction();

      // 활동 로그 기록
      await Activity.create({
        type: 'mapping_created',
        action: `매핑 생성: ${sku}`,
        details: {
          autoSearch,
          status: mappingStatus,
          validation,
          searchConfidence
        },
        userId: (req as any).user?.id
      });

      res.status(201).json({
        success: true,
        data: {
          mapping: mapping[0],
          validation,
          message: mappingStatus === 'PENDING' 
            ? '매핑이 생성되었으나 일부 정보가 누락되었습니다. 수동으로 업데이트해주세요.'
            : '매핑이 성공적으로 생성되었습니다.'
        }
      });
    } catch (error) {
      await session.abortTransaction();
      next(error);
    } finally {
      session.endSession();
    }
  };

  /**
   * PENDING 매핑 재시도
   * POST /api/v1/mappings/:id/retry
   */
  retryPendingMapping = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
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
      
      // 네이버 ID가 PENDING인 경우 재검색
      if (mapping.naverProductId === 'PENDING') {
        const naverResults = await this.searchNaverProductBySku(mapping.sku);
        if (naverResults.found && naverResults.products.length > 0) {
          mapping.naverProductId = naverResults.products[0].id;
          mapping.productName = naverResults.products[0].name;
          updated = true;
        }
      }
      
      // Shopify ID가 PENDING인 경우 재검색
      if (mapping.shopifyProductId === 'PENDING' || mapping.shopifyVariantId === 'PENDING') {
        const shopifyResults = await this.searchShopifyProductBySku(mapping.sku);
        if (shopifyResults.found && shopifyResults.products.length > 0) {
          const bestMatch = shopifyResults.products[0];
          mapping.shopifyProductId = bestMatch.id;
          mapping.shopifyVariantId = bestMatch.variantId;
          mapping.shopifyInventoryItemId = bestMatch.inventoryItemId || null;
          mapping.shopifyLocationId = bestMatch.locationId || null;
          mapping.vendor = bestMatch.vendor || mapping.vendor;
          updated = true;
        }
      }
      
      // 모든 필수 정보가 있으면 ACTIVE로 변경
      if (updated && 
          mapping.naverProductId !== 'PENDING' && 
          mapping.shopifyProductId !== 'PENDING' && 
          mapping.shopifyVariantId !== 'PENDING') {
        mapping.status = 'ACTIVE';
        mapping.isActive = true;
        logger.info(`Mapping ${mapping.sku} recovered successfully`);
      }
      
      // 재시도 카운트 증가
      mapping.retryCount = (mapping.retryCount || 0) + 1;
      mapping.lastRetryAt = new Date();
      
      await mapping.save();

      res.json({
        success: true,
        data: {
          mapping,
          message: mapping.status === 'ACTIVE' 
            ? '매핑이 성공적으로 복구되었습니다.'
            : '일부 정보를 찾을 수 없습니다. 수동으로 입력해주세요.'
        }
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * 초기 동기화 트리거
   */
  private async triggerInitialSync(sku: string, session: any): Promise<void> {
    try {
      // Redis에 동기화 작업 추가
      await this.redis.rpush('sync:queue', JSON.stringify({
        sku,
        type: 'initial',
        timestamp: new Date().toISOString()
      }));
      
      logger.info(`Initial sync queued for SKU: ${sku}`);
    } catch (error) {
      logger.error(`Failed to queue initial sync for SKU ${sku}:`, error);
      throw error;
    }
  }
}
