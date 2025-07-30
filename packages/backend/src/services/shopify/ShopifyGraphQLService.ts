// packages/backend/src/services/shopify/ShopifyGraphQLService.ts
import { ShopifyService } from './ShopifyService';
import { logger } from '../../utils/logger';
import { retry } from '../../utils/retry';
import { AppError } from '../../utils/errors';

// GraphQL Response Type
interface GraphQLResponse<T = any> {
  data: T;
  errors?: Array<{
    message: string;
    extensions?: any;
  }>;
}

// Product Related Types
interface ProductVariant {
  id: string;
  sku: string;
  price: string;
  inventoryItem: {
    id: string;
    inventoryLevels: {
      edges: Array<{
        node: {
          id: string;
          location: {
            id: string;
            name?: string;
          };
          available: number;
        };
      }>;
    };
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
}

// Mutation Result Types
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

interface BulkInventoryResult {
  inventoryLevels?: Array<{
    id: string;
    available: number;
  }>;
  userErrors?: Array<{
    field: string[];
    message: string;
  }>;
}

// Query Response Types
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

interface ProductVariantsQueryResponse {
  productVariants: {
    edges: Array<{
      node: ProductVariant;
    }>;
  };
}

interface ProductVariantQueryResponse {
  productVariant: {
    product: {
      id: string;
    };
  };
}

// Service Options
interface BulkOperationOptions {
  batchSize?: number;
  delayBetweenBatches?: number;
  maxRetries?: number;
}

export class ShopifyGraphQLService extends ShopifyService {
  private readonly DEFAULT_BATCH_SIZE = 100;
  private readonly DEFAULT_DELAY_MS = 100;
  private readonly DEFAULT_PAGE_SIZE = 250;

