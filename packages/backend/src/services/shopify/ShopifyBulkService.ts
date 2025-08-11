// packages/backend/src/services/shopify/ShopifyBulkService.ts
import { ShopifyService } from './ShopifyService.js';
import { ShopifyGraphQLService } from './ShopifyGraphQLService.js';
import { logger } from '../../utils/logger.js';
import '@shopify/shopify-api/adapters/node';

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
  errors: Array<{
    sku: string;
    error: string;
  }>;
  duration?: number;
}

/**
 * Enterprise Shopify Bulk Operations Service
 * Handles batch updates with optimized performance and error recovery
 */
export class ShopifyBulkService extends ShopifyService {
  private graphqlService: ShopifyGraphQLService | null = null;
  private readonly DEFAULT_BATCH_SIZE = 100;
  private readonly DEFAULT_RETRY_ATTEMPTS = 3;
  private readonly RATE_LIMIT_DELAY = 1000; // 1 second

  constructor() {
    super();
    // GraphQL service will be initialized in initialize method
  }

  /**
   * Override initialize to also initialize GraphQL service
   */
  public override async initialize(): Promise<void> {
    // Initialize parent service first
    await super.initialize();

    // Initialize GraphQL service
    this.graphqlService = new ShopifyGraphQLService();
    if (typeof (this.graphqlService as any).initialize === 'function') {
      await (this.graphqlService as any).initialize();
    }

    logger.info('ShopifyBulkService initialized successfully');
  }

  /**
   * Ensure GraphQL service is available
   */
  private ensureGraphQLService(): void {
    if (!this.graphqlService) {
      throw new Error('GraphQL service not initialized');
    }
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
   * Rate limiting helper
   */
  private async rateLimit(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, this.RATE_LIMIT_DELAY));
  }

  /**
   * 대량 가격 업데이트 with enhanced error handling
   */
  async bulkUpdatePrices(
    updates: PriceUpdate[],
    batchSize: number = this.DEFAULT_BATCH_SIZE
  ): Promise<BulkUpdateStats> {
    this.ensureInitialized();
    this.ensureGraphQLService();

    const startTime = Date.now();
    logger.info(`Starting bulk price update for ${updates.length} items`);

    const stats: BulkUpdateStats = {
      total: updates.length,
      success: 0,
      failed: 0,
      skipped: 0,
      errors: [],
    };

    // Validate input
    if (!updates || updates.length === 0) {
      logger.warn('No price updates provided');
      return stats;
    }

    // SKU로 variant 정보 조회 (병렬 처리)
    const variantUpdates = await this.prepareVariantUpdates(updates, stats);
    const validUpdates = variantUpdates.filter((u) => u !== null);

    if (validUpdates.length === 0) {
      logger.warn('No valid variants found for price update');
      stats.duration = Date.now() - startTime;
      return stats;
    }

    // 배치 처리
    const batches = this.chunk(validUpdates, batchSize);
    logger.info(`Processing ${batches.length} batches of ${batchSize} items`);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      logger.debug(`Processing batch ${i + 1}/${batches.length}`);

      try {
        await this.processPriceBatch(batch, stats);

        // Rate limiting between batches
        if (i < batches.length - 1) {
          await this.rateLimit();
        }
      } catch (error: any) {
        logger.error(`Batch ${i + 1} failed:`, error);
        batch.forEach((item: any) => {
          stats.failed++;
          stats.errors.push({
            sku: item.sku,
            error: error.message,
          });
        });
      }
    }

    stats.duration = Date.now() - startTime;
    this.logBulkUpdateSummary('Price', stats);

    return stats;
  }

  /**
   * Prepare variant updates with parallel processing
   */
  private async prepareVariantUpdates(
    updates: PriceUpdate[],
    stats: BulkUpdateStats
  ): Promise<any[]> {
    const variantPromises = updates.map(async (update) => {
      try {
        const variant = await this.graphqlService!.findVariantBySku(update.sku);
        if (variant) {
          return {
            variantId: variant.id,
            price: update.price.toFixed(2),
            sku: update.sku,
          };
        }

        logger.warn(`Variant not found for SKU: ${update.sku}`);
        stats.skipped++;
        stats.errors.push({
          sku: update.sku,
          error: 'Variant not found',
        });
        return null;
      } catch (error: any) {
        logger.error(`Failed to find variant for SKU ${update.sku}:`, error);
        stats.failed++;
        stats.errors.push({
          sku: update.sku,
          error: error.message,
        });
        return null;
      }
    });

    return await Promise.all(variantPromises);
  }

  /**
   * Process single price batch with retry logic
   */
  private async processPriceBatch(
    batch: any[],
    stats: BulkUpdateStats
  ): Promise<void> {
    for (const update of batch) {
      let attempts = 0;
      let success = false;

      while (attempts < this.DEFAULT_RETRY_ATTEMPTS && !success) {
        try {
          await this.updateVariantPrice(update.variantId, update.price);
          stats.success++;
          success = true;
        } catch (error: any) {
          attempts++;

          if (attempts >= this.DEFAULT_RETRY_ATTEMPTS) {
            logger.error(
              `Failed to update price for ${update.sku} after ${attempts} attempts:`,
              error
            );
            stats.failed++;
            stats.errors.push({
              sku: update.sku,
              error: error.message,
            });
          } else {
            logger.warn(
              `Retrying price update for ${update.sku} (attempt ${attempts})`
            );
            await this.rateLimit();
          }
        }
      }
    }
  }

  /**
   * Update single variant price
   */
  private async updateVariantPrice(
    variantId: string,
    price: string
  ): Promise<void> {
    const mutation = `
      mutation productVariantUpdate($input: ProductVariantInput!) {
        productVariantUpdate(input: $input) {
          productVariant {
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

    const variables = {
      input: {
        id: variantId,
        price: price,
      },
    };

    const response = await this.graphqlService!.query(mutation, variables);

    if (response.data?.productVariantUpdate?.userErrors?.length > 0) {
      const errors = response.data.productVariantUpdate.userErrors;
      throw new Error(
        `Variant update failed: ${errors.map((e: any) => e.message).join(', ')}`
      );
    }
  }

  /**
   * 대량 재고 업데이트 with enhanced error handling
   */
  async bulkUpdateInventory(
    updates: InventoryUpdate[],
    locationId: string,
    batchSize: number = this.DEFAULT_BATCH_SIZE
  ): Promise<BulkUpdateStats> {
    this.ensureInitialized();
    this.ensureGraphQLService();

    const startTime = Date.now();
    logger.info(
      `Starting bulk inventory update for ${updates.length} items at location ${locationId}`
    );

    const stats: BulkUpdateStats = {
      total: updates.length,
      success: 0,
      failed: 0,
      skipped: 0,
      errors: [],
    };

    // Validate input
    if (!updates || updates.length === 0) {
      logger.warn('No inventory updates provided');
      return stats;
    }

    if (!locationId) {
      throw new Error('Location ID is required for inventory updates');
    }

    // Prepare inventory items
    const inventoryItems = await this.prepareInventoryItems(
      updates,
      locationId,
      stats
    );
    const validItems = inventoryItems.filter((item) => item !== null);

    if (validItems.length === 0) {
      logger.warn('No valid inventory items found for update');
      stats.duration = Date.now() - startTime;
      return stats;
    }

    // 배치 처리
    const batches = this.chunk(validItems, batchSize);
    logger.info(`Processing ${batches.length} batches of ${batchSize} items`);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      logger.debug(`Processing inventory batch ${i + 1}/${batches.length}`);

      try {
        await this.processInventoryBatch(batch, stats);

        // Rate limiting between batches
        if (i < batches.length - 1) {
          await this.rateLimit();
        }
      } catch (error: any) {
        logger.error(`Inventory batch ${i + 1} failed:`, error);
        batch.forEach((item: any) => {
          stats.failed++;
          stats.errors.push({
            sku: item.sku,
            error: error.message,
          });
        });
      }
    }

    stats.duration = Date.now() - startTime;
    this.logBulkUpdateSummary('Inventory', stats);

    return stats;
  }

  /**
   * Prepare inventory items for update
   */
  private async prepareInventoryItems(
    updates: InventoryUpdate[],
    locationId: string,
    stats: BulkUpdateStats
  ): Promise<any[]> {
    const itemPromises = updates.map(async (update) => {
      try {
        const variant = await this.graphqlService!.findVariantBySku(update.sku);
        if (!variant) {
          logger.warn(`Variant not found for SKU: ${update.sku}`);
          stats.skipped++;
          stats.errors.push({
            sku: update.sku,
            error: 'Variant not found',
          });
          return null;
        }

        const inventoryItem = await this.graphqlService!.getInventoryItem(
          variant.id,
          locationId
        );

        if (!inventoryItem) {
          logger.warn(`Inventory item not found for SKU: ${update.sku}`);
          stats.skipped++;
          stats.errors.push({
            sku: update.sku,
            error: 'Inventory item not found',
          });
          return null;
        }

        return {
          inventoryItemId: inventoryItem.id,
          locationId: locationId,
          quantity: update.quantity,
          adjustment: update.adjustment || false,
          sku: update.sku,
        };
      } catch (error: any) {
        logger.error(
          `Failed to prepare inventory item for SKU ${update.sku}:`,
          error
        );
        stats.failed++;
        stats.errors.push({
          sku: update.sku,
          error: error.message,
        });
        return null;
      }
    });

    return await Promise.all(itemPromises);
  }

  /**
   * Process single inventory batch
   */
  private async processInventoryBatch(
    batch: any[],
    stats: BulkUpdateStats
  ): Promise<void> {
    const mutation = `
      mutation inventoryBulkAdjustQuantityAtLocation($inventoryItemAdjustments: [InventoryAdjustItemInput!]!, $locationId: ID!) {
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

    const adjustments = batch.map((item) => ({
      inventoryItemId: item.inventoryItemId,
      availableDelta: item.adjustment
        ? item.quantity
        : item.quantity - (item.currentQuantity || 0),
    }));

    try {
      const response = await this.graphqlService!.query(mutation, {
        inventoryItemAdjustments: adjustments,
        locationId: batch[0].locationId,
      });

      if (
        response.data?.inventoryBulkAdjustQuantityAtLocation?.userErrors
          ?.length > 0
      ) {
        const errors =
          response.data.inventoryBulkAdjustQuantityAtLocation.userErrors;
        throw new Error(
          `Inventory update failed: ${errors.map((e: any) => e.message).join(', ')}`
        );
      }

      stats.success += batch.length;
    } catch (error: any) {
      logger.error('Inventory batch update failed:', error);
      batch.forEach((item) => {
        stats.failed++;
        stats.errors.push({
          sku: item.sku,
          error: error.message,
        });
      });
    }
  }

  /**
   * 전체 동기화 (가격 + 재고)
   */
  async bulkSync(
    items: SyncItem[],
    locationId: string,
    options: {
      updatePrices?: boolean;
      updateInventory?: boolean;
      batchSize?: number;
    } = {}
  ): Promise<{
    price: BulkUpdateStats;
    inventory: BulkUpdateStats;
    totalDuration: number;
  }> {
    this.ensureInitialized();

    const startTime = Date.now();
    const {
      updatePrices = true,
      updateInventory = true,
      batchSize = this.DEFAULT_BATCH_SIZE,
    } = options;

    logger.info(`Starting bulk sync for ${items.length} items`, {
      updatePrices,
      updateInventory,
      locationId,
    });

    const results = {
      price: null as any,
      inventory: null as any,
      totalDuration: 0,
    };

    // 가격 업데이트
    if (updatePrices) {
      const priceUpdates: PriceUpdate[] = items.map((item) => ({
        sku: item.sku,
        price: item.price,
      }));

      results.price = await this.bulkUpdatePrices(priceUpdates, batchSize);
    }

    // 재고 업데이트
    if (updateInventory) {
      const inventoryUpdates: InventoryUpdate[] = items.map((item) => ({
        sku: item.sku,
        quantity: item.quantity,
        adjustment: false,
      }));

      results.inventory = await this.bulkUpdateInventory(
        inventoryUpdates,
        locationId,
        batchSize
      );
    }

    results.totalDuration = Date.now() - startTime;

    logger.info('Bulk sync completed', {
      totalDuration: results.totalDuration,
      priceStats: results.price,
      inventoryStats: results.inventory,
    });

    return results;
  }

  /**
   * Log bulk update summary
   */
  private logBulkUpdateSummary(type: string, stats: BulkUpdateStats): void {
    const successRate =
      stats.total > 0 ? ((stats.success / stats.total) * 100).toFixed(2) : '0';

    logger.info(`
╔════════════════════════════════════════════════════════════╗
║ ${type} Bulk Update Summary                                  
╠════════════════════════════════════════════════════════════╣
║ Total Items:     ${stats.total.toString().padEnd(10)}
║ ✅ Success:      ${stats.success.toString().padEnd(10)} (${successRate}%)
║ ❌ Failed:       ${stats.failed.toString().padEnd(10)}
║ ⏭️  Skipped:      ${stats.skipped.toString().padEnd(10)}
║ ⏱️  Duration:     ${stats.duration ? `${stats.duration}ms` : 'N/A'}
╚════════════════════════════════════════════════════════════╝
    `);

    if (stats.errors.length > 0) {
      logger.error('Failed items:', stats.errors);
    }
  }

  /**
   * Get service status
   */
  public getStatus(): any {
    const parentStatus = super.getStatus();
    return {
      ...parentStatus,
      hasGraphQLService: !!this.graphqlService,
      batchSize: this.DEFAULT_BATCH_SIZE,
      retryAttempts: this.DEFAULT_RETRY_ATTEMPTS,
    };
  }

  /**
   * Cleanup resources
   */
  public override async cleanup(): Promise<void> {
    await super.cleanup();
    this.graphqlService = null;
    logger.info('ShopifyBulkService cleanup completed');
  }
}
