// ===== 2. packages/backend/src/controllers/MappingController.ts (완전한 구현) =====
import { Request, Response, NextFunction } from 'express';
import { MappingService } from '../services/sync';
import { ProductMapping, Activity } from '../models';
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

      // 병렬로 네이버와 Shopify에서 상품 검색
      const [naverResults, shopifyResults] = await Promise.all([
        this.searchNaverProductBySku(sku),
        this.searchShopifyProductBySku(sku)
      ]);

      // 활동 로그 기록
      await Activity.create({
        type: 'mapping_search',
        action: `SKU 검색: ${sku}`,
        details: `네이버: ${naverResults.found ? naverResults.products.length + '개 발견' : '없음'}, Shopify: ${shopifyResults.found ? shopifyResults.products.length + '개 발견' : '없음'}`,
        status: 'success',
        metadata: {
          sku,
          naverFound: naverResults.found,
          shopifyFound: shopifyResults.found
        }
      });

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

      // 3. 태그 검색
      const tagSearchResults = await this.naverProductService.searchProducts({
        searchKeyword: sku,
        searchType: 'TAG'
      });

      if (tagSearchResults && tagSearchResults.contents && tagSearchResults.contents.length > 0) {
        return {
          found: true,
          products: tagSearchResults.contents.map(product => ({
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

      // 2. SKU 패턴으로 상품 검색
      const searchQuery = `sku:${sku}* OR title:*${sku}* OR tag:${sku}`;
      const searchResults = await this.shopifyGraphQLService.searchProducts(searchQuery);

      if (searchResults && searchResults.length > 0) {
        const products = [];
        
        for (const product of searchResults) {
          // 각 상품의 variant들을 확인
          if (product.variants && product.variants.edges) {
            for (const edge of product.variants.edges) {
              const v = edge.node;
              // SKU가 일치하거나 포함되는 variant만 추가
              if (v.sku && (v.sku === sku || v.sku.includes(sku))) {
                products.push({
                  id: product.id,
                  variantId: v.id,
                  title: product.title,
                  variantTitle: v.title,
                  sku: v.sku,
                  price: v.price,
                  compareAtPrice: v.compareAtPrice,
                  imageUrl: v.image?.url || product.featuredImage?.url,
                  inventoryQuantity: v.inventoryQuantity,
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
   * 매핑 목록 조회
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

      if (search) {
        query.$or = [
          { sku: { $regex: search, $options: 'i' } },
          { productName: { $regex: search, $options: 'i' } },
          { vendor: { $regex: search, $options: 'i' } }
        ];
      }

      if (status) {
        query.status = status;
      }

      if (isActive !== undefined) {
        query.isActive = isActive === 'true';
      }

      const skip = (Number(page) - 1) * Number(limit);
      const sort = { [sortBy as string]: order === 'asc' ? 1 : -1 };

      const [mappings, total] = await Promise.all([
        ProductMapping.find(query)
          .sort(sort)
          .skip(skip)
          .limit(Number(limit))
          .lean(),
        ProductMapping.countDocuments(query)
      ]);

      res.json({
        success: true,
        data: {
          mappings,
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
   * 매핑 생성 (자동 검색 포함)
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
        priceMargin = 15,
        isActive = true,
        autoSearch = true // 자동 검색 옵션
      } = req.body;

      if (!sku) {
        throw new AppError('SKU is required', 400);
      }

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
          }
        }

        if (!shopifyProductId || !shopifyVariantId) {
          logger.info(`Auto-searching Shopify product for SKU: ${sku}`);
          const shopifyResults = await this.searchShopifyProductBySku(sku);
          if (shopifyResults.found && shopifyResults.products.length > 0) {
            finalShopifyProductId = shopifyResults.products[0].id;
            finalShopifyVariantId = shopifyResults.products[0].variantId;
            vendor = shopifyResults.products[0].vendor || '';
          }
        }
      }

      // 매핑 생성
      const mapping = await this.mappingService.createMapping({
        sku,
        naverProductId: finalNaverProductId,
        shopifyProductId: finalShopifyProductId,
        shopifyVariantId: finalShopifyVariantId,
        productName,
        vendor,
        priceMargin: priceMargin / 100, // 백분율을 소수로 변환
        isActive
      });

      // 검증 실행
      const validation = await this.mappingService.validateMapping(sku);

      // 활동 로그 기록
      await Activity.create({
        type: 'mapping_created',
        action: `매핑 생성: ${sku}`,
        details: `자동 검색: ${autoSearch ? '예' : '아니오'}, 검증 결과: ${validation.isValid ? '성공' : '실패'}`,
        status: 'success',
        metadata: {
          sku,
          autoSearch,
          naverProductId: finalNaverProductId,
          shopifyProductId: finalShopifyProductId
        }
      });
      
      res.status(201).json({
        success: true,
        data: {
          mapping,
          validation
        }
      });
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

      // priceMargin이 백분율로 전달된 경우 소수로 변환
      if (updateData.priceMargin && updateData.priceMargin > 1) {
        updateData.priceMargin = updateData.priceMargin / 100;
      }

      const updatedMapping = await ProductMapping.findByIdAndUpdate(
        id,
        updateData,
        { new: true, runValidators: true }
      );

      // 검증 실행
      const validation = await this.mappingService.validateMapping(mapping.sku);

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

      await ProductMapping.findByIdAndDelete(id);

      // 활동 로그 기록
      await Activity.create({
        type: 'mapping_deleted',
        action: `매핑 삭제: ${mapping.sku}`,
        details: `상품명: ${mapping.productName}`,
        status: 'success',
        metadata: {
          sku: mapping.sku,
          id
        }
      });

      res.json({
        success: true,
        message: 'Mapping deleted successfully'
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * 매핑 데이터 검증 (생성 전)
   * POST /api/v1/mappings/validate
   */
  validateMappingData = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { sku, naverProductId, shopifyProductId } = req.body;

      if (!sku) {
        throw new AppError('SKU is required', 400);
      }

      const validation = await this.mappingService.validateMappingData({
        sku,
        naverProductId,
        shopifyProductId
      });

      res.json({
        success: true,
        data: validation
      });
    } catch (error) {
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
      mapping.status = validation.isValid ? 'active' : 'error';
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
      const options = req.body;

      logger.info('Starting auto-discovery with options:', options);

      const discoveries = await this.mappingService.autoDiscoverMappings(options);

      // 활동 로그 기록
      await Activity.create({
        type: 'mapping_discovery',
        action: '자동 매핑 탐색',
        details: `${discoveries.length}개의 매핑 가능한 상품 발견`,
        status: 'success',
        metadata: {
          options,
          foundCount: discoveries.length
        }
      });

      res.json({
        success: true,
        data: {
          found: discoveries.length,
          mappings: discoveries
        }
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * 엑셀 대량 업로드
   * POST /api/v1/mappings/bulk
   */
  bulkUploadMappings = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.file) {
        throw new AppError('Excel file is required', 400);
      }

      const workbook = XLSX.read(req.file.buffer);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(sheet);

      const results = {
        total: data.length,
        success: [] as any[],
        errors: [] as any[],
        skipped: [] as any[]
      };

      for (let i = 0; i < data.length; i++) {
        const row: any = data[i];
        const rowNumber = i + 2; // Excel rows start from 1, header is row 1

        try {
          // SKU 확인
          if (!row.SKU) {
            results.errors.push({
              row: rowNumber,
              sku: '',
              error: 'SKU is missing'
            });
            continue;
          }

          const sku = String(row.SKU).trim();

          // 중복 확인
          const existing = await ProductMapping.findOne({ sku });
          if (existing) {
            results.skipped.push({
              row: rowNumber,
              sku,
              reason: 'SKU already exists'
            });
            continue;
          }

          // 자동 검색 수행
          const [naverResults, shopifyResults] = await Promise.all([
            this.searchNaverProductBySku(sku),
            this.searchShopifyProductBySku(sku)
          ]);

          // 매핑 생성
          await this.mappingService.createMapping({
            sku,
            naverProductId: naverResults.found ? naverResults.products[0].id : row['Naver Product ID'],
            shopifyProductId: shopifyResults.found ? shopifyResults.products[0].id : row['Shopify Product ID'],
            shopifyVariantId: shopifyResults.found ? shopifyResults.products[0].variantId : row['Shopify Variant ID'],
            productName: row['Product Name'] || (naverResults.found ? naverResults.products[0].name : ''),
            vendor: row['Vendor'] || (shopifyResults.found ? shopifyResults.products[0].vendor : ''),
            priceMargin: row['Price Margin'] ? Number(row['Price Margin']) / 100 : 0.15,
            isActive: row['Active'] !== 'false'
          });

          results.success.push({
            row: rowNumber,
            sku
          });
        } catch (error: any) {
          results.errors.push({
            row: rowNumber,
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

  /**
   * 템플릿 다운로드
   * GET /api/v1/mappings/template
   */
  downloadTemplate = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const templateData = [
        {
          'SKU': 'ALBUM-001',
          'Naver Product ID': '1234567890',
          'Shopify Product ID': 'gid://shopify/Product/1234567890',
          'Shopify Variant ID': 'gid://shopify/ProductVariant/1234567890',
          'Product Name': '상품명 예시',
          'Vendor': 'album',
          'Price Margin': '15',
          'Active': 'true'
        }
      ];

      const ws = XLSX.utils.json_to_sheet(templateData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Mapping Template');

      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=mapping-template.xlsx');
      res.send(buffer);
    } catch (error) {
      next(error);
    }
  };

  /**
   * 매핑 일괄 활성화/비활성화
   * PUT /api/v1/mappings/bulk-toggle
   */
  toggleMappings = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { ids, isActive } = req.body;

      if (!Array.isArray(ids) || ids.length === 0) {
        throw new AppError('IDs array is required', 400);
      }

      const result = await ProductMapping.updateMany(
        { _id: { $in: ids } },
        { isActive }
      );

      res.json({
        success: true,
        updated: result.modifiedCount
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * 매핑 일괄 삭제
   * POST /api/v1/mappings/bulk-delete
   */
  bulkDelete = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { ids } = req.body;

      if (!Array.isArray(ids) || ids.length === 0) {
        throw new AppError('IDs array is required', 400);
      }

      const result = await ProductMapping.deleteMany({
        _id: { $in: ids }
      });

      res.json({
        success: true,
        deleted: result.deletedCount
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * 매핑 내보내기
   * GET /api/v1/mappings/export
   */
  exportMappings = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const mappings = await ProductMapping.find({}).lean();

      const exportData = mappings.map(m => ({
        'SKU': m.sku,
        'Naver Product ID': m.naverProductId,
        'Shopify Product ID': m.shopifyProductId,
        'Shopify Variant ID': m.shopifyVariantId,
        'Product Name': m.productName,
        'Vendor': m.vendor,
        'Price Margin': (m.priceMargin * 100).toFixed(0),
        'Active': m.isActive ? 'true' : 'false',
        'Status': m.status,
        'Last Sync': m.lastSyncAt ? new Date(m.lastSyncAt).toISOString() : '',
        'Created': new Date(m.createdAt).toISOString(),
        'Updated': new Date(m.updatedAt).toISOString()
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Mappings');

      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=mappings-${new Date().toISOString().split('T')[0]}.xlsx`);
      res.send(buffer);
    } catch (error) {
      next(error);
    }
  };
}
