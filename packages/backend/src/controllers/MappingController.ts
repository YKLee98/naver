// ===== 1. packages/backend/src/controllers/MappingController.ts (완전한 엔터프라이즈급 구현) =====
import { Request, Response, NextFunction } from 'express';
import { MappingService } from '../services/sync';
import { ProductMapping, Activity, InventoryTransaction } from '../models';
import { AppError } from '../middlewares/error.middleware';
import { logger } from '../utils/logger';
import * as XLSX from 'xlsx';
// validateSKU 함수를 직접 정의 (validators 파일 import 문제 해결)
function validateSKU(sku: string): boolean {
  if (!sku || typeof sku !== 'string') return false;
  
  // 유연한 SKU 검증 - 거의 모든 문자 허용
  const trimmedSku = sku.trim();
  
  if (trimmedSku.length < 1 || trimmedSku.length > 100) {
    return false;
  }
  
  // 제어 문자나 줄바꿈 문자만 제외
  const invalidCharsRegex = /[\x00-\x1F\x7F\r\n\t]/;
  if (invalidCharsRegex.test(trimmedSku)) {
    return false;
  }
  
  return true;
}
import { NaverProductService } from '../services/naver';
import { ShopifyGraphQLService } from '../services/shopify';
import { getRedisClient } from '../config/redis';
import { v4 as uuidv4 } from 'uuid';

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
   * SKU로 네이버와 Shopify 상품 자동 검색 (핵심 기능!)
   * GET /api/v1/mappings/search-by-sku
   */
  searchProductsBySku = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { sku } = req.query;

      if (!sku || typeof sku !== 'string') {
        throw new AppError('SKU is required', 400);
      }

      // SKU 유효성 검사
      if (!validateSKU(sku)) {
        throw new AppError('Invalid SKU format', 400);
      }

      logger.info(`Searching products for SKU: ${sku}`);

      // 캐시 확인 (Redis가 있는 경우에만)
      let cached = null;
      const cacheKey = `sku-search:${sku}`;
      
      try {
        if (this.redis && typeof this.redis.get === 'function') {
          cached = await this.redis.get(cacheKey);
          if (cached) {
            logger.info(`Cache hit for SKU: ${sku}`);
            res.json(JSON.parse(cached));
            return;
          }
        }
      } catch (cacheError) {
        logger.warn('Cache read error:', cacheError);
        // 캐시 오류는 무시하고 계속 진행
      }

      // 병렬로 네이버와 Shopify에서 상품 검색
      const [naverResults, shopifyResults] = await Promise.all([
        this.searchNaverProductBySku(sku),
        this.searchShopifyProductBySku(sku)
      ]);

      // 활동 로그 기록
      await Activity.create({
        type: 'mapping_change',  // 'mapping_search'를 지원하는 enum으로 변경
        action: `SKU 검색: ${sku}`,
        details: `네이버: ${naverResults.found ? naverResults.products.length + '개 발견' : '없음'}, Shopify: ${shopifyResults.found ? shopifyResults.products.length + '개 발견' : '없음'}`,
        status: 'success',
        metadata: {
          sku,
          naverFound: naverResults.found,
          shopifyFound: shopifyResults.found,
          naverProductCount: naverResults.products.length,
          shopifyProductCount: shopifyResults.products.length
        }
      });

      const response = {
        success: true,
        data: {
          sku,
          naver: naverResults,
          shopify: shopifyResults,
          timestamp: new Date().toISOString()
        }
      };

      // 캐시 저장 (Redis가 있는 경우에만, 5분간)
      try {
        if (this.redis) {
          if (typeof this.redis.setex === 'function') {
            await this.redis.setex(cacheKey, 300, JSON.stringify(response));
          } else if (typeof this.redis.set === 'function') {
            // setex가 없으면 set과 expire 조합 사용
            await this.redis.set(cacheKey, JSON.stringify(response));
            if (typeof this.redis.expire === 'function') {
              await this.redis.expire(cacheKey, 300);
            }
          }
        }
      } catch (cacheError) {
        logger.warn('Cache write error:', cacheError);
        // 캐시 오류는 무시하고 계속 진행
      }

      res.json(response);
    } catch (error) {
      logger.error('Error searching products by SKU:', error);
      next(error);
    }
  };

  /**
   * 네이버에서 SKU로 상품 검색
   */
  private async searchNaverProductBySku(sku: string): Promise<any> {
    try {
      // 1. 키워드 검색으로 상품 찾기
      const searchResults = await this.naverProductService.searchProducts({
        keyword: sku,
        page: 1,
        size: 10
      });

      if (searchResults && searchResults.items && searchResults.items.length > 0) {
        // SKU가 정확히 일치하는 상품 찾기
        const exactMatch = searchResults.items.find((item: any) => 
          item.sellerManagementCode === sku
        );

        if (exactMatch) {
          return {
            found: true,
            products: [{
              id: exactMatch.originProductId || exactMatch.id,
              name: exactMatch.name,
              sku: exactMatch.sellerManagementCode,
              price: exactMatch.salePrice,
              imageUrl: exactMatch.representativeImage?.url || exactMatch.imageUrl,
              stockQuantity: exactMatch.stockQuantity,
              status: exactMatch.saleStatus,
              category: exactMatch.category?.wholeCategoryName,
              brand: exactMatch.brand
            }],
            message: '정확한 SKU 매칭으로 상품을 찾았습니다.'
          };
        }

        // 정확한 매칭이 없으면 유사한 상품들 반환
        const products = searchResults.items.map((item: any) => ({
          id: item.originProductId || item.id,
          name: item.name,
          sku: item.sellerManagementCode || '',
          price: item.salePrice,
          imageUrl: item.representativeImage?.url || item.imageUrl,
          stockQuantity: item.stockQuantity,
          status: item.saleStatus,
          category: item.category?.wholeCategoryName,
          brand: item.brand,
          similarity: this.calculateSimilarity(sku, item.sellerManagementCode || item.name)
        }));

        // 유사도 순으로 정렬
        products.sort((a: any, b: any) => b.similarity - a.similarity);

        return {
          found: true,
          products: products.slice(0, 5), // 상위 5개만 반환
          message: '키워드 검색으로 유사한 상품을 찾았습니다.'
        };
      }

      return {
        found: false,
        products: [],
        message: '네이버에서 해당 SKU의 상품을 찾을 수 없습니다.'
      };
    } catch (error: any) {
      logger.error(`Error searching Naver product for SKU ${sku}:`, error.message || error);
      return {
        found: false,
        products: [],
        error: error.message || '네이버 상품 검색 중 오류가 발생했습니다.'
      };
    }
  }

  /**
   * Shopify에서 SKU로 상품 검색
   */
  private async searchShopifyProductBySku(sku: string): Promise<any> {
    try {
      // 1. GraphQL로 정확한 SKU 검색
      const exactMatch = await this.shopifyGraphQLService.findVariantBySku(sku);
      if (exactMatch) {
        return {
          found: true,
          products: [{
            id: exactMatch.product.id,
            variantId: exactMatch.id,
            title: exactMatch.product.title,
            variantTitle: exactMatch.title,
            sku: exactMatch.sku,
            price: exactMatch.price,
            compareAtPrice: exactMatch.compareAtPrice,
            imageUrl: exactMatch.image?.src || exactMatch.product.image?.src,
            inventoryQuantity: exactMatch.inventoryQuantity,
            vendor: exactMatch.product.vendor,
            productType: exactMatch.product.productType,
            tags: exactMatch.product.tags
          }],
          message: '정확한 SKU 매칭으로 상품을 찾았습니다.'
        };
      }

      // 2. vendor 기반 전체 상품 검색 후 필터링
      const allProducts = await this.shopifyGraphQLService.getProductsByVendor('album');
      const matchingProducts = [];

      for (const product of allProducts) {
        if (product.variants && Array.isArray(product.variants)) {
          for (const variant of product.variants) {
            // SKU 부분 매칭 또는 제목 매칭
            if (
              (variant.sku && variant.sku.toLowerCase().includes(sku.toLowerCase())) ||
              (product.title && product.title.toLowerCase().includes(sku.toLowerCase()))
            ) {
              matchingProducts.push({
                id: product.id,
                variantId: variant.id,
                title: product.title,
                variantTitle: variant.title,
                sku: variant.sku,
                price: variant.price,
                compareAtPrice: variant.compareAtPrice,
                imageUrl: variant.image?.src || product.image?.src,
                inventoryQuantity: variant.inventoryQuantity,
                vendor: product.vendor,
                productType: product.productType,
                tags: product.tags,
                similarity: this.calculateSimilarity(sku, variant.sku || product.title)
              });
            }
          }
        }
      }

      if (matchingProducts.length > 0) {
        // 유사도 순으로 정렬
        matchingProducts.sort((a, b) => b.similarity - a.similarity);

        return {
          found: true,
          products: matchingProducts.slice(0, 5), // 상위 5개만 반환
          message: '유사한 상품을 찾았습니다.'
        };
      }

      return {
        found: false,
        products: [],
        message: 'Shopify에서 해당 SKU의 상품을 찾을 수 없습니다.'
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
   * 매핑 생성 (자동 검색 포함)
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

      // SKU 유효성 검사
      if (!validateSKU(sku)) {
        throw new AppError('Invalid SKU format', 400);
      }

      // 중복 확인
      const existingMapping = await ProductMapping.findOne({ sku }).session(session);
      if (existingMapping) {
        throw new AppError('SKU already exists', 409);
      }

      let finalNaverProductId = naverProductId;
      let finalShopifyProductId = shopifyProductId;
      let finalShopifyVariantId = shopifyVariantId;
      let shopifyInventoryItemId = '';
      let shopifyLocationId = '';
      let productName = '';
      let vendor = '';

      // 자동 검색이 활성화되어 있고 ID가 제공되지 않은 경우
      if (autoSearch) {
        if (!naverProductId) {
          logger.info(`Auto-searching Naver product for SKU: ${sku}`);
          const naverResults = await this.searchNaverProductBySku(sku);
          if (naverResults.found && naverResults.products.length > 0) {
            finalNaverProductId = naverResults.products[0].id;
            productName = naverResults.products[0].name;
          } else {
            throw new AppError('네이버에서 상품을 찾을 수 없습니다. 수동으로 ID를 입력해주세요.', 404);
          }
        }

        if (!shopifyProductId || !shopifyVariantId) {
          logger.info(`Auto-searching Shopify product for SKU: ${sku}`);
          const shopifyResults = await this.searchShopifyProductBySku(sku);
          if (shopifyResults.found && shopifyResults.products.length > 0) {
            const product = shopifyResults.products[0];
            finalShopifyProductId = product.id;
            finalShopifyVariantId = product.variantId;
            vendor = product.vendor || '';
            
            // 추가 정보 조회
            const variantDetails = await this.shopifyGraphQLService.getVariantDetails(product.variantId);
            if (variantDetails) {
              shopifyInventoryItemId = variantDetails.inventoryItem?.id || '';
              shopifyLocationId = variantDetails.inventoryItem?.inventoryLevels?.edges[0]?.node?.location?.id || '';
            }
          } else {
            throw new AppError('Shopify에서 상품을 찾을 수 없습니다. 수동으로 ID를 입력해주세요.', 404);
          }
        }
      }

      // 필수 필드 확인
      if (!finalNaverProductId || !finalShopifyProductId || !finalShopifyVariantId) {
        throw new AppError('네이버와 Shopify 상품 ID가 모두 필요합니다.', 400);
      }

      // 매핑 생성
      const mapping = await ProductMapping.create([{
        sku: sku.toUpperCase(),
        naverProductId: finalNaverProductId,
        shopifyProductId: finalShopifyProductId,
        shopifyVariantId: finalShopifyVariantId,
        shopifyInventoryItemId,
        shopifyLocationId,
        productName,
        vendor,
        priceMargin: priceMargin / 100,
        isActive,
        status: 'ACTIVE',
        syncStatus: 'pending',
        metadata: {
          createdBy: (req as any).user?.id,
          autoSearchUsed: autoSearch
        }
      }], { session });

      // 초기 재고 동기화 트리거
      if (isActive) {
        await this.triggerInitialSync(sku, session);
      }

      // 검증 실행
      const validation = await this.mappingService.validateMapping(sku);

      // 활동 로그 기록
      await Activity.create([{
        type: 'mapping_created',
        action: `매핑 생성: ${sku}`,
        details: `자동 검색: ${autoSearch ? '예' : '아니오'}, 검증 결과: ${validation.isValid ? '성공' : '실패'}`,
        status: 'success',
        metadata: {
          sku,
          autoSearch,
          naverProductId: finalNaverProductId,
          shopifyProductId: finalShopifyProductId,
          userId: (req as any).user?.id
        }
      }], { session });

      await session.commitTransaction();
      
      res.status(201).json({
        success: true,
        data: {
          mapping: mapping[0],
          validation
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
   * 초기 동기화 트리거
   */
  private async triggerInitialSync(sku: string, session: any): Promise<void> {
    try {
      // 동기화 작업을 큐에 추가
      const jobId = uuidv4();
      await this.redis.rpush('sync-queue', JSON.stringify({
        jobId,
        type: 'initial-sync',
        sku,
        timestamp: new Date().toISOString()
      }));

      logger.info(`Initial sync triggered for SKU: ${sku}, Job ID: ${jobId}`);
    } catch (error) {
      logger.error(`Failed to trigger initial sync for SKU ${sku}:`, error);
      // 초기 동기화 실패는 매핑 생성을 막지 않음
    }
  }

  /**
   * 매핑 목록 조회 (고급 필터링)
   * GET /api/v1/mappings
   */
  getMappings = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const {
        page = 1,
        limit = 20,
        search,
        status,
        isActive,
        syncStatus,
        vendor,
        sortBy = 'updatedAt',
        order = 'desc',
        lastSyncedBefore,
        lastSyncedAfter
      } = req.query;

      const query: any = {};

      // 검색 조건
      if (search) {
        query.$or = [
          { sku: { $regex: search, $options: 'i' } },
          { productName: { $regex: search, $options: 'i' } },
          { vendor: { $regex: search, $options: 'i' } },
          { naverProductId: { $regex: search, $options: 'i' } },
          { shopifyProductId: { $regex: search, $options: 'i' } }
        ];
      }

      if (status) {
        query.status = status;
      }

      if (isActive !== undefined) {
        query.isActive = isActive === 'true';
      }

      if (syncStatus) {
        query.syncStatus = syncStatus;
      }

      if (vendor) {
        query.vendor = vendor;
      }

      // 동기화 시간 필터
      if (lastSyncedBefore || lastSyncedAfter) {
        query.lastSyncedAt = {};
        if (lastSyncedBefore) {
          query.lastSyncedAt.$lt = new Date(lastSyncedBefore as string);
        }
        if (lastSyncedAfter) {
          query.lastSyncedAt.$gt = new Date(lastSyncedAfter as string);
        }
      }

      const skip = (Number(page) - 1) * Number(limit);
      const sort = { [sortBy as string]: order === 'asc' ? 1 : -1 };

      // 집계 파이프라인을 사용한 고급 조회
      const pipeline = [
        { $match: query },
        { $sort: sort },
        { $skip: skip },
        { $limit: Number(limit) },
        {
          $lookup: {
            from: 'inventory_transactions',
            let: { sku: '$sku' },
            pipeline: [
              { $match: { $expr: { $eq: ['$sku', '$$sku'] } } },
              { $sort: { createdAt: -1 } },
              { $limit: 1 }
            ],
            as: 'lastTransaction'
          }
        },
        {
          $addFields: {
            lastTransactionDate: { $arrayElemAt: ['$lastTransaction.createdAt', 0] },
            lastTransactionType: { $arrayElemAt: ['$lastTransaction.transactionType', 0] }
          }
        }
      ];

      const [mappings, totalResult] = await Promise.all([
        ProductMapping.aggregate(pipeline),
        ProductMapping.countDocuments(query)
      ]);

      // 통계 정보 추가
      const stats = await this.getMappingStats();

      res.json({
        success: true,
        data: {
          mappings,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total: totalResult,
            pages: Math.ceil(totalResult / Number(limit))
          },
          stats
        }
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * 매핑 통계 조회
   */
  private async getMappingStats(): Promise<any> {
    const [total, active, inactive, error, pending] = await Promise.all([
      ProductMapping.countDocuments(),
      ProductMapping.countDocuments({ isActive: true, status: 'ACTIVE' }),
      ProductMapping.countDocuments({ isActive: false }),
      ProductMapping.countDocuments({ status: 'ERROR' }),
      ProductMapping.countDocuments({ syncStatus: 'pending' })
    ]);

    return {
      total,
      active,
      inactive,
      error,
      pending,
      syncNeeded: pending
    };
  }

  /**
   * 대량 엑셀 업로드
   * POST /api/v1/mappings/bulk
   */
  bulkUploadMappings = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const session = await ProductMapping.startSession();
    session.startTransaction();

    try {
      if (!req.file) {
        throw new AppError('Excel file is required', 400);
      }

      const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet);

      const results = {
        success: [],
        failed: [],
        skipped: []
      };

      for (const [index, row] of data.entries()) {
        try {
          const mappingData = {
            sku: row['SKU']?.toString().toUpperCase(),
            naverProductId: row['네이버상품ID']?.toString(),
            shopifyProductId: row['Shopify상품ID']?.toString(),
            shopifyVariantId: row['ShopifyVariantID']?.toString(),
            priceMargin: (row['마진율'] || 15) / 100,
            isActive: row['활성화'] === 'Y' || row['활성화'] === true
          };

          // SKU 유효성 검사
          if (!validateSKU(mappingData.sku)) {
            results.failed.push({
              row: index + 2,
              sku: mappingData.sku,
              error: 'Invalid SKU format'
            });
            continue;
          }

          // 중복 확인
          const existing = await ProductMapping.findOne({ sku: mappingData.sku }).session(session);
          if (existing) {
            results.skipped.push({
              row: index + 2,
              sku: mappingData.sku,
              reason: 'Already exists'
            });
            continue;
          }

          // 자동 검색으로 추가 정보 보완
          const [naverResults, shopifyResults] = await Promise.all([
            this.searchNaverProductBySku(mappingData.sku),
            this.searchShopifyProductBySku(mappingData.sku)
          ]);

          const enrichedData = {
            ...mappingData,
            productName: naverResults.products[0]?.name || '',
            vendor: shopifyResults.products[0]?.vendor || 'album',
            shopifyInventoryItemId: '',
            shopifyLocationId: '',
            status: 'ACTIVE',
            syncStatus: 'pending'
          };

          await ProductMapping.create([enrichedData], { session });

          results.success.push({
            row: index + 2,
            sku: mappingData.sku
          });
        } catch (error: any) {
          results.failed.push({
            row: index + 2,
            sku: row['SKU'],
            error: error.message
          });
        }
      }

      await session.commitTransaction();

      res.json({
        success: true,
        data: {
          total: data.length,
          ...results
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
   * 매핑 검증
   * POST /api/v1/mappings/:id/validate
   */
  validateMapping = async (
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

      const validation = await this.mappingService.validateMapping(mapping.sku);

      // 검증 결과에 따라 상태 업데이트
      if (!validation.isValid) {
        mapping.status = 'ERROR';
        mapping.syncError = validation.errors.join(', ');
      } else if (validation.warnings.length > 0) {
        mapping.syncError = validation.warnings.join(', ');
      } else {
        mapping.status = 'ACTIVE';
        mapping.syncError = undefined;
      }

      await mapping.save();

      res.json({
        success: true,
        data: validation
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * 자동 매핑 탐색
   * POST /api/v1/mappings/auto-discover
   */
  autoDiscoverMappings = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const {
        matchBySku = true,
        matchByName = false,
        nameSimilarity = 80,
        priceDifference = 20,
        autoCreate = false
      } = req.body;

      const discoveries = await this.mappingService.autoDiscoverMappings({
        matchBySku,
        matchByName,
        nameSimilarity,
        priceDifference
      });

      // 자동 생성 옵션이 활성화된 경우
      if (autoCreate && discoveries.length > 0) {
        const session = await ProductMapping.startSession();
        session.startTransaction();

        try {
          const created = [];
          for (const discovery of discoveries) {
            if (discovery.confidence >= 80) {
              const mapping = await ProductMapping.create([{
                sku: discovery.sku,
                naverProductId: discovery.naverProductId,
                shopifyProductId: discovery.shopifyProductId,
                shopifyVariantId: discovery.shopifyVariantId,
                productName: discovery.productName,
                vendor: discovery.vendor || 'album',
                isActive: true,
                status: 'ACTIVE',
                metadata: {
                  autoDiscovered: true,
                  confidence: discovery.confidence
                }
              }], { session });
              created.push(mapping[0]);
            }
          }

          await session.commitTransaction();

          res.json({
            success: true,
            data: {
              discovered: discoveries,
              created: created.length,
              message: `${created.length}개의 매핑이 자동으로 생성되었습니다.`
            }
          });
        } catch (error) {
          await session.abortTransaction();
          throw error;
        } finally {
          session.endSession();
        }
      } else {
        res.json({
          success: true,
          data: {
            discovered: discoveries,
            message: `${discoveries.length}개의 잠재적 매핑을 발견했습니다.`
          }
        });
      }
    } catch (error) {
      next(error);
    }
  };
}

