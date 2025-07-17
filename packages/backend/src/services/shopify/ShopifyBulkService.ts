// packages/backend/src/services/shopify/ShopifyBulkService.ts
import { ShopifyService } from './ShopifyService';
import { ShopifyGraphQLService } from './ShopifyGraphQLService';
import { logger } from '../../utils/logger';

interface PriceUpdate {
  sku: string;
  price: number;
}

interface InventoryUpdate {
  sku: string;
  quantity: number;
  adjustment?: boolean; // true면 delta, false면 절대값
}

interface SyncItem {
  sku: string;
  price: number;
  quantity: number;
}

interface BulkUpdateStats {
  total: number;
  success: number;
  failed: number;
  skipped: number;
}

export class ShopifyBulkService extends ShopifyService {
  private graphqlService: ShopifyGraphQLService;

  constructor() {
    super();
    this.graphqlService = new ShopifyGraphQLService();
  }

  /**
   * 배열을 지정된 크기의 청크로 나누는 헬퍼 함수
   */
  private chunk<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * 대량 가격 업데이트
   */
  async bulkUpdatePrices(
    updates: PriceUpdate[],
    batchSize = 100
  ): Promise<BulkUpdateStats> {
    logger.info(`Starting bulk price update for ${updates.length} items`);

    const stats: BulkUpdateStats = {
      total: updates.length,
      success: 0,
      failed: 0,
      skipped: 0,
    };

    // SKU로 variant 정보 조회
    const variantUpdates = await Promise.all(
      updates.map(async update => {
        try {
          const variant = await this.graphqlService.findVariantBySku(update.sku);
          if (variant) {
            return {
              variantId: variant.id,
              price: update.price.toFixed(2),
              sku: update.sku,
            };
          }
          logger.warn(`Variant not found for SKU: ${update.sku}`);
          stats.skipped++;
          return null;
        } catch (error) {
          logger.error(`Failed to find variant for SKU: ${update.sku}`, error);
          stats.failed++;
          return null;
        }
      })
    );

    // null 제거
    const validUpdates = variantUpdates.filter(u => u !== null) as Array<{
      variantId: string;
      price: string;
      sku: string;
    }>;

    // 배치 처리
    const batches = this.chunk(validUpdates, batchSize);
    
    for (let i = 0; i < batches.length; i++) {
      logger.info(`Processing price batch ${i + 1}/${batches.length}`);
      try {
        const batchUpdates = batches[i].map(({ variantId, price }) => ({ variantId, price }));
        await this.graphqlService.bulkUpdateVariantPrices(batchUpdates);
        stats.success += batches[i].length;
      } catch (error) {
        logger.error(`Failed to process price batch ${i + 1}`, error);
        stats.failed += batches[i].length;
      }
      
      // Rate limiting between batches
      if (i < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    logger.info('Bulk price update completed', stats);
    return stats;
  }

  /**
   * 대량 재고 업데이트
   */
  async bulkUpdateInventory(
    updates: InventoryUpdate[],
    batchSize = 100
  ): Promise<BulkUpdateStats> {
    logger.info(`Starting bulk inventory update for ${updates.length} items`);

    const stats: BulkUpdateStats = {
      total: updates.length,
      success: 0,
      failed: 0,
      skipped: 0,
    };

    // SKU로 inventory 정보 조회
    const inventoryUpdates = await Promise.all(
      updates.map(async update => {
        try {
          const variant = await this.graphqlService.findVariantBySku(update.sku);
          if (variant && variant.inventoryItem.inventoryLevels.edges.length > 0) {
            const inventoryLevel = variant.inventoryItem.inventoryLevels.edges[0].node;
            
            let availableDelta = update.quantity;
            if (!update.adjustment) {
              // 절대값인 경우 현재값과의 차이 계산
              availableDelta = update.quantity - inventoryLevel.available;
            }

            // 변경사항이 없으면 스킵
            if (availableDelta === 0) {
              stats.skipped++;
              return null;
            }

            return {
              inventoryItemId: variant.inventoryItem.id,
              locationId: inventoryLevel.location.id,
              availableDelta,
              sku: update.sku,
            };
          }
          logger.warn(`Inventory info not found for SKU: ${update.sku}`);
          stats.skipped++;
          return null;
        } catch (error) {
          logger.error(`Failed to find inventory for SKU: ${update.sku}`, error);
          stats.failed++;
          return null;
        }
      })
    );

    // null 제거
    const validUpdates = inventoryUpdates.filter(u => u !== null) as Array<{
      inventoryItemId: string;
      locationId: string;
      availableDelta: number;
      sku: string;
    }>;

    // 배치 처리
    const batches = this.chunk(validUpdates, batchSize);
    
    for (let i = 0; i < batches.length; i++) {
      logger.info(`Processing inventory batch ${i + 1}/${batches.length}`);
      try {
        const batchUpdates = batches[i].map(({ inventoryItemId, locationId, availableDelta }) => ({
          inventoryItemId,
          locationId,
          availableDelta,
        }));
        await this.graphqlService.bulkAdjustInventory(batchUpdates);
        stats.success += batches[i].length;
      } catch (error) {
        logger.error(`Failed to process inventory batch ${i + 1}`, error);
        stats.failed += batches[i].length;
      }
      
      // Rate limiting between batches
      if (i < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    logger.info('Bulk inventory update completed', stats);
    return stats;
  }

  /**
   * 전체 동기화 (가격 + 재고)
   */
  async fullSync(
    items: SyncItem[],
    batchSize = 100
  ): Promise<{
    price: BulkUpdateStats;
    inventory: BulkUpdateStats;
  }> {
    logger.info(`Starting full sync for ${items.length} items`);

    // 가격 업데이트
    const priceStats = await this.bulkUpdatePrices(
      items.map(item => ({ sku: item.sku, price: item.price })),
      batchSize
    );

    // 잠시 대기 (Rate limiting)
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 재고 업데이트
    const inventoryStats = await this.bulkUpdateInventory(
      items.map(item => ({ sku: item.sku, quantity: item.quantity, adjustment: false })),
      batchSize
    );

    logger.info('Full sync completed', { priceStats, inventoryStats });
    
    return {
      price: priceStats,
      inventory: inventoryStats,
    };
  }

  /**
   * CSV 파일로부터 대량 업데이트
   */
  async updateFromCSV(csvData: Array<{
    sku: string;
    price?: string | number;
    quantity?: string | number;
  }>): Promise<{
    price?: BulkUpdateStats;
    inventory?: BulkUpdateStats;
  }> {
    const results: {
      price?: BulkUpdateStats;
      inventory?: BulkUpdateStats;
    } = {};

    // 가격 업데이트가 필요한 항목
    const priceUpdates: PriceUpdate[] = [];
    
    for (const row of csvData) {
      if (row.price !== undefined && row.price !== '' && row.price !== null) {
        let priceValue: number;
        
        if (typeof row.price === 'string') {
          priceValue = parseFloat(row.price);
        } else {
          priceValue = row.price;
        }
        
        if (!isNaN(priceValue) && isFinite(priceValue) && priceValue > 0) {
          priceUpdates.push({
            sku: row.sku,
            price: priceValue,
          });
        }
      }
    }

    if (priceUpdates.length > 0) {
      results.price = await this.bulkUpdatePrices(priceUpdates);
    }

    // 재고 업데이트가 필요한 항목
    const inventoryUpdates: InventoryUpdate[] = [];
    
    for (const row of csvData) {
      if (row.quantity !== undefined && row.quantity !== '' && row.quantity !== null) {
        let quantityValue: number;
        
        if (typeof row.quantity === 'string') {
          quantityValue = parseInt(row.quantity, 10);
        } else {
          quantityValue = Math.floor(row.quantity);
        }
        
        if (!isNaN(quantityValue) && isFinite(quantityValue) && quantityValue >= 0) {
          inventoryUpdates.push({
            sku: row.sku,
            quantity: quantityValue,
            adjustment: false,
          });
        }
      }
    }

    if (inventoryUpdates.length > 0) {
      results.inventory = await this.bulkUpdateInventory(inventoryUpdates);
    }

    return results;
  }
}