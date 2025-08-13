// packages/backend/src/services/shopify/ShopifyInventoryService.ts
import { ShopifyService } from './ShopifyService.js';
import { logger } from '../../utils/logger.js';
import '@shopify/shopify-api/adapters/node';

interface InventoryLevel {
  id: string;
  inventoryItemId: string;
  locationId: string;
  available: number;
  incoming?: number;
  updated_at?: string;
}

interface InventoryAdjustment {
  inventoryItemId: string;
  locationId: string;
  delta: number;
  reason?: string;
}

interface InventoryItem {
  id: string;
  sku: string;
  tracked: boolean;
  requires_shipping: boolean;
  cost?: string;
  country_code_of_origin?: string;
  province_code_of_origin?: string;
  harmonized_system_code?: string;
}

/**
 * Enterprise Shopify Inventory Service
 * Extends ShopifyService to inherit proper initialization
 */
export class ShopifyInventoryService extends ShopifyService {
  constructor() {
    super();
  }

  /**
   * Get inventory level for a specific variant
   */
  async getInventoryLevel(variantId: string): Promise<number> {
    try {
      this.ensureInitialized();

      if (!this.client) {
        // Mock mode
        logger.debug('Mock mode: returning dummy inventory level');
        return Math.floor(Math.random() * 100);
      }

      // Get variant's inventory_item_id
      const variant = await this.client.get({
        path: `variants/${variantId}`,
      });

      if (!variant?.body?.variant) {
        throw new Error(`Variant ${variantId} not found`);
      }

      const inventoryItemId = variant.body.variant.inventory_item_id;

      // Get inventory levels
      const inventoryLevels = await this.client.get({
        path: 'inventory_levels',
        query: {
          inventory_item_ids: inventoryItemId,
        },
      });

      if (inventoryLevels?.body?.inventory_levels?.length > 0) {
        return inventoryLevels.body.inventory_levels[0].available || 0;
      }

      return 0;
    } catch (error: any) {
      logger.error('Failed to get inventory level:', error);
      throw new Error(
        `Failed to get Shopify inventory level: ${error.message}`
      );
    }
  }

  /**
   * Get inventory level by inventory item ID and location ID
   */
  async getInventoryLevelByIds(
    inventoryItemId: string,
    locationId: string
  ): Promise<InventoryLevel | null> {
    try {
      this.ensureInitialized();

      if (!this.client) {
        // Mock mode
        logger.debug('Mock mode: returning dummy inventory level');
        return {
          id: `mock_${inventoryItemId}_${locationId}`,
          inventoryItemId,
          locationId,
          available: Math.floor(Math.random() * 100),
          incoming: Math.floor(Math.random() * 50),
        };
      }

      const response = await this.client.get({
        path: 'inventory_levels',
        query: {
          inventory_item_ids: inventoryItemId,
          location_ids: locationId,
        },
      });

      if (response?.body?.inventory_levels?.length > 0) {
        const level = response.body.inventory_levels[0];
        return {
          id: level.id,
          inventoryItemId: level.inventory_item_id,
          locationId: level.location_id,
          available: level.available,
          incoming: level.incoming,
          updated_at: level.updated_at,
        };
      }

      return null;
    } catch (error: any) {
      logger.error('Failed to get inventory level by IDs:', error);
      throw new Error(`Failed to get inventory level: ${error.message}`);
    }
  }

  /**
   * Adjust inventory for a variant
   */
  async adjustInventory(variantId: string, newQuantity: number): Promise<void> {
    try {
      this.ensureInitialized();

      if (!this.client) {
        // Mock mode
        logger.debug('Mock mode: skipping inventory adjustment');
        return;
      }

      // Get variant's inventory_item_id
      const variant = await this.client.get({
        path: `variants/${variantId}`,
      });

      if (!variant?.body?.variant) {
        throw new Error(`Variant ${variantId} not found`);
      }

      const inventoryItemId = variant.body.variant.inventory_item_id;

      // Get first location
      const locations = await this.client.get({
        path: 'locations',
      });

      if (!locations?.body?.locations?.length) {
        throw new Error('No locations found');
      }

      const locationId = locations.body.locations[0].id;

      // Get current inventory level
      const currentLevels = await this.client.get({
        path: 'inventory_levels',
        query: {
          inventory_item_ids: inventoryItemId,
          location_ids: locationId,
        },
      });

      const currentQuantity =
        currentLevels?.body?.inventory_levels?.[0]?.available || 0;
      const delta = newQuantity - currentQuantity;

      // Adjust inventory
      await this.adjustInventoryLevel(inventoryItemId, locationId, delta);
    } catch (error: any) {
      logger.error('Failed to adjust inventory:', error);
      throw new Error(`Failed to adjust Shopify inventory: ${error.message}`);
    }
  }

