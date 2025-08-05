// packages/backend/src/services/sync/MappingService.ts
import { ProductMapping } from '../../models';
import { NaverProductService } from '../naver';
import { ShopifyGraphQLService } from '../shopify';
import { logger } from '../../utils/logger';
import { AppError } from '../../utils/errors';
import * as similarity from 'string-similarity';

export interface MappingData {
  sku: string;
  naverProductId: string;
  shopifyProductId: string;
  shopifyVariantId?: string;
  priceMargin?: number;
  isActive?: boolean;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  naverProduct?: any;
  shopifyProduct?: any;
}

export interface AutoDiscoverOptions {
  matchBySku?: boolean;
  matchByName?: boolean;
  nameSimilarity?: number;
  priceDifference?: number;
}

export class MappingService {
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
   * 매핑 생성
   */
  async createMapping(data: MappingData): Promise<ProductMapping> {
    try {
      // 유효성 검사
      const validation = await this.validateMappingData(data);
      if (!validation.isValid) {
        throw new AppError(`Invalid mapping data: ${validation.errors.join(', ')}`, 400);
      }

      // 매핑 생성
      const mapping = new ProductMapping({
        sku: data.sku,
        naverProductId: data.naverProductId,
        shopifyProductId: data.shopifyProductId,
        shopifyVariantId: data.shopifyVariantId || validation.shopifyProduct?.variants?.[0]?.id,
        productName: validation.naverProduct?.name || '',
        vendor: this.extractVendor(data.sku),
        priceMargin: data.priceMargin || 15,
        isActive: data.isActive !== false,
        status: 'ACTIVE',
        lastSyncAt: new Date()
      });

      await mapping.save();
      logger.info(`Mapping created: ${data.sku}`);
      
      return mapping;
    } catch (error) {
      logger.error('Error creating mapping:', error);
      throw error;
    }
  }

  /**
   * 매핑 업데이트
   */
  async updateMapping(id: string, updateData: Partial<MappingData>): Promise<ProductMapping> {
    const mapping = await ProductMapping.findById(id);
    if (!mapping) {
      throw new AppError('Mapping not found', 404);
    }

    // 변경사항이 있는 경우 검증
    if (updateData.naverProductId || updateData.shopifyProductId) {
      const validation = await this.validateMappingData({
        ...mapping.toObject(),
        ...updateData
      });
      
      if (!validation.isValid) {
        throw new AppError(`Invalid update data: ${validation.errors.join(', ')}`, 400);
      }
    }

    Object.assign(mapping, updateData);
    mapping.updatedAt = new Date();
    
    await mapping.save();
    logger.info(`Mapping updated: ${mapping.sku}`);
    
    return mapping;
  }

  /**
   * 매핑 삭제
   */
  async deleteMapping(id: string): Promise<void> {
    const result = await ProductMapping.findByIdAndDelete(id);
    if (!result) {
      throw new AppError('Mapping not found', 404);
    }
    logger.info(`Mapping deleted: ${result.sku}`);
  }

  /**
   * 매핑 데이터 유효성 검사
   */
  private async validateMappingData(data: MappingData): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    let naverProduct = null;
    let shopifyProduct = null;

    try {
      // 네이버 상품 확인
      naverProduct = await this.naverProductService.getProduct(data.naverProductId);
      if (!naverProduct) {
        errors.push('Naver product not found');
      } else if (naverProduct.saleStatus !== 'SALE') {
        warnings.push('Naver product is not in SALE status');
      }
    } catch (error) {
      errors.push('Failed to fetch Naver product');
    }

    try {
      // Shopify 상품 확인
      shopifyProduct = await this.shopifyGraphQLService.getProduct(data.shopifyProductId);
      if (!shopifyProduct) {
        errors.push('Shopify product not found');
      } else if (shopifyProduct.status !== 'ACTIVE') {
        warnings.push('Shopify product is not ACTIVE');
      }
    } catch (error) {
      errors.push('Failed to fetch Shopify product');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      naverProduct,
      shopifyProduct
    };
  }

  /**
   * 매핑 검증
   */
  async validateMapping(sku: string): Promise<ValidationResult> {
    const mapping = await ProductMapping.findOne({ sku });
    if (!mapping) {
      return {
        isValid: false,
        errors: ['Mapping not found'],
        warnings: []
      };
    }

    return this.validateMappingData({
      sku: mapping.sku,
      naverProductId: mapping.naverProductId,
      shopifyProductId: mapping.shopifyProductId,
      shopifyVariantId: mapping.shopifyVariantId
    });
  }

  /**
   * 매핑 상태 확인
   */
  async checkMappingStatus(sku: string): Promise<string> {
    try {
      const mapping = await ProductMapping.findOne({ sku });
      if (!mapping) {
        return 'NOT_FOUND';
      }

      if (!mapping.isActive) {
        return 'INACTIVE';
      }

      const validation = await this.validateMapping(sku);
      if (!validation.isValid) {
        return 'ERROR';
      }

      if (validation.warnings.length > 0) {
        return 'WARNING';
      }

      return 'ACTIVE';
    } catch (error) {
      logger.error(`Error checking mapping status for ${sku}:`, error);
      return 'ERROR';
    }
  }

  /**
   * 자동 매핑 탐색
   */
  async autoDiscoverMappings(options: AutoDiscoverOptions = {}): Promise<any[]> {
    const {
      matchBySku = true,
      matchByName = false,
      nameSimilarity = 80,
      priceDifference = 20
    } = options;

    const discoveries = [];

    try {
      // 네이버 상품 목록 조회
      const naverProducts = await this.naverProductService.listProducts({ 
        limit: 100,
        saleStatus: 'SALE' 
      });

      // Shopify 상품 목록 조회
      const shopifyProducts = await this.shopifyGraphQLService.listProducts({ 
        limit: 100,
        status: 'ACTIVE' 
      });

      // 이미 매핑된 SKU 조회
      const existingMappings = await ProductMapping.find({}, 'sku').lean();
      const mappedSkus = new Set(existingMappings.map(m => m.sku));

      for (const naverProduct of naverProducts.items) {
        // SKU 추출 (네이버 상품명이나 옵션에서)
        const extractedSku = this.extractSku(naverProduct);
        
        if (!extractedSku || mappedSkus.has(extractedSku)) {
          continue;
        }

        let matches = [];

        // SKU 매칭
        if (matchBySku && extractedSku) {
          const skuMatches = shopifyProducts.products.filter(sp => 
            sp.title.includes(extractedSku) || 
            sp.variants.some(v => v.sku === extractedSku)
          );
          matches.push(...skuMatches);
        }

        // 상품명 유사도 매칭
        if (matchByName && matches.length === 0) {
          const nameMatches = shopifyProducts.products.filter(sp => {
            const sim = similarity.compareTwoStrings(
              naverProduct.name.toLowerCase(),
              sp.title.toLowerCase()
            );
            return sim * 100 >= nameSimilarity;
          });
          matches.push(...nameMatches);
        }

        // 가격 차이 확인
        if (priceDifference && matches.length > 0) {
          matches = matches.filter(sp => {
            const shopifyPrice = parseFloat(sp.variants[0].price);
            const naverPrice = naverProduct.salePrice;
            const diff = Math.abs((shopifyPrice - naverPrice) / naverPrice * 100);
            return diff <= priceDifference;
          });
        }

        if (matches.length > 0) {
          discoveries.push({
            sku: extractedSku,
            naverProduct: {
              id: naverProduct.id,
              name: naverProduct.name,
              price: naverProduct.salePrice
            },
            shopifyMatches: matches.map(m => ({
              id: m.id,
              title: m.title,
              price: m.variants[0].price,
              similarity: matchByName ? 
                similarity.compareTwoStrings(naverProduct.name.toLowerCase(), m.title.toLowerCase()) * 100 : 
                100
            }))
          });
        }
      }

      logger.info(`Auto-discovery found ${discoveries.length} potential mappings`);
      return discoveries;
    } catch (error) {
      logger.error('Error in auto-discovery:', error);
      throw error;
    }
  }

  /**
   * SKU 추출
   */
  private extractSku(product: any): string | null {
    // 상품명에서 SKU 패턴 찾기 (예: ALBUM-001, MD-055 등)
    const skuPattern = /[A-Z]+-\d+/;
    const match = product.name.match(skuPattern);
    
    if (match) {
      return match[0];
    }

    // 옵션값에서 찾기
    if (product.options && product.options.length > 0) {
      for (const option of product.options) {
        const optionMatch = option.value.match(skuPattern);
        if (optionMatch) {
          return optionMatch[0];
        }
      }
    }

    return null;
  }

  /**
   * 벤더 추출
   */
  private extractVendor(sku: string): string {
    const parts = sku.split('-');
    if (parts.length > 0) {
      return parts[0].toLowerCase();
    }
    return 'unknown';
  }
}