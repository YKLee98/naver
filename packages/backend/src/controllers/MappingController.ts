// packages/backend/src/controllers/MappingController.ts

import { Request, Response, NextFunction } from 'express';
import { MappingService } from '../services/sync';
import { ProductMapping } from '../models';
import { AppError } from '../middlewares/error.middleware';
import { logger } from '../utils/logger';
import * as XLSX from 'xlsx';
import { validateSKU } from '../utils/validators';
import { NaverProductService } from '../services/naver';
import { ShopifyGraphQLService } from '../services/shopify';

export class MappingController {
  private mappingService: MappingService;
  private naverProductService: NaverProductService;
  private shopifyGraphQLService: ShopifyGraphQLService;

  constructor(
    mappingService: MappingService,
    naverProductService: NaverProductService,
    shopifyGraphQLService: ShopifyGraphQLService
  ) {
    this.mappingService = mappingService;
    this.naverProductService = naverProductService;
    this.shopifyGraphQLService = shopifyGraphQLService;
  }

  /**
   * SKU로 네이버와 Shopify 상품 자동 검색
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

      // 병렬로 네이버와 Shopify에서 상품 검색
      const [naverResults, shopifyResults] = await Promise.all([
        this.searchNaverProductBySku(sku),
        this.searchShopifyProductBySku(sku)
      ]);

      res.json({
        success: true,
        data: {
          sku,
          naver: naverResults,
          shopify: shopifyResults
        }
      });
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
      // 1. 먼저 정확한 SKU(판매자 관리 코드)로 검색
      const exactMatch = await this.naverProductService.searchProductsBySellerManagementCode(sku);
      
      if (exactMatch && exactMatch.length > 0) {
        return {
          found: true,
          products: exactMatch.map(product => ({
            id: product.productNo || product.id,
            name: product.name,
            sku: product.sellerManagementCode || sku,
            price: product.salePrice,
            imageUrl: product.representativeImage?.url || product.imageUrl,
            stockQuantity: product.stockQuantity,
            status: product.statusType || product.status
          }))
        };
      }

      // 2. 정확한 매치가 없으면 상품명에서 SKU 패턴 검색
      const searchResults = await this.naverProductService.searchProducts({
        searchKeyword: sku,
        searchType: 'PRODUCT_NAME'
      });

      if (searchResults && searchResults.contents && searchResults.contents.length > 0) {
        // SKU가 포함된 상품만 필터링
        const filteredProducts = searchResults.contents.filter(product => 
          product.name?.includes(sku) || 
          product.sellerManagementCode === sku ||
          product.sellerProductTag?.includes(sku)
        );

        if (filteredProducts.length > 0) {
          return {
            found: true,
            products: filteredProducts.map(product => ({
              id: product.productNo || product.id,
              name: product.name,
              sku: product.sellerManagementCode || sku,
              price: product.salePrice,
              imageUrl: product.representativeImage?.url || product.imageUrl,
              stockQuantity: product.stockQuantity,
              status: product.statusType || product.status
            }))
          };
        }
      }

      return {
        found: false,
        products: [],
        message: `네이버에서 SKU '${sku}'에 해당하는 상품을 찾을 수 없습니다.`
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
   * Shopify에서 SKU로 상품 검색
   */
  private async searchShopifyProductBySku(sku: string): Promise<any> {
    try {
      // 1. 먼저 정확한 SKU로 variant 검색
      const variant = await this.shopifyGraphQLService.findVariantBySku(sku);
      
      if (variant) {
        return {
          found: true,
          products: [{
            id: variant.product.id,
            variantId: variant.id,
            title: variant.product.title,
            variantTitle: variant.title,
            sku: variant.sku,
            price: variant.price,
            compareAtPrice: variant.compareAtPrice,
            imageUrl: variant.image?.url || variant.product.featuredImage?.url,
            inventoryQuantity: variant.inventoryQuantity,
            vendor: variant.product.vendor,
            productType: variant.product.productType,
            tags: variant.product.tags
          }]
        };
      }

      // 2. Variant에서 못 찾으면 상품 제목이나 태그에서 SKU 검색
      const searchQuery = `sku:${sku} OR title:*${sku}* OR tag:${sku}`;
      const searchResults = await this.shopifyGraphQLService.searchProducts(searchQuery);

      if (searchResults && searchResults.edges && searchResults.edges.length > 0) {
        const products = [];
        
        for (const edge of searchResults.edges) {
          const product = edge.node;
          
          // 각 상품의 모든 variant 확인
          if (product.variants && product.variants.edges) {
            for (const variantEdge of product.variants.edges) {
              const variant = variantEdge.node;
              
              // SKU가 일치하거나 포함된 variant만 추가
              if (variant.sku === sku || variant.sku?.includes(sku) || 
                  product.title?.includes(sku) || product.tags?.some((tag: string) => tag.includes(sku))) {
                products.push({
                  id: product.id,
                  variantId: variant.id,
                  title: product.title,
                  variantTitle: variant.title,
                  sku: variant.sku || '',
                  price: variant.price,
                  compareAtPrice: variant.compareAtPrice,
                  imageUrl: variant.image?.url || product.featuredImage?.url,
                  inventoryQuantity: variant.inventoryQuantity,
                  vendor: product.vendor,
                  productType: product.productType,
                  tags: product.tags
                });
              }
            }
          }
        }

        if (products.length > 0) {
          return {
            found: true,
            products
          };
        }
      }

      return {
        found: false,
        products: [],
        message: `Shopify에서 SKU '${sku}'에 해당하는 상품을 찾을 수 없습니다.`
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
   * 엑셀 템플릿 다운로드
   * GET /api/v1/mappings/template
   */
  downloadTemplate = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const template = [
        {
          'SKU': 'ALBUM-001',
          '네이버상품ID': '12345678',
          'Shopify상품ID': '7890123456',
          '활성화': 'Y',
          '마진율': '15'
        }
      ];

      const ws = XLSX.utils.json_to_sheet(template);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'SKU매핑');

      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="sku-mapping-template.xlsx"');
      res.send(buffer);
    } catch (error) {
      next(error);
    }
  };

