// packages/backend/src/controllers/ProductSearchController.ts
import { Request, Response, NextFunction } from 'express';
import { NaverProductService } from '../services/naver/NaverProductService';
import { ShopifyGraphQLService } from '../services/shopify/ShopifyGraphQLService';
import { NaverAuthService } from '../services/naver/NaverAuthService';
import { getRedisClient } from '../config/redis';
import { logger } from '../utils/logger';

export class ProductSearchController {
  private naverProductService: NaverProductService;
  private shopifyService: ShopifyGraphQLService;

  constructor() {
    const redis = getRedisClient();
    const naverAuthService = new NaverAuthService(redis);
    this.naverProductService = new NaverProductService(naverAuthService);
    this.shopifyService = new ShopifyGraphQLService();
  }

  /**
   * 네이버 상품 검색
   */
  async searchNaverProducts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { sku } = req.query;
      logger.info(`Searching Naver products with SKU: ${sku}`);

      // 네이버 API 호출
      const products = await this.naverProductService.searchProductsBySku(sku as string);

      res.json({
        success: true,
        data: products.map(product => ({
          id: product.productNo,
          name: product.name,
          sku: product.sellerManagementCode,
          imageUrl: product.representativeImage?.url,
          price: product.salePrice,
          stockQuantity: product.stockQuantity
        }))
      });
    } catch (error) {
      logger.error('Failed to search Naver products:', error);
      next(error);
    }
  }

  /**
   * Shopify 상품 검색
   */
  async searchShopifyProducts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { sku } = req.query;
      logger.info(`Searching Shopify products with SKU: ${sku}`);

      // Shopify GraphQL 쿼리
      const query = `
        query searchProductsBySku($query: String!) {
          products(first: 10, query: $query) {
            edges {
              node {
                id
                title
                handle
                variants(first: 10) {
                  edges {
                    node {
                      id
                      sku
                      price
                      inventoryQuantity
                    }
                  }
                }
                images(first: 1) {
                  edges {
                    node {
                      url
                    }
                  }
                }
              }
            }
          }
        }
      `;

      const variables = {
        query: `sku:${sku}*`
      };

      const response = await this.shopifyService.query(query, variables);
      const products = response.products.edges;

      // SKU가 일치하는 variant가 있는 상품만 필터링
      const matchingProducts = products
        .filter(({ node }: any) => 
          node.variants.edges.some(({ node: variant }: any) => 
            variant.sku && variant.sku.includes(sku)
          )
        )
        .map(({ node: product }: any) => {
          const matchingVariant = product.variants.edges.find(({ node: variant }: any) => 
            variant.sku && variant.sku.includes(sku)
          )?.node;

          return {
            id: product.id,
            name: product.title,
            sku: matchingVariant?.sku || '',
            imageUrl: product.images.edges[0]?.node.url,
            price: matchingVariant?.price,
            stockQuantity: matchingVariant?.inventoryQuantity || 0
          };
        });

      res.json({
        success: true,
        data: matchingProducts
      });
    } catch (error) {
      logger.error('Failed to search Shopify products:', error);
      next(error);
    }
  }
}