// packages/backend/src/services/shopify/ShopifyProductSearchService.ts
import axios from 'axios';
import { logger } from '../../utils/logger.js';
import { retry } from '../../utils/retry.js';
import '@shopify/shopify-api/adapters/node';

interface ShopifyProduct {
  id: number;
  title: string;
  vendor: string;
  variants: ShopifyVariant[];
}

interface ShopifyVariant {
  id: number;
  product_id: number;
  title: string;
  sku: string;
  price: string;
  inventory_quantity: number;
}

interface GraphQLVariantNode {
  id: string;
  title: string;
  sku: string;
  price: string;
  inventoryQuantity: number;
  product: {
    id: string;
    title: string;
    vendor: string;
  };
}

export class ShopifyProductSearchService {
  private shopDomain: string;
  private accessToken: string;
  private apiVersion: string = '2025-04';
  private restBaseUrl: string;
  private graphqlUrl: string;

  constructor() {
    this.shopDomain = process.env['SHOPIFY_SHOP_DOMAIN'] || '';
    this.accessToken = process.env['SHOPIFY_ACCESS_TOKEN'] || '';
    this.apiVersion = process.env['SHOPIFY_API_VERSION'] || '2025-04';

    if (!this.shopDomain || !this.accessToken) {
      logger.error('Shopify credentials not configured');
      throw new Error(
        'SHOPIFY_SHOP_DOMAIN and SHOPIFY_ACCESS_TOKEN must be set'
      );
    }

    this.restBaseUrl = `https://${this.shopDomain}/admin/api/${this.apiVersion}`;
    this.graphqlUrl = `${this.restBaseUrl}/graphql.json`;

    logger.info('ShopifyProductSearchService initialized', {
      shop: this.shopDomain,
      apiVersion: this.apiVersion,
    });
  }

  /**
   * SKU로 상품 검색 (여러 방법 시도)
   */
  async searchBySKU(sku: string): Promise<any> {
    logger.info(`Searching for SKU: ${sku}`);

    // 1. GraphQL productVariants 쿼리 시도
    try {
      const graphqlResult = await this.searchByGraphQL(sku);
      if (graphqlResult && graphqlResult.length > 0) {
        logger.info(`Found ${graphqlResult.length} products via GraphQL`);
        return {
          found: true,
          method: 'graphql',
          products: graphqlResult,
        };
      }
    } catch (error) {
      logger.warn(`GraphQL search failed for SKU ${sku}:`, error);
    }

    // 2. REST API로 모든 상품 검색 후 필터링
    try {
      const restResult = await this.searchByREST(sku);
      if (restResult && restResult.length > 0) {
        logger.info(`Found ${restResult.length} products via REST`);
        return {
          found: true,
          method: 'rest',
          products: restResult,
        };
      }
    } catch (error) {
      logger.warn(`REST search failed for SKU ${sku}:`, error);
    }

    // 3. GraphQL products 쿼리로 전체 검색
    try {
      const allProductsResult = await this.searchAllProducts(sku);
      if (allProductsResult && allProductsResult.length > 0) {
        logger.info(`Found ${allProductsResult.length} products via full scan`);
        return {
          found: true,
          method: 'full_scan',
          products: allProductsResult,
        };
      }
    } catch (error) {
      logger.warn(`Full scan failed for SKU ${sku}:`, error);
    }

    logger.warn(`No products found for SKU: ${sku}`);
    return {
      found: false,
      method: 'none',
      products: [],
    };
  }

  /**
   * GraphQL productVariants 쿼리로 검색
   */
  private async searchByGraphQL(sku: string): Promise<any[]> {
    const query = `
      query searchBySku($query: String!) {
        productVariants(first: 10, query: $query) {
          edges {
            node {
              id
              title
              sku
              price
              inventoryQuantity
              product {
                id
                title
                vendor
                productType
                handle
                status
              }
            }
          }
          pageInfo {
            hasNextPage
          }
        }
      }
    `;

    const response = await retry(
      async () => {
        return await axios.post(
          this.graphqlUrl,
          {
            query,
            variables: {
              query: `sku:${sku}`,
            },
          },
          {
            headers: {
              'X-Shopify-Access-Token': this.accessToken,
              'Content-Type': 'application/json',
            },
            timeout: 10000,
          }
        );
      },
      {
        retries: 2,
        minTimeout: 1000,
      }
    );

    if (response.data.errors) {
      throw new Error(
        `GraphQL errors: ${JSON.stringify(response.data.errors)}`
      );
    }

    const edges = response.data.data?.productVariants?.edges || [];
    return edges.map((edge: any) => this.formatGraphQLVariant(edge.node));
  }

