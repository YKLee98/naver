// packages/backend/src/services/shopify/ShopifyGraphQLService.ts
import { ShopifyService } from './ShopifyService';
import { logger } from '../../utils/logger';
import { retry } from '../../utils/retry';
import { AppError } from '../../middlewares/error.middleware';

// Type definitions
interface InventoryQuantity {
  quantity: number;
}

interface InventoryLevel {
  id: string;
  quantities: InventoryQuantity[];
  location: {
    id: string;
    name: string;
  };
}

interface ProductVariant {
  id: string;
  sku: string;
  price: string;
  inventoryQuantity?: number;
  inventoryItem?: {
    id: string;
    inventoryLevels?: {
      edges: Array<{
        node: InventoryLevel;
      }>;
    };
    inventoryLevel?: InventoryLevel;
  };
}

interface ShopifyProduct {
  id: string;
  title: string;
  vendor: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  variants: {
    edges: Array<{
      node: ProductVariant;
    }>;
  };
  images?: {
    edges: Array<{
      node: {
        url: string;
        altText?: string;
      };
    }>;
  };
}

interface ProductsQueryResponse {
  products: {
    edges: Array<{
      node: ShopifyProduct;
      cursor: string;
    }>;
    pageInfo: {
      hasNextPage: boolean;
    };
  };
}

interface LocationsQueryResponse {
  locations: {
    edges: Array<{
      node: {
        id: string;
        name: string;
        isActive: boolean;
      };
    }>;
  };
}

interface BulkUpdateResult {
  product?: {
    id: string;
  };
  productVariants?: Array<{
    id: string;
    price: string;
  }>;
  userErrors?: Array<{
    field: string[];
    message: string;
  }>;
}

interface InventoryAdjustmentResult {
  inventoryAdjustmentGroup?: {
    id: string;
    reason: string;
    changes: Array<{
      name: string;
      delta: number;
    }>;
  };
  userErrors?: Array<{
    field: string[];
    message: string;
  }>;
}

export class ShopifyGraphQLService extends ShopifyService {
  private readonly DEFAULT_BATCH_SIZE = 100;
  private readonly DEFAULT_DELAY_MS = 100;
  private readonly DEFAULT_PAGE_SIZE = 250;
  private defaultLocationId: string | null = null;

  /**
   * GraphQL 쿼리 실행 헬퍼 메서드
   */
  private async executeQuery<T = any>(query: string, variables: any = {}): Promise<T> {
    const client = await this.getGraphQLClient();
    
    try {
      // Shopify API client는 query 메서드를 사용합니다
      const response = await client.query({
        data: {
          query,
          variables
        }
      });

      if (response.body.errors && response.body.errors.length > 0) {
        const error = response.body.errors[0];
        throw new AppError(`GraphQL Error: ${error.message}`, 400);
      }

      return response.body.data;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      
      logger.error('GraphQL query execution failed', {
        error: error.message,
        query: query.substring(0, 100) + '...',
        variables
      });
      
      throw new AppError('Failed to execute GraphQL query', 500);
    }
  }

  /**
   * 기본 위치 ID 가져오기
   */
  private async getDefaultLocationId(): Promise<string> {
    if (this.defaultLocationId) {
      return this.defaultLocationId;
    }

    const query = `
      query getLocations {
        locations(first: 10) {
          edges {
            node {
              id
              name
              isActive
            }
          }
        }
      }
    `;

    try {
      const response = await this.executeQuery<LocationsQueryResponse>(query);
      const locations = response.locations.edges;
      
      // 활성화된 첫 번째 위치를 기본값으로 사용
      const activeLocation = locations.find(edge => edge.node.isActive);
      if (activeLocation) {
        this.defaultLocationId = activeLocation.node.id;
        logger.info(`Default location set to: ${activeLocation.node.name} (${activeLocation.node.id})`);
        return this.defaultLocationId;
      }

      // 활성화된 위치가 없으면 첫 번째 위치 사용
      if (locations.length > 0) {
        this.defaultLocationId = locations[0].node.id;
        return this.defaultLocationId;
      }

      throw new AppError('No locations found in Shopify', 500);
    } catch (error) {
      logger.error('Failed to get default location', error);
      throw error;
    }
  }

