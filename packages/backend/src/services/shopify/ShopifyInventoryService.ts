// packages/backend/src/services/shopify/ShopifyInventoryService.ts
import { shopifyApi } from '@shopify/shopify-api';
import { config } from '@/config';
import { logger } from '@/utils/logger';

export class ShopifyInventoryService {
  private shopify: any;
  private session: any;

  constructor() {
    this.shopify = shopifyApi({
      apiKey: config.shopify.apiKey!,
      apiSecretKey: config.shopify.apiSecret!,
      apiVersion: config.shopify.apiVersion,
      hostName: config.shopify.shopDomain,
      scopes: ['read_inventory', 'write_inventory', 'read_products', 'write_products'],
    });

    this.session = {
      shop: config.shopify.shopDomain,
      accessToken: config.shopify.accessToken,
    };
  }

  /**
   * 재고 수준 조회
   */
  async getInventoryLevel(variantId: string): Promise<number> {
    try {
      const client = new this.shopify.clients.Rest({ session: this.session });
      
      // 먼저 variant의 inventory_item_id를 가져옴
      const variant = await client.get({
        path: `variants/${variantId}`,
      });

      const inventoryItemId = variant.body.variant.inventory_item_id;

      // inventory level 조회
      const inventoryLevels = await client.get({
        path: 'inventory_levels',
        query: {
          inventory_item_ids: inventoryItemId,
        },
      });

      if (inventoryLevels.body.inventory_levels.length > 0) {
        return inventoryLevels.body.inventory_levels[0].available || 0;
      }

      return 0;
    } catch (error) {
      logger.error('Failed to get inventory level:', error);
      throw new Error('Failed to get Shopify inventory level');
    }
  }

  /**
   * 재고 조정
   */
  async adjustInventory(variantId: string, newQuantity: number): Promise<void> {
    try {
      const client = new this.shopify.clients.Rest({ session: this.session });
      
      // variant의 inventory_item_id와 location_id 가져오기
      const variant = await client.get({
        path: `variants/${variantId}`,
      });

      const inventoryItemId = variant.body.variant.inventory_item_id;

      // 첫 번째 location 가져오기
      const locations = await client.get({
        path: 'locations',
      });

      if (locations.body.locations.length === 0) {
        throw new Error('No locations found');
      }

      const locationId = locations.body.locations[0].id;

      // 현재 재고 수준 가져오기
      const currentLevels = await client.get({
        path: 'inventory_levels',
        query: {
          inventory_item_ids: inventoryItemId,
          location_ids: locationId,
        },
      });

      const currentQuantity = currentLevels.body.inventory_levels[0]?.available || 0;
      const delta = newQuantity - currentQuantity;

      // 재고 조정
      await client.post({
        path: 'inventory_levels/adjust',
        data: {
          location_id: locationId,
          inventory_item_id: inventoryItemId,
          available_adjustment: delta,
        },
      });

      logger.info(`Adjusted Shopify inventory for variant ${variantId}: ${currentQuantity} -> ${newQuantity}`);
    } catch (error) {
      logger.error('Failed to adjust inventory:', error);
      throw new Error('Failed to adjust Shopify inventory');
    }
  }

  /**
   * 여러 variant의 재고 일괄 조정
   */
  async bulkAdjustInventory(adjustments: Array<{ variantId: string; quantity: number }>): Promise<void> {
    try {
      const client = new this.shopify.clients.Rest({ session: this.session });
      
      // 첫 번째 location 가져오기
      const locations = await client.get({
        path: 'locations',
      });

      if (locations.body.locations.length === 0) {
        throw new Error('No locations found');
      }

      const locationId = locations.body.locations[0].id;

      // 각 variant에 대해 조정
      for (const adjustment of adjustments) {
        await this.adjustInventory(adjustment.variantId, adjustment.quantity);
      }

      logger.info(`Bulk adjusted inventory for ${adjustments.length} variants`);
    } catch (error) {
      logger.error('Failed to bulk adjust inventory:', error);
      throw new Error('Failed to bulk adjust Shopify inventory');
    }
  }
}