// packages/backend/src/services/shopify/ShopifyGraphQLService.ts
import { ShopifyService } from './ShopifyService';
import { logger } from '@/utils/logger';
import { retry } from '@/utils/retry';

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
  variants: {
    edges: Array<{
      node: ProductVariant;
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

export class ShopifyGraphQLService extends ShopifyService {
  /**
   * vendor로 필터링된 상품 목록 조회
   */
  async getProductsByVendor(vendor: string, limit = 250): Promise<ShopifyProduct[]> {
    const client = await this.getGraphQLClient();
    const products: ShopifyProduct[] = [];
    let hasNextPage = true;
    let cursor: string | null = null;

    const query = `
      query GetProductsByVendor($vendor: String!, $first: Int!, $after: String) {
        products(first: $first, after: $after, query: $vendor) {
          edges {
            node {
              id
              title
              vendor
              variants(first: 100) {
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
                            id
                            location {
                              id
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
      while (hasNextPage) {
        const response = await retry(
          () => client.request(query, {
            variables: {
              vendor: `vendor:${vendor}`,
              first: Math.min(limit - products.length, 250),
              after: cursor,
            },
          }),
          {
            retries: 3,
            minTimeout: 1000,
            maxTimeout: 5000,
          }
        );

        const data = response.data as any;
        if (!data || !data.products) {
          throw new Error('Invalid response from Shopify API');
        }

        const edges = data.products.edges || [];
        products.push(...edges.map((edge: any) => edge.node));

        hasNextPage = data.products.pageInfo.hasNextPage && products.length < limit;
        cursor = edges.length > 0 ? edges[edges.length - 1].cursor : null;

        // Rate limiting
        if (hasNextPage) {
          await new Promise(resolve => setTimeout(resolve, 250));
        }
      }

      logger.info(`Fetched ${products.length} products for vendor: ${vendor}`);
      return products;
    } catch (error) {
      await this.logError('getProductsByVendor', error, { vendor });
      throw error;
    }
  }

  /**
   * 상품 변형(variant) 가격 일괄 업데이트
   */
  async bulkUpdateVariantPrices(updates: Array<{ variantId: string; price: string }>): Promise<BulkUpdateResult[]> {
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

        const response = await retry(
          () => client.request(mutation, {
            variables: {
              productId,
              variants,
            },
          }),
          {
            retries: 3,
            minTimeout: 1000,
            maxTimeout: 5000,
          }
        );

        const result = (response.data as any)?.productVariantsBulkUpdate;
        
        if (!result) {
          throw new Error('Invalid response from Shopify API');
        }

        if (result.userErrors && result.userErrors.length > 0) {
          logger.error('Shopify bulk update errors', result.userErrors);
        }

        results.push(result);

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
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
      const response = await retry(
        () => client.request(mutation, {
          variables: {
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
          },
        }),
        {
          retries: 3,
          minTimeout: 1000,
          maxTimeout: 5000,
        }
      );

      const result = (response.data as any)?.inventoryAdjustQuantities;
      
      if (!result) {
        throw new Error('Invalid response from Shopify API');
      }

      if (result.userErrors && result.userErrors.length > 0) {
        logger.error('Shopify inventory adjustment errors', result.userErrors);
        throw new Error(result.userErrors[0].message);
      }

      logger.info(`Adjusted inventory for ${inventoryItemId}: ${availableDelta}`);
      return result;
    } catch (error) {
      await this.logError('adjustInventoryQuantity', error, {
        inventoryItemId,
        locationId,
        availableDelta,
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
    reason: string = 'sync'
  ): Promise<BulkInventoryResult[]> {
    const client = await this.getGraphQLClient();

    const mutation = `
      mutation inventoryBulkAdjustQuantityAtLocation($inventoryItemAdjustments: [InventoryAdjustItemInput!]!, $locationId: ID!) {
        inventoryBulkAdjustQuantityAtLocation(inventoryItemAdjustments: $inventoryItemAdjustments, locationId: $locationId) {
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

    // 위치별로 그룹화
    const adjustmentsByLocation = adjustments.reduce((acc, adj) => {
      if (!acc[adj.locationId]) {
        acc[adj.locationId] = [];
      }
      acc[adj.locationId].push({
        inventoryItemId: adj.inventoryItemId,
        availableDelta: adj.availableDelta,
      });
      return acc;
    }, {} as Record<string, Array<{ inventoryItemId: string; availableDelta: number }>>);

    const results: BulkInventoryResult[] = [];

    try {
      for (const [locationId, locationAdjustments] of Object.entries(adjustmentsByLocation)) {
        const response = await retry(
          () => client.request(mutation, {
            variables: {
              locationId,
              inventoryItemAdjustments: locationAdjustments,
            },
          }),
          {
            retries: 3,
            minTimeout: 1000,
            maxTimeout: 5000,
          }
        );

        const result = (response.data as any)?.inventoryBulkAdjustQuantityAtLocation;
        
        if (!result) {
          throw new Error('Invalid response from Shopify API');
        }

        if (result.userErrors && result.userErrors.length > 0) {
          logger.error('Shopify bulk inventory adjustment errors', result.userErrors);
        }

        results.push(result);

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      logger.info(`Bulk adjusted inventory for ${adjustments.length} items`);
      return results;
    } catch (error) {
      await this.logError('bulkAdjustInventory', error);
      throw error;
    }
  }

  /**
   * SKU로 variant 찾기
   */
  async findVariantBySku(sku: string): Promise<ProductVariant | null> {
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
                inventoryLevels(first: 1) {
                  edges {
                    node {
                      id
                      location {
                        id
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
      const response = await client.request(query, {
        variables: {
          query: `sku:${sku}`,
        },
      });

      const data = response.data as any;
      if (!data || !data.productVariants) {
        return null;
      }

      const edges = data.productVariants.edges || [];
      return edges.length > 0 ? edges[0].node : null;
    } catch (error) {
      await this.logError('findVariantBySku', error, { sku });
      return null;
    }
  }

  /**
   * Variant ID로 Product ID 조회
   */
  async getProductIdFromVariantId(variantId: string): Promise<string | null> {
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
      const response = await client.request(query, {
        variables: {
          id: variantId,
        },
      });

      const data = response.data as any;
      return data?.productVariant?.product?.id || null;
    } catch (error) {
      await this.logError('getProductIdFromVariantId', error, { variantId });
      return null;
    }
  }
}