  /**
   * Vendor로 필터링된 상품 목록 조회 (재고 포함)
   */
  async getProductsByVendor(
    vendor: string, 
    options: {
      limit?: number;
      includeInactive?: boolean;
      includeInventory?: boolean;
    } = {}
  ): Promise<ShopifyProduct[]> {
    const { limit = 1000, includeInactive = false, includeInventory = true } = options;
    const products: ShopifyProduct[] = [];
    let hasNextPage = true;
    let cursor: string | null = null;

    // 재고 정보가 필요한 경우 먼저 location ID를 가져옴
    let locationId: string | null = null;
    if (includeInventory) {
      try {
        locationId = await this.getDefaultLocationId();
      } catch (error) {
        logger.warn('Failed to get location ID, proceeding without inventory data', error);
        // 재고 정보 없이 계속 진행
      }
    }

    // GraphQL 쿼리 구성
    const query = `
      query GetProductsByVendor($query: String!, $first: Int!, $after: String) {
        products(first: $first, after: $after, query: $query) {
          edges {
            node {
              id
              title
              vendor
              status
              createdAt
              updatedAt
              images(first: 1) {
                edges {
                  node {
                    url
                    altText
                  }
                }
              }
              variants(first: 100) {
                edges {
                  node {
                    id
                    sku
                    price
                    ${includeInventory && locationId ? `
                    inventoryQuantity
                    inventoryItem {
                      id
                      inventoryLevels(first: 10) {
                        edges {
                          node {
                            id
                            quantities(names: ["available"]) {
                              quantity
                            }
                            location {
                              id
                              name
                            }
                          }
                        }
                      }
                    }
                    ` : ''}
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

    try {
      // Build query string
      const queryParts = [`vendor:"${vendor}"`];
      if (!includeInactive) {
        queryParts.push('status:active');
      }
      const searchQuery = queryParts.join(' AND ');

      while (hasNextPage && products.length < limit) {
        const response = await retry<ProductsQueryResponse>(
          async () => {
            const data = await this.executeQuery<ProductsQueryResponse>(query, {
              query: searchQuery,
              first: Math.min(limit - products.length, this.DEFAULT_PAGE_SIZE),
              after: cursor,
            });
            return data;
          },
          {
            retries: 3,
            minTimeout: 1000,
            maxTimeout: 5000,
            onRetry: (err, attempt) => {
              logger.warn(`Retrying getProductsByVendor (attempt ${attempt})`, {
                error: err.message,
                vendor
              });
            },
          }
        );

        if (!response || !response.products) {
          throw new AppError('Invalid response from Shopify API', 502);
        }

        const edges = response.products.edges || [];
        
        // 상품 데이터 처리 및 재고 정보 매핑
        const processedProducts = edges.map(edge => {
          const product = edge.node;
          
          // variants 처리
          if (product.variants && product.variants.edges) {
            product.variants.edges = product.variants.edges.map(variantEdge => {
              const variant = variantEdge.node;
              
              // 재고 정보 처리
              if (variant.inventoryItem && variant.inventoryItem.inventoryLevels) {
                const inventoryLevels = variant.inventoryItem.inventoryLevels.edges;
                
                // 기본 위치의 재고 찾기
                const defaultLocationInventory = inventoryLevels.find(
                  level => level.node.location.id === locationId
                );
                
                if (defaultLocationInventory && defaultLocationInventory.node.quantities.length > 0) {
                  // quantities 배열에서 available 재고 추출
                  variant.inventoryQuantity = defaultLocationInventory.node.quantities[0].quantity;
                }
              }
              
              return variantEdge;
            });
          }
          
          return product;
        });

        products.push(...processedProducts);

        hasNextPage = response.products.pageInfo.hasNextPage && products.length < limit;
        cursor = edges.length > 0 ? edges[edges.length - 1].cursor : null;

        // Rate limiting between requests
        if (hasNextPage) {
          await this.delay(250);
        }
      }

      logger.info(`Fetched ${products.length} products for vendor: ${vendor}`);
      return products;
    } catch (error) {
      await this.logError('getProductsByVendor', error, { vendor, limit });
      throw error;
    }
  }

  /**
   * 상품 변형(variant) 가격 일괄 업데이트
   */
  async bulkUpdateVariantPrices(updates: Array<{ variantId: string; price: string }>): Promise<BulkUpdateResult[]> {
    const mutation = `
      mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
          product {
            id
          }
          productVariants {
            id
            price
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    // Product ID를 먼저 조회해야 함
    const productIdMap = new Map<string, string>();
    for (const update of updates) {
      const productId = await this.getProductIdFromVariantId(update.variantId);
      if (productId) {
        productIdMap.set(update.variantId, productId);
      }
    }

    // 상품 ID별로 그룹화
    const updatesByProduct = updates.reduce((acc, update) => {
      const productId = productIdMap.get(update.variantId);
      if (productId) {
        if (!acc[productId]) {
          acc[productId] = [];
        }
        acc[productId].push(update);
      }
      return acc;
    }, {} as Record<string, typeof updates>);

    const results: BulkUpdateResult[] = [];

    try {
      for (const [productId, productUpdates] of Object.entries(updatesByProduct)) {
        const variants = productUpdates.map(update => ({
          id: update.variantId,
          price: update.price,
        }));

        const response = await retry<any>(
          async () => {
            const data = await this.executeQuery(mutation, {
              productId,
              variants,
            });
            return data;
          },
          {
            retries: 3,
            minTimeout: 1000,
            maxTimeout: 5000,
          }
        );

        const result = response?.productVariantsBulkUpdate;
        
        if (!result) {
          throw new AppError('Invalid response from Shopify API', 502);
        }

        if (result.userErrors && result.userErrors.length > 0) {
          logger.error('Shopify bulk update errors', result.userErrors);
        }

        results.push(result);

        // Rate limiting
        await this.delay(100);
      }

      logger.info(`Bulk updated prices for ${updates.length} variants`);
      return results;
    } catch (error) {
      await this.logError('bulkUpdateVariantPrices', error);
      throw error;
    }
  }

  /**
   * 재고 수량 조정
   */
  async adjustInventoryQuantity(
    inventoryItemId: string,
    locationId: string,
    delta: number,
    reason: string = 'sync'
  ): Promise<InventoryAdjustmentResult> {
    const mutation = `
      mutation inventoryAdjustQuantities($input: InventoryAdjustQuantitiesInput!) {
        inventoryAdjustQuantities(input: $input) {
          inventoryAdjustmentGroup {
            id
            reason
            changes {
              name
              delta
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    try {
      const response = await retry<any>(
        async () => {
          const data = await this.executeQuery(mutation, {
            input: {
              reason,
              name: 'available',
              changes: [
                {
                  inventoryItemId,
                  locationId,
                  delta,
                },
              ],
            },
          });
          return data;
        },
        {
          retries: 3,
          minTimeout: 1000,
          maxTimeout: 5000,
        }
      );

      const result = response?.inventoryAdjustQuantities;
      
      if (!result) {
        throw new AppError('Invalid response from Shopify API', 502);
      }

      if (result.userErrors && result.userErrors.length > 0) {
        logger.error('Shopify inventory adjustment errors', result.userErrors);
        throw new AppError(result.userErrors[0].message, 400);
      }

      logger.info(`Adjusted inventory for ${inventoryItemId}: ${delta}`);
      return result;
    } catch (error) {
      await this.logError('adjustInventoryQuantity', error, {
        inventoryItemId,
        locationId,
        delta,
      });
      throw error;
    }
  }

  /**
   * SKU로 variant 찾기 (재고 포함)
   */
  async findVariantBySku(sku: string, includeInventory: boolean = true): Promise<ProductVariant | null> {
    if (!sku) {
      logger.warn('SKU not provided for variant search');
      return null;
    }

    let locationId: string | null = null;
    if (includeInventory) {
      try {
        locationId = await this.getDefaultLocationId();
      } catch (error) {
        logger.warn('Failed to get location ID, proceeding without inventory data', error);
      }
    }

    const query = `
      query FindVariantBySku($query: String!) {
        productVariants(first: 1, query: $query) {
          edges {
            node {
              id
              sku
              price
              ${includeInventory && locationId ? `
              inventoryQuantity
              inventoryItem {
                id
                inventoryLevels(first: 10) {
                  edges {
                    node {
                      id
                      quantities(names: ["available"]) {
                        quantity
                      }
                      location {
                        id
                        name
                      }
                    }
                  }
                }
              }
              ` : ''}
            }
          }
        }
      }
    `;

    try {
      const response = await this.executeQuery<any>(query, {
        query: `sku:"${sku}"`,
      });

      const edges = response?.productVariants?.edges || [];
      const variant = edges.length > 0 ? edges[0].node : null;

      if (variant) {
        // 재고 정보 처리
        if (variant.inventoryItem && variant.inventoryItem.inventoryLevels) {
          const inventoryLevels = variant.inventoryItem.inventoryLevels.edges;
          
          // 기본 위치의 재고 찾기
          const defaultLocationInventory = inventoryLevels.find(
            level => level.node.location.id === locationId
          );
          
          if (defaultLocationInventory && defaultLocationInventory.node.quantities.length > 0) {
            variant.inventoryQuantity = defaultLocationInventory.node.quantities[0].quantity;
          }
        }

        logger.debug(`Found variant for SKU ${sku}`, {
          variantId: variant.id,
          price: variant.price,
          inventoryQuantity: variant.inventoryQuantity
        });
      }

      return variant;
    } catch (error) {
      await this.logError('findVariantBySku', error, { sku });
      return null;
    }
  }

  /**
   * Variant ID로 Product ID 조회
   */
  async getProductIdFromVariantId(variantId: string): Promise<string | null> {
    if (!variantId) {
      logger.warn('Variant ID not provided');
      return null;
    }

    const query = `
      query GetProductIdFromVariant($id: ID!) {
        productVariant(id: $id) {
          product {
            id
          }
        }
      }
    `;

    try {
      const response = await this.executeQuery<any>(query, {
        id: variantId,
      });

      const productId = response?.productVariant?.product?.id || null;

      if (!productId) {
        logger.warn(`Product ID not found for variant: ${variantId}`);
      }

      return productId;
    } catch (error) {
      await this.logError('getProductIdFromVariantId', error, { variantId });
      return null;
    }
  }

  /**
   * 재고 레벨 일괄 조회
   */
  async getBulkInventoryLevels(
    inventoryItemIds: string[],
    locationIds?: string[]
  ): Promise<Array<{
    inventoryItemId: string;
    locationId: string;
    available: number;
  }>> {
    const query = `
      query getInventoryLevels($inventoryItemIds: [ID!]!, $locationIds: [ID!]) {
        nodes(ids: $inventoryItemIds) {
          ... on InventoryItem {
            id
            inventoryLevels(first: 50, locationIds: $locationIds) {
              edges {
                node {
                  id
                  quantities(names: ["available"]) {
                    quantity
                  }
                  location {
                    id
                    name
                  }
                }
              }
            }
          }
        }
      }
    `;

    try {
      const response = await this.executeQuery<any>(query, {
        inventoryItemIds,
        locationIds: locationIds || [await this.getDefaultLocationId()]
      });

      const inventoryLevels: Array<{
        inventoryItemId: string;
        locationId: string;
        available: number;
      }> = [];

      if (response.nodes) {
        response.nodes.forEach((node: any) => {
          if (node && node.inventoryLevels) {
            node.inventoryLevels.edges.forEach((edge: any) => {
              const level = edge.node;
              if (level.quantities && level.quantities.length > 0) {
                inventoryLevels.push({
                  inventoryItemId: node.id,
                  locationId: level.location.id,
                  available: level.quantities[0].quantity
                });
              }
            });
          }
        });
      }

      return inventoryLevels;
    } catch (error) {
      await this.logError('getBulkInventoryLevels', error);
      throw error;
    }
  }

  /**
   * Helper: 지연 함수
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Helper: 에러 로깅 확장
   */
  protected async logError(
    operation: string,
    error: any,
    additionalContext?: Record<string, any>
  ): Promise<void> {
    const context = {
      service: 'ShopifyGraphQLService',
      operation,
      ...additionalContext,
      error: {
        message: error.message,
        code: error.code,
        stack: error.stack,
        response: error.response?.data
      }
    };

    logger.error(`ShopifyGraphQL operation failed: ${operation}`, context);

    // 부모 클래스의 logError 호출
    await super.logError(operation, error, additionalContext);
  }
}