  /**
   * REST API로 상품 검색
   */
  private async searchByREST(sku: string): Promise<any[]> {
    const products: ShopifyProduct[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore && page <= 5) {
      // 최대 5페이지까지만
      const url = `${this.restBaseUrl}/products.json`;

      const response = await retry(
        async () => {
          return await axios.get(url, {
            headers: {
              'X-Shopify-Access-Token': this.accessToken,
              'Content-Type': 'application/json',
            },
            params: {
              limit: 250,
              page: page,
            },
            timeout: 10000,
          });
        },
        {
          retries: 2,
          minTimeout: 1000,
        }
      );

      const pageProducts = response.data.products || [];
      products.push(...pageProducts);

      hasMore = pageProducts.length === 250;
      page++;
    }

    // SKU로 필터링
    const matchingProducts = [];
    for (const product of products) {
      for (const variant of product.variants) {
        if (variant.sku === sku) {
          matchingProducts.push({
            id: variant.id,
            product_id: product.id,
            product_title: product.title,
            vendor: product.vendor,
            variant_title: variant.title,
            sku: variant.sku,
            price: variant.price,
            inventory_quantity: variant.inventory_quantity || 0,
          });
        }
      }
    }

    return matchingProducts;
  }

  /**
   * GraphQL로 모든 상품 검색
   */
  private async searchAllProducts(sku: string): Promise<any[]> {
    const query = `
      query getAllProducts($cursor: String) {
        products(first: 100, after: $cursor) {
          edges {
            node {
              id
              title
              vendor
              handle
              status
              variants(first: 100) {
                edges {
                  node {
                    id
                    title
                    sku
                    price
                    inventoryQuantity
                  }
                }
              }
            }
            cursor
          }
          pageInfo {
            hasNextPage
          }
        }
      }
    `;

    const matchingProducts = [];
    let hasNextPage = true;
    let cursor = null;
    let pageCount = 0;

    while (hasNextPage && pageCount < 10) {
      // 최대 10페이지
      const response = await retry(
        async () => {
          return await axios.post(
            this.graphqlUrl,
            {
              query,
              variables: { cursor },
            },
            {
              headers: {
                'X-Shopify-Access-Token': this.accessToken,
                'Content-Type': 'application/json',
              },
              timeout: 10000,
            }
          );
        },
        {
          retries: 2,
          minTimeout: 1000,
        }
      );

      if (response.data.errors) {
        throw new Error(
          `GraphQL errors: ${JSON.stringify(response.data.errors)}`
        );
      }

      const products = response.data.data?.products?.edges || [];

      // SKU 매칭
      for (const productEdge of products) {
        const product = productEdge.node;
        for (const variantEdge of product.variants.edges) {
          const variant = variantEdge.node;
          if (variant.sku === sku) {
            matchingProducts.push({
              id: variant.id,
              product_id: product.id,
              product_title: product.title,
              vendor: product.vendor,
              variant_title: variant.title,
              sku: variant.sku,
              price: variant.price,
              inventory_quantity: variant.inventoryQuantity || 0,
              handle: product.handle,
              status: product.status,
            });
          }
        }
        cursor = productEdge.cursor;
      }

      hasNextPage =
        response.data.data?.products?.pageInfo?.hasNextPage || false;
      pageCount++;
    }

    return matchingProducts;
  }

  /**
   * GraphQL variant 포맷팅
   */
  private formatGraphQLVariant(variant: GraphQLVariantNode): any {
    return {
      id: variant.id,
      product_id: variant.product.id,
      product_title: variant.product.title,
      vendor: variant.product.vendor,
      variant_title: variant.title,
      sku: variant.sku,
      price: variant.price,
      inventory_quantity: variant.inventoryQuantity || 0,
    };
  }

  /**
   * 벌크로 여러 SKU 검색
   */
  async searchMultipleSKUs(skus: string[]): Promise<Map<string, any>> {
    const results = new Map<string, any>();

    // 병렬 처리 (최대 5개씩)
    const batchSize = 5;
    for (let i = 0; i < skus.length; i += batchSize) {
      const batch = skus.slice(i, i + batchSize);
      const batchPromises = batch.map((sku) =>
        this.searchBySKU(sku)
          .then((result) => ({ sku, result }))
          .catch((error) => ({ sku, error }))
      );

      const batchResults = await Promise.all(batchPromises);
      batchResults.forEach(({ sku, result, error }) => {
        if (error) {
          logger.error(`Failed to search SKU ${sku}:`, error);
          results.set(sku, { found: false, error: error.message });
        } else {
          results.set(sku, result);
        }
      });
    }

    return results;
  }
}