  /**
   * Adjust inventory level by specific amount
   */
  async adjustInventoryLevel(
    inventoryItemId: string,
    locationId: string,
    delta: number,
    reason?: string
  ): Promise<void> {
    try {
      this.ensureInitialized();

      if (!this.client) {
        // Mock mode
        logger.debug('Mock mode: skipping inventory level adjustment');
        return;
      }

      if (delta === 0) {
        logger.debug('No inventory adjustment needed (delta = 0)');
        return;
      }

      const response = await this.client.post({
        path: 'inventory_levels/adjust',
        data: {
          inventory_item_id: inventoryItemId,
          location_id: locationId,
          available_adjustment: delta,
        },
      });

      if (!response?.body?.inventory_level) {
        throw new Error('Failed to adjust inventory level');
      }

      logger.info('Inventory level adjusted successfully', {
        inventoryItemId,
        locationId,
        delta,
        newAvailable: response.body.inventory_level.available,
        reason,
      });
    } catch (error: any) {
      logger.error('Failed to adjust inventory level:', error);
      throw new Error(`Failed to adjust inventory level: ${error.message}`);
    }
  }

  /**
   * Set inventory level to specific amount
   */
  async setInventoryLevel(
    inventoryItemId: string,
    locationId: string,
    available: number
  ): Promise<void> {
    try {
      this.ensureInitialized();

      if (!this.client) {
        // Mock mode
        logger.debug('Mock mode: skipping inventory level set');
        return;
      }

      const response = await this.client.post({
        path: 'inventory_levels/set',
        data: {
          inventory_item_id: inventoryItemId,
          location_id: locationId,
          available,
        },
      });

      if (!response?.body?.inventory_level) {
        throw new Error('Failed to set inventory level');
      }

      logger.info('Inventory level set successfully', {
        inventoryItemId,
        locationId,
        available: response.body.inventory_level.available,
      });
    } catch (error: any) {
      logger.error('Failed to set inventory level:', error);
      throw new Error(`Failed to set inventory level: ${error.message}`);
    }
  }

  /**
   * Get all locations
   */
  async getLocations(): Promise<
    Array<{ id: string; name: string; active: boolean }>
  > {
    try {
      this.ensureInitialized();

      if (!this.client) {
        // Mock mode
        logger.debug('Mock mode: returning dummy locations');
        return [
          {
            id: 'mock_location_1',
            name: 'Mock Primary Location',
            active: true,
          },
        ];
      }

      const response = await this.client.get({
        path: 'locations',
      });

      if (response?.body?.locations) {
        return response.body.locations.map((loc: any) => ({
          id: loc.id,
          name: loc.name,
          active: loc.active,
        }));
      }

      return [];
    } catch (error: any) {
      logger.error('Failed to get locations:', error);
      throw new Error(`Failed to get locations: ${error.message}`);
    }
  }

  /**
   * Get inventory item details
   */
  async getInventoryItem(
    inventoryItemId: string
  ): Promise<InventoryItem | null> {
    try {
      this.ensureInitialized();

      if (!this.client) {
        // Mock mode
        logger.debug('Mock mode: returning dummy inventory item');
        return {
          id: inventoryItemId,
          sku: `MOCK_SKU_${inventoryItemId}`,
          tracked: true,
          requires_shipping: true,
        };
      }

      const response = await this.client.get({
        path: `inventory_items/${inventoryItemId}`,
      });

      if (response?.body?.inventory_item) {
        const item = response.body.inventory_item;
        return {
          id: item.id,
          sku: item.sku,
          tracked: item.tracked,
          requires_shipping: item.requires_shipping,
          cost: item.cost,
          country_code_of_origin: item.country_code_of_origin,
          province_code_of_origin: item.province_code_of_origin,
          harmonized_system_code: item.harmonized_system_code,
        };
      }

      return null;
    } catch (error: any) {
      logger.error('Failed to get inventory item:', error);
      throw new Error(`Failed to get inventory item: ${error.message}`);
    }
  }

  /**
   * Bulk adjust inventory levels
   */
  async bulkAdjustInventory(adjustments: InventoryAdjustment[]): Promise<void> {
    try {
      this.ensureInitialized();

      if (!this.client) {
        // Mock mode
        logger.debug('Mock mode: skipping bulk inventory adjustment');
        return;
      }

      // Shopify doesn't have a bulk adjust endpoint in REST API
      // So we need to adjust one by one
      const results = await Promise.allSettled(
        adjustments.map((adj) =>
          this.adjustInventoryLevel(
            adj.inventoryItemId,
            adj.locationId,
            adj.delta,
            adj.reason
          )
        )
      );

      const failures = results.filter((r) => r.status === 'rejected');

      if (failures.length > 0) {
        logger.error(
          `${failures.length} inventory adjustments failed out of ${adjustments.length}`
        );
        throw new Error(
          `Some inventory adjustments failed: ${failures.length}/${adjustments.length}`
        );
      }

      logger.info(
        `Successfully adjusted ${adjustments.length} inventory levels`
      );
    } catch (error: any) {
      logger.error('Failed to bulk adjust inventory:', error);
      throw new Error(`Failed to bulk adjust inventory: ${error.message}`);
    }
  }

  /**
   * Get inventory levels for multiple items
   */
  async getMultipleInventoryLevels(
    inventoryItemIds: string[],
    locationIds?: string[]
  ): Promise<InventoryLevel[]> {
    try {
      this.ensureInitialized();

      if (!this.client) {
        // Mock mode
        logger.debug('Mock mode: returning dummy inventory levels');
        return inventoryItemIds.map((id) => ({
          id: `mock_level_${id}`,
          inventoryItemId: id,
          locationId: locationIds?.[0] || 'mock_location',
          available: Math.floor(Math.random() * 100),
        }));
      }

      const query: any = {
        inventory_item_ids: inventoryItemIds.join(','),
        limit: 250,
      };

      if (locationIds && locationIds.length > 0) {
        query.location_ids = locationIds.join(',');
      }

      const response = await this.client.get({
        path: 'inventory_levels',
        query,
      });

      if (response?.body?.inventory_levels) {
        return response.body.inventory_levels.map((level: any) => ({
          id: level.id,
          inventoryItemId: level.inventory_item_id,
          locationId: level.location_id,
          available: level.available,
          incoming: level.incoming,
          updated_at: level.updated_at,
        }));
      }

      return [];
    } catch (error: any) {
      logger.error('Failed to get multiple inventory levels:', error);
      throw new Error(`Failed to get inventory levels: ${error.message}`);
    }
  }

  /**
   * Get inventory by SKU
   */
  async getInventoryBySku(sku: string): Promise<number> {
    try {
      this.ensureInitialized();

      if (!this.client) {
        // Mock mode
        logger.debug(`Mock mode: returning dummy inventory for SKU ${sku}`);
        return 100;
      }

      // GraphQL로 SKU 검색 (더 효율적)
      try {
        const gqlResponse = await this.client.post({
          path: 'graphql',
          data: {
            query: `
              query getVariantBySku($sku: String!) {
                productVariants(first: 1, query: $sku) {
                  edges {
                    node {
                      id
                      sku
                      inventoryQuantity
                      inventoryItem {
                        id
                      }
                    }
                  }
                }
              }
            `,
            variables: { sku: `sku:${sku}` }
          }
        });

        if (gqlResponse?.body?.data?.productVariants?.edges?.length > 0) {
          const variant = gqlResponse.body.data.productVariants.edges[0].node;
          const quantity = variant.inventoryQuantity || 0;
          logger.info(`✅ Shopify inventory for ${sku}: ${quantity} (via GraphQL)`);
          return quantity;
        }
      } catch (gqlError) {
        logger.debug('GraphQL query failed, falling back to REST API');
      }

      // REST API 폴백 - 더 효율적인 검색
      let page = 1;
      let hasMore = true;
      
      while (hasMore && page <= 5) { // 최대 5페이지까지만 검색
        const productsResponse = await this.client.get({
          path: 'products',
          query: { 
            limit: '50',
            page: String(page),
            fields: 'id,variants'
          },
        });

        if (productsResponse?.body?.products) {
          for (const product of productsResponse.body.products) {
            const variant = product.variants?.find((v: any) => v.sku === sku);
            if (variant) {
              const inventoryItemId = variant.inventory_item_id;
              
              if (!inventoryItemId) {
                // variant에 직접 inventory_quantity가 있을 수 있음
                const quantity = variant.inventory_quantity || 0;
                logger.info(`✅ Shopify inventory for ${sku}: ${quantity} (from variant)`);
                return quantity;
              }

              // Get the primary location
              const locations = await this.getLocations();
              const primaryLocation = locations.find(loc => loc.active);
              
              if (!primaryLocation) {
                logger.warn('No active location found, using variant quantity');
                return variant.inventory_quantity || 0;
              }

              // Get inventory level for this item
              const level = await this.getInventoryLevelByIds(inventoryItemId, primaryLocation.id);
              const quantity = level?.available || 0;
              logger.info(`✅ Shopify inventory for ${sku}: ${quantity} (from inventory level)`);
              return quantity;
            }
          }
          
          hasMore = productsResponse.body.products.length === 50;
          page++;
        } else {
          hasMore = false;
        }
      }

      logger.warn(`No inventory item found for SKU: ${sku} after searching ${page - 1} pages`);
      return 0;

    } catch (error: any) {
      logger.error(`Failed to get inventory for SKU ${sku}:`, error);
      return 0;
    }
  }

  /**
   * Update inventory by SKU
   */
  async updateInventoryBySku(sku: string, quantity: number): Promise<boolean> {
    try {
      this.ensureInitialized();

      if (!this.client) {
        // Mock mode
        logger.debug(`Mock mode: updating inventory for SKU ${sku} to ${quantity}`);
        return true;
      }

      // Use GraphQL to find the inventory item ID for this SKU
      const query = `
        query getInventoryItemId($sku: String!) {
          productVariants(first: 1, query: $sku) {
            edges {
              node {
                id
                sku
                inventoryItem {
                  id
                }
              }
            }
          }
        }
      `;

      // Use the REST client to perform GraphQL query
      const graphQLResponse = await this.client.post({
        path: 'graphql',
        data: {
          query,
          variables: { sku: `sku:${sku}` }
        }
      });

      let inventoryItemId: string | null = null;
      
      if (graphQLResponse?.body?.data?.productVariants?.edges?.length > 0) {
        const variant = graphQLResponse.body.data.productVariants.edges[0].node;
        inventoryItemId = variant.inventoryItem?.id;
      }

      if (!inventoryItemId) {
        logger.warn(`No inventory item found for SKU: ${sku}`);
        return false;
      }

      // Extract numeric ID from GraphQL ID
      const numericInventoryItemId = inventoryItemId.split('/').pop();

      // Get the primary location
      const locations = await this.getLocations();
      const primaryLocation = locations.find(loc => loc.active);
      
      if (!primaryLocation) {
        throw new Error('No active location found');
      }

      // Update inventory level using the numeric ID
      logger.info(`📦 Updating Shopify inventory for SKU ${sku}: inventoryItemId=${numericInventoryItemId}, locationId=${primaryLocation.id}, quantity=${quantity}`);
      await this.setInventoryLevel(numericInventoryItemId!, primaryLocation.id, quantity);
      
      // Wait a bit for the update to propagate
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Verify the update by fetching the inventory again
      const verifyQuantity = await this.getInventoryBySku(sku);
      if (verifyQuantity === quantity) {
        logger.info(`✅ Successfully updated and verified Shopify inventory for SKU ${sku} to ${quantity}`);
        return true;
      } else {
        logger.warn(`⚠️ Shopify inventory update for SKU ${sku} may not have propagated. Expected: ${quantity}, Got: ${verifyQuantity}`);
        // Try once more
        await this.setInventoryLevel(numericInventoryItemId!, primaryLocation.id, quantity);
        logger.info(`🔄 Retried Shopify inventory update for SKU ${sku} to ${quantity}`);
        return true;
      }

    } catch (error: any) {
      logger.error(`Failed to update inventory for SKU ${sku}:`, error);
      return false;
    }
  }

  /**
   * Get service status
   */
  public getStatus(): any {
    const parentStatus = super.getStatus();
    return {
      ...parentStatus,
      service: 'ShopifyInventoryService',
    };
  }
}