  /**
   * Vendor로 필터링된 상품 목록 조회
   */
  async getProductsByVendor(
    vendor: string, 
    options: {
      limit?: number;
      includeInactive?: boolean;
    } = {}
  ): Promise<ShopifyProduct[]> {
    const { limit = 1000, includeInactive = false } = options;
    const client = await this.getGraphQLClient();
    const products: ShopifyProduct[] = [];
    let hasNextPage = true;
    let cursor: string | null = null;

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
              variants(first: 100) {
                edges {
                  node {
                    id
                    sku
                    price
                    inventoryItem {
                      id
                      inventoryLevels(first: 10) {
                        edges {
                          node {
                            id
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
        const response = await retry<GraphQLResponse<ProductsQueryResponse>>(
          () => client.request(query, {
            query: searchQuery,
            first: Math.min(limit - products.length, this.DEFAULT_PAGE_SIZE),
            after: cursor,
          }),
          {
            retries: 3,
            minTimeout: 1000,
            maxTimeout: 5000,
            onRetry: (err, attempt) => {
              logger.warn(`Retrying getProductsByVendor (attempt ${attempt})`, err);
            },
          }
        );

        const data = response.data;
        if (!data || !data.products) {
          throw new AppError('Invalid response from Shopify API', 502);
        }

        const edges = data.products.edges || [];
        products.push(...edges.map(edge => edge.node));

        hasNextPage = data.products.pageInfo.hasNextPage && products.length < limit;
        const lastEdge = edges.length > 0 ? edges[edges.length - 1] : null;
        cursor = lastEdge ? lastEdge.cursor : null;

        // Rate limiting
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
  async bulkUpdateVariantPrices(
    updates: Array<{ variantId: string; price: string }>,
    options: BulkOperationOptions = {}
  ): Promise<BulkUpdateResult[]> {
    const {
      batchSize = this.DEFAULT_BATCH_SIZE,
      delayBetweenBatches = this.DEFAULT_DELAY_MS,
      maxRetries = 3
    } = options;

    const client = await this.getGraphQLClient();

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

    // Validate inputs
    if (!updates || updates.length === 0) {
      logger.warn('No variant price updates provided');
      return [];
    }

    // Product ID를 먼저 조회
    const productIdMap = new Map<string, string>();
    const variantBatches = this.chunk(updates, batchSize);

    for (const batch of variantBatches) {
      await Promise.all(
        batch.map(async update => {
          const productId = await this.getProductIdFromVariantId(update.variantId);
          if (productId) {
            productIdMap.set(update.variantId, productId);
          } else {
            logger.warn(`Product ID not found for variant: ${update.variantId}`);
          }
        })
      );
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
    const errors: Array<{ productId: string; error: any }> = [];

    try {
      for (const [productId, productUpdates] of Object.entries(updatesByProduct)) {
        const variants = productUpdates.map(update => ({
          id: update.variantId,
          price: update.price,
        }));

        try {
          const response = await retry<GraphQLResponse<{ productVariantsBulkUpdate: BulkUpdateResult }>>(
            () => client.request(mutation, {
              productId,
              variants,
            }),
            {
              retries: maxRetries,
              minTimeout: 1000,
              maxTimeout: 5000,
            }
          );

          const result = response.data?.productVariantsBulkUpdate;
          
          if (!result) {
            throw new AppError('Invalid response from Shopify API', 502);
          }

          if (result.userErrors && result.userErrors.length > 0) {
            logger.error('Shopify bulk update errors', {
              productId,
              errors: result.userErrors
            });
          }

          results.push(result);
        } catch (error) {
          errors.push({ productId, error });
          logger.error(`Failed to update prices for product ${productId}`, error);
        }

        // Rate limiting between batches
        await this.delay(delayBetweenBatches);
      }

      logger.info(`Bulk updated prices for ${updates.length} variants`, {
        successful: results.length,
        failed: errors.length
      });

      if (errors.length > 0) {
        throw new AppError(
          `Failed to update ${errors.length} products`, 
          207
        );
      }

      return results;
    } catch (error) {
      await this.logError('bulkUpdateVariantPrices', error, {
        totalUpdates: updates.length,
        processed: results.length
      });
      throw error;
    }
  }

  /**
   * 재고 수량 조정
   */
  async adjustInventoryQuantity(
    inventoryItemId: string,
    locationId: string,
    availableDelta: number,
    reason: string = 'sync'
  ): Promise<InventoryAdjustmentResult> {
    const client = await this.getGraphQLClient();

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
      const response = await retry<GraphQLResponse<{ inventoryAdjustQuantities: InventoryAdjustmentResult }>>(
        () => client.request(mutation, {
          input: {
            reason,
            name: 'available',
            changes: [
              {
                inventoryItemId,
                locationId,
                delta: availableDelta,
              },
            ],
          },
        }),
        {
          retries: 3,
          minTimeout: 1000,
          maxTimeout: 5000,
          onRetry: (err, attempt) => {
            logger.warn(`Retrying inventory adjustment (attempt ${attempt})`, {
              inventoryItemId,
              error: err.message
            });
          },
        }
      );

      const result = response.data?.inventoryAdjustQuantities;
      
      if (!result) {
        throw new AppError('Invalid response from Shopify API', 502);
      }

      if (result.userErrors && result.userErrors.length > 0) {
        const errorMessage = result.userErrors.map(e => e.message).join(', ');
        logger.error('Shopify inventory adjustment errors', {
          inventoryItemId,
          locationId,
          errors: result.userErrors
        });
        throw new AppError(errorMessage, 400);
      }

      logger.info('Adjusted inventory successfully', {
        inventoryItemId,
        locationId,
        delta: availableDelta,
        adjustmentId: result.inventoryAdjustmentGroup?.id
      });

      return result;
    } catch (error) {
      await this.logError('adjustInventoryQuantity', error, {
        inventoryItemId,
        locationId,
        availableDelta,
        reason
      });
      throw error;
    }
  }

  /**
   * 재고 수량 일괄 조정
   */
  async bulkAdjustInventory(
    adjustments: Array<{
      inventoryItemId: string;
      locationId: string;
      availableDelta: number;
    }>,
    reason: string = 'sync',
    options: BulkOperationOptions = {}
  ): Promise<BulkInventoryResult[]> {
    const {
      batchSize = this.DEFAULT_BATCH_SIZE,
      delayBetweenBatches = this.DEFAULT_DELAY_MS,
      maxRetries = 3
    } = options;

    const client = await this.getGraphQLClient();

    const mutation = `
      mutation inventoryBulkAdjustQuantityAtLocation(
        $inventoryItemAdjustments: [InventoryAdjustItemInput!]!, 
        $locationId: ID!
      ) {
        inventoryBulkAdjustQuantityAtLocation(
          inventoryItemAdjustments: $inventoryItemAdjustments, 
          locationId: $locationId
        ) {
          inventoryLevels {
            id
            available
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    // Validate inputs
    if (!adjustments || adjustments.length === 0) {
      logger.warn('No inventory adjustments provided');
      return [];
    }

    // 위치별로 그룹화
    const adjustmentsByLocation = adjustments.reduce((acc, adj) => {
      if (!acc[adj.locationId]) {
        acc[adj.locationId] = [];
      }
      acc[adj.locationId]!.push({
        inventoryItemId: adj.inventoryItemId,
        availableDelta: adj.availableDelta,
      });
      return acc;
    }, {} as Record<string, Array<{ inventoryItemId: string; availableDelta: number }>>);

    const results: BulkInventoryResult[] = [];
    const errors: Array<{ locationId: string; error: any }> = [];

    try {
      for (const [locationId, locationAdjustments] of Object.entries(adjustmentsByLocation)) {
        // Process in batches
        const batches = this.chunk(locationAdjustments, batchSize);

        for (const batch of batches) {
          try {
            const response = await retry<GraphQLResponse<{ inventoryBulkAdjustQuantityAtLocation: BulkInventoryResult }>>(
              () => client.request(mutation, {
                locationId,
                inventoryItemAdjustments: batch,
              }),
              {
                retries: maxRetries,
                minTimeout: 1000,
                maxTimeout: 5000,
              }
            );

            const result = response.data?.inventoryBulkAdjustQuantityAtLocation;
            
            if (!result) {
              throw new AppError('Invalid response from Shopify API', 502);
            }

            if (result.userErrors && result.userErrors.length > 0) {
              logger.error('Shopify bulk inventory adjustment errors', {
                locationId,
                errors: result.userErrors
              });
            }

            results.push(result);
          } catch (error) {
            errors.push({ locationId, error });
            logger.error(`Failed to adjust inventory for location ${locationId}`, error);
          }

          // Rate limiting between batches
          await this.delay(delayBetweenBatches);
        }
      }

      logger.info('Bulk inventory adjustment completed', {
        totalAdjustments: adjustments.length,
        successful: results.length,
        failed: errors.length,
        reason
      });

      if (errors.length > 0) {
        throw new AppError(
          `Failed to adjust inventory for ${errors.length} locations`,
          207
        );
      }

      return results;
    } catch (error) {
      await this.logError('bulkAdjustInventory', error, {
        totalAdjustments: adjustments.length,
        processed: results.length
      });
      throw error;
    }
  }

  /**
   * SKU로 variant 찾기
   */
  async findVariantBySku(sku: string): Promise<ProductVariant | null> {
    if (!sku) {
      logger.warn('SKU not provided for variant search');
      return null;
    }

    const client = await this.getGraphQLClient();

    const query = `
      query FindVariantBySku($query: String!) {
        productVariants(first: 1, query: $query) {
          edges {
            node {
              id
              sku
              price
              inventoryItem {
                id
                inventoryLevels(first: 10) {
                  edges {
                    node {
                      id
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
    `;

    try {
      const response = await retry<GraphQLResponse<ProductVariantsQueryResponse>>(
        () => client.request(query, {
          query: `sku:"${sku}"`,
        }),
        {
          retries: 2,
          minTimeout: 500,
          maxTimeout: 2000,
        }
      );

      const data = response.data;
      if (!data || !data.productVariants) {
        logger.warn(`No variant found for SKU: ${sku}`);
        return null;
      }

      const edges = data.productVariants.edges || [];
      const variant = edges.length > 0 && edges[0] ? edges[0].node : null;

      if (variant) {
        logger.debug(`Found variant for SKU ${sku}`, {
          variantId: variant.id,
          price: variant.price
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

    const client = await this.getGraphQLClient();

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
      const response = await retry<GraphQLResponse<ProductVariantQueryResponse>>(
        () => client.request(query, {
          id: variantId,
        }),
        {
          retries: 2,
          minTimeout: 500,
          maxTimeout: 2000,
        }
      );

      const data = response.data;
      const productId = data?.productVariant?.product?.id || null;

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
   * Helper: 배열을 청크로 분할
   */
  private chunk<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
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
  protected override async logError(
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