  /**
   * SKU 매핑 목록 조회
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
        sortBy = 'updatedAt',
        order = 'desc'
      } = req.query;

      const query: any = {};
      
      // 검색어 처리
      if (search) {
        query.$or = [
          { sku: { $regex: search, $options: 'i' } },
          { productName: { $regex: search, $options: 'i' } },
          { naverProductId: { $regex: search, $options: 'i' } },
          { shopifyProductId: { $regex: search, $options: 'i' } }
        ];
      }
      
      // 상태 필터
      if (status) {
        query.status = status;
      }
      
      // 활성화 여부 필터
      if (isActive !== undefined) {
        query.isActive = isActive === 'true';
      }

      const skip = (Number(page) - 1) * Number(limit);
      const sort: any = { [String(sortBy)]: order === 'asc' ? 1 : -1 };

      const [mappings, total] = await Promise.all([
        ProductMapping.find(query)
          .sort(sort)
          .skip(skip)
          .limit(Number(limit))
          .lean(),
        ProductMapping.countDocuments(query)
      ]);

      // 각 매핑의 동기화 상태 확인
      const mappingsWithStatus = await Promise.all(
        mappings.map(async (mapping) => {
          try {
            const syncStatus = await this.mappingService.checkMappingStatus(mapping.sku);
            return {
              ...mapping,
              syncStatus
            };
          } catch (error) {
            return {
              ...mapping,
              syncStatus: mapping.status || 'unknown'
            };
          }
        })
      );

      res.json({
        success: true,
        data: {
          mappings: mappingsWithStatus,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            pages: Math.ceil(total / Number(limit))
          }
        }
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * 새 매핑 생성 (개선된 버전)
   * POST /api/v1/mappings
   */
  createMapping = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const {
        sku,
        naverProductId,
        shopifyProductId,
        shopifyVariantId,
        priceMargin,
        isActive = true,
        autoSearch = false // 자동 검색 여부
      } = req.body;

      // SKU 유효성 검사
      if (!validateSKU(sku)) {
        throw new AppError('Invalid SKU format', 400);
      }

      // 중복 확인
      const existingMapping = await ProductMapping.findOne({ sku });
      if (existingMapping) {
        throw new AppError('SKU already exists', 409);
      }

      let finalNaverProductId = naverProductId;
      let finalShopifyProductId = shopifyProductId;
      let finalShopifyVariantId = shopifyVariantId;

      // 자동 검색이 활성화되어 있고 ID가 제공되지 않은 경우
      if (autoSearch) {
        if (!naverProductId) {
          const naverResults = await this.searchNaverProductBySku(sku);
          if (naverResults.found && naverResults.products.length > 0) {
            finalNaverProductId = naverResults.products[0].id;
          }
        }

        if (!shopifyProductId || !shopifyVariantId) {
          const shopifyResults = await this.searchShopifyProductBySku(sku);
          if (shopifyResults.found && shopifyResults.products.length > 0) {
            finalShopifyProductId = shopifyResults.products[0].id;
            finalShopifyVariantId = shopifyResults.products[0].variantId;
          }
        }
      }

      // 매핑 생성
      const mapping = await this.mappingService.createMapping({
        sku,
        naverProductId: finalNaverProductId,
        shopifyProductId: finalShopifyProductId,
        shopifyVariantId: finalShopifyVariantId,
        priceMargin: priceMargin || 15,
        isActive
      });

      // 검증 실행
      const validation = await this.mappingService.validateMapping(sku);
      
      res.status(201).json({
        success: true,
        data: {
          mapping,
          validation
        }
      });

      logger.info(`New mapping created: ${sku}`);
    } catch (error) {
      next(error);
    }
  };

  /**
   * 매핑 수정
   * PUT /api/v1/mappings/:id
   */
  updateMapping = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const updateData = req.body;

      const mapping = await ProductMapping.findById(id);
      if (!mapping) {
        throw new AppError('Mapping not found', 404);
      }

      // SKU 변경 시 유효성 검사
      if (updateData.sku && updateData.sku !== mapping.sku) {
        if (!validateSKU(updateData.sku)) {
          throw new AppError('Invalid SKU format', 400);
        }
        
        // 중복 확인
        const existing = await ProductMapping.findOne({ sku: updateData.sku });
        if (existing) {
          throw new AppError('SKU already exists', 409);
        }
      }

      // 업데이트
      const updatedMapping = await this.mappingService.updateMapping(id, updateData);

      // 검증 실행
      const validation = await this.mappingService.validateMapping(updatedMapping.sku);

      res.json({
        success: true,
        data: {
          mapping: updatedMapping,
          validation
        }
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * 매핑 삭제
   * DELETE /api/v1/mappings/:id
   */
  deleteMapping = async (
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

      await this.mappingService.deleteMapping(id);

      res.json({
        success: true,
        message: 'Mapping deleted successfully'
      });

      logger.info(`Mapping deleted: ${mapping.sku}`);
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
        priceDifference = 20
      } = req.body;

      const options = {
        matchBySku,
        matchByName,
        nameSimilarity,
        priceDifference
      };

      logger.info('Starting auto-discovery with options:', options);

      // 서비스가 초기화되었는지 확인
      if (!this.mappingService) {
        throw new AppError('Mapping service not initialized', 500);
      }

      try {
        const discoveries = await this.mappingService.autoDiscoverMappings(options);

        res.json({
          success: true,
          data: {
            found: discoveries.length,
            mappings: discoveries
          }
        });
      } catch (serviceError: any) {
        logger.error('Auto-discovery service error:', serviceError);
        
        // 상세한 에러 처리
        if (serviceError.message?.includes('NAVER_AUTH_ERROR')) {
          throw new AppError('네이버 API 인증에 실패했습니다. API 키를 확인해주세요.', 401);
        } else if (serviceError.message?.includes('SHOPIFY_AUTH_ERROR')) {
          throw new AppError('Shopify API 인증에 실패했습니다. 액세스 토큰을 확인해주세요.', 401);
        } else if (serviceError.message?.includes('NETWORK_ERROR')) {
          throw new AppError('네트워크 연결에 실패했습니다. 잠시 후 다시 시도해주세요.', 503);
        } else if (serviceError.message?.includes('RATE_LIMIT')) {
          throw new AppError('API 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.', 429);
        } else if (serviceError.message?.includes('NO_PRODUCTS')) {
          res.json({
            success: true,
            data: {
              found: 0,
              mappings: [],
              message: '탐색할 상품이 없습니다.'
            }
          });
          return;
        }
        
        // 기타 서비스 에러
        throw new AppError(
          serviceError.message || '자동 탐색 중 오류가 발생했습니다.',
          serviceError.statusCode || 500
        );
      }
    } catch (error) {
      logger.error('Auto-discovery controller error:', error);
      next(error);
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

      // 상태 업데이트
      mapping.status = validation.isValid ? 'ACTIVE' : 'ERROR';
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
   * 엑셀 파일 대량 업로드
   * POST /api/v1/mappings/bulk
   */
  bulkUploadMappings = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.file) {
        throw new AppError('No file uploaded', 400);
      }

      const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet);

      const results = {
        total: data.length,
        success: [],
        errors: [],
        skipped: []
      };

      for (let i = 0; i < data.length; i++) {
        const row: any = data[i];
        
        try {
          // SKU 확인
          if (!row.SKU) {
            results.skipped.push({
              row: i + 2,
              sku: '',
              reason: 'SKU is missing'
            });
            continue;
          }

          // 중복 확인
          const existing = await ProductMapping.findOne({ sku: row.SKU });
          if (existing) {
            results.skipped.push({
              row: i + 2,
              sku: row.SKU,
              reason: 'SKU already exists'
            });
            continue;
          }

          // 매핑 생성
          await this.mappingService.createMapping({
            sku: row.SKU,
            naverProductId: row['네이버상품ID'],
            shopifyProductId: row['Shopify상품ID'],
            priceMargin: (parseFloat(row['마진율']) || 15) / 100,
            isActive: row['활성화'] === 'Y'
          });

          results.success.push({
            row: i + 2,
            sku: row.SKU
          });
        } catch (error: any) {
          results.errors.push({
            row: i + 2,
            sku: row.SKU || '',
            error: error.message
          });
        }
      }

      res.json({
        success: true,
        data: results
      });
    } catch (error) {
      next(error);
    }
  };
}