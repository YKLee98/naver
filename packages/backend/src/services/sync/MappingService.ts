// packages/backend/src/services/sync/MappingService.ts
import { ProductMapping } from '../../models';
import { NaverProductService } from '../../services/naver';
import { ShopifyGraphQLService } from '../../services/shopify';
import { logger } from '../../utils/logger';

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
   * SKU 매핑 생성
   */
  async createMapping(data: {
    sku: string;
    naverProductId: string;
    shopifyProductId: string;
    shopifyVariantId: string;
  }): Promise<any> {
    // Shopify variant 정보 조회
    const variant = await this.shopifyGraphQLService.findVariantBySku(data.sku);
    if (!variant) {
      throw new Error(`Shopify variant not found for SKU: ${data.sku}`);
    }

    // 네이버 상품 정보 조회
    const naverProduct = await this.naverProductService.getProduct(data.naverProductId);
    if (!naverProduct) {
      throw new Error(`Naver product not found: ${data.naverProductId}`);
    }

    // 매핑 생성
    const mapping = await ProductMapping.create({
      sku: data.sku,
      naverProductId: data.naverProductId,
      shopifyProductId: data.shopifyProductId,
      shopifyVariantId: data.shopifyVariantId,
      shopifyInventoryItemId: variant.inventoryItem.id,
      shopifyLocationId: variant.inventoryItem.inventoryLevels.edges[0].node.location.id,
      productName: naverProduct.name,
      vendor: 'album',
      isActive: true,
      metadata: {},
    });

    logger.info(`Mapping created for SKU: ${data.sku}`);
    return mapping;
  }

  /**
   * 자동 매핑 검색
   */
  async autoDiscoverMappings(): Promise<Array<{
    sku: string;
    naverProduct: any;
    shopifyVariant: any;
    confidence: number;
  }>> {
    const suggestions: Array<{ sku: string; naverProduct: any; shopifyVariant: any; confidence: number }> = [];

    // Shopify album vendor 상품 조회
    const shopifyProducts = await this.shopifyGraphQLService.getProductsByVendor('album');
    
    // SKU 맵 생성
    const shopifySkuMap = new Map();
    for (const product of shopifyProducts) {
      for (const edge of product.variants.edges) {
        const variant = edge.node;
        if (variant.sku) {
          shopifySkuMap.set(variant.sku, {
            product,
            variant,
          });
        }
      }
    }

    // 네이버 상품과 매칭
    const naverProducts = this.naverProductService.getAllProducts();
    
    for await (const batch of naverProducts) {
      for (const naverProduct of batch) {
        const sku = naverProduct.sellerManagementCode;
        if (!sku) continue;

        // 이미 매핑된 SKU인지 확인
        const existingMapping = await ProductMapping.findOne({ sku });
        if (existingMapping) continue;

        // Shopify에서 매칭되는 SKU 찾기
        const shopifyMatch = shopifySkuMap.get(sku);
        if (shopifyMatch) {
          suggestions.push({
            sku,
            naverProduct,
            shopifyVariant: shopifyMatch.variant,
            confidence: 1.0, // 정확한 SKU 매칭
          });
        }
      }
    }

    logger.info(`Auto-discovered ${suggestions.length} potential mappings`);
    return suggestions;
  }

  /**
   * 매핑 검증
   */
  async validateMapping(mappingId: string): Promise<{
    isValid: boolean;
    errors: string[];
  }> {
    const mapping = await ProductMapping.findById(mappingId);
    if (!mapping) {
      return { isValid: false, errors: ['Mapping not found'] };
    }

    const errors: string[] = [];

    // 네이버 상품 검증
    try {
      const naverProduct = await this.naverProductService.getProduct(mapping.naverProductId);
      if (!naverProduct) {
        errors.push('Naver product not found');
      } else if (naverProduct.sellerManagementCode !== mapping.sku) {
        errors.push('SKU mismatch in Naver product');
      }
    } catch (error) {
      errors.push(`Naver product validation failed: ${error.message}`);
    }

    // Shopify variant 검증
    try {
      const variant = await this.shopifyGraphQLService.findVariantBySku(mapping.sku);
      if (!variant) {
        errors.push('Shopify variant not found');
      } else if (variant.id !== mapping.shopifyVariantId) {
        errors.push('Variant ID mismatch');
      }
    } catch (error) {
      errors.push(`Shopify variant validation failed: ${error.message}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}
