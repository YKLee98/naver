// packages/backend/src/services/shopify/ShopifyBulkService.ts
import { ShopifyService } from './ShopifyService';
import { ShopifyGraphQLService } from './ShopifyGraphQLService';
import { logger } from '../../utils/logger';
import { AppError } from '../../utils/errors';
import { performance } from 'perf_hooks';

// Types and Interfaces
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
  errors?: Array<{
    sku: string;
    error: string;
  }>;
  executionTime?: number;
}

interface CSVRow {
  sku: string;
  price?: string | number;
  quantity?: string | number;
  [key: string]: any;
}

interface BulkServiceOptions {
  batchSize?: number;
  delayBetweenBatches?: number;
  maxRetries?: number;
  continueOnError?: boolean;
}

export class ShopifyBulkService extends ShopifyService {
  private graphqlService: ShopifyGraphQLService;
  private readonly DEFAULT_BATCH_SIZE = 100;
  private readonly DEFAULT_BATCH_DELAY = 1000;

  constructor() {
    super();
    this.graphqlService = new ShopifyGraphQLService();
  }

  /**
   * 배열을 지정된 크기의 청크로 나누는 헬퍼 함수
   */
  private chunk<T>(array: T[], size: number): T[][] {
    if (size <= 0) {
      throw new AppError('Batch size must be greater than 0', 400);
    }

    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, Math.min(i + size, array.length)));
    }
    return chunks;
  }

  /**
   * 지연 함수
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 대량 가격 업데이트
   */
  async bulkUpdatePrices(
    updates: PriceUpdate[],
    options: BulkServiceOptions = {}
  ): Promise<BulkUpdateStats> {
    const {
      batchSize = this.DEFAULT_BATCH_SIZE,
      delayBetweenBatches = this.DEFAULT_BATCH_DELAY,
      continueOnError = true
    } = options;

    const startTime = performance.now();
    logger.info('Starting bulk price update', { 
      totalItems: updates.length,
      batchSize,
      options 
    });

    const stats: BulkUpdateStats = {
      total: updates.length,
      success: 0,
      failed: 0,
      skipped: 0,
      errors: []
    };

    // 입력 검증
    if (!updates || updates.length === 0) {
      logger.warn('No price updates provided');
      stats.executionTime = performance.now() - startTime;
      return stats;
    }

    // SKU로 variant 정보 조회
    const variantUpdates = await this.resolveVariantUpdates(updates, stats);

    // null 제거 및 타입 안전성 보장
    const validUpdates = variantUpdates.filter((u): u is NonNullable<typeof u> => u !== null);

    if (validUpdates.length === 0) {
      logger.warn('No valid price updates after variant resolution');
      stats.executionTime = performance.now() - startTime;
      return stats;
    }

    // 배치 처리
    const batches = this.chunk(validUpdates, batchSize);
    
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      if (!batch || batch.length === 0) continue;

      logger.info(`Processing price batch ${i + 1}/${batches.length}`, {
        batchSize: batch.length
      });

      try {
        const batchUpdates = batch.map(({ variantId, price }) => ({ 
          variantId, 
          price: price.toString() 
        }));
        
        await this.graphqlService.bulkUpdateVariantPrices(batchUpdates, {
          maxRetries: options.maxRetries
        });
        
        stats.success += batch.length;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`Failed to process price batch ${i + 1}`, { error: errorMessage });
        
        if (continueOnError) {
          stats.failed += batch.length;
          batch.forEach(item => {
            stats.errors?.push({
              sku: item.sku,
              error: errorMessage
            });
          });
        } else {
          throw new AppError(`Batch update failed: ${errorMessage}`, 500);
        }
      }
      
      // Rate limiting between batches
      if (i < batches.length - 1) {
        await this.delay(delayBetweenBatches);
      }
    }

    stats.executionTime = performance.now() - startTime;
    logger.info('Bulk price update completed', stats);
    return stats;
  }

  /**
   * Variant 정보 조회 및 변환
   */
  private async resolveVariantUpdates(
    updates: PriceUpdate[],
    stats: BulkUpdateStats
  ): Promise<Array<{
    variantId: string;
    price: string;
    sku: string;
  } | null>> {
    const results = await Promise.all(
      updates.map(async update => {
        try {
          // 가격 검증
          if (!this.isValidPrice(update.price)) {
            stats.skipped++;
            stats.errors?.push({
              sku: update.sku,
              error: `Invalid price: ${update.price}`
            });
            return null;
          }

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
          stats.errors?.push({
            sku: update.sku,
            error: 'Variant not found'
          });
          return null;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          logger.error(`Failed to find variant for SKU: ${update.sku}`, { error: errorMessage });
          stats.failed++;
          stats.errors?.push({
            sku: update.sku,
            error: errorMessage
          });
          return null;
        }
      })
    );

    return results;
  }

  /**
   * 대량 재고 업데이트
   */
  async bulkUpdateInventory(
    updates: InventoryUpdate[],
    options: BulkServiceOptions = {}
  ): Promise<BulkUpdateStats> {
    const {
      batchSize = this.DEFAULT_BATCH_SIZE,
      delayBetweenBatches = this.DEFAULT_BATCH_DELAY,
      continueOnError = true
    } = options;

    const startTime = performance.now();
    logger.info('Starting bulk inventory update', {
      totalItems: updates.length,
      batchSize,
      options
    });

    const stats: BulkUpdateStats = {
      total: updates.length,
      success: 0,
      failed: 0,
      skipped: 0,
      errors: []
    };

    // 입력 검증
    if (!updates || updates.length === 0) {
      logger.warn('No inventory updates provided');
      stats.executionTime = performance.now() - startTime;
      return stats;
    }

    // SKU로 inventory 정보 조회
    const inventoryUpdates = await this.resolveInventoryUpdates(updates, stats);

    // null 제거 및 타입 안전성 보장
    const validUpdates = inventoryUpdates.filter((u): u is NonNullable<typeof u> => u !== null);

    if (validUpdates.length === 0) {
      logger.warn('No valid inventory updates after resolution');
      stats.executionTime = performance.now() - startTime;
      return stats;
    }

    // 배치 처리
    const batches = this.chunk(validUpdates, batchSize);
    
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      if (!batch || batch.length === 0) continue;

      logger.info(`Processing inventory batch ${i + 1}/${batches.length}`, {
        batchSize: batch.length
      });

      try {
        const batchUpdates = batch.map(({ inventoryItemId, locationId, availableDelta }) => ({
          inventoryItemId,
          locationId,
          availableDelta,
        }));
        
        await this.graphqlService.bulkAdjustInventory(batchUpdates, 'sync', {
          maxRetries: options.maxRetries
        });
        
        stats.success += batch.length;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`Failed to process inventory batch ${i + 1}`, { error: errorMessage });
        
        if (continueOnError) {
          stats.failed += batch.length;
          batch.forEach(item => {
            stats.errors?.push({
              sku: item.sku,
              error: errorMessage
            });
          });
        } else {
          throw new AppError(`Batch update failed: ${errorMessage}`, 500);
        }
      }
      
      // Rate limiting between batches
      if (i < batches.length - 1) {
        await this.delay(delayBetweenBatches);
      }
    }

    stats.executionTime = performance.now() - startTime;
    logger.info('Bulk inventory update completed', stats);
    return stats;
  }

  /**
   * Inventory 정보 조회 및 변환
   */
  private async resolveInventoryUpdates(
    updates: InventoryUpdate[],
    stats: BulkUpdateStats
  ): Promise<Array<{
    inventoryItemId: string;
    locationId: string;
    availableDelta: number;
    sku: string;
  } | null>> {
    const results = await Promise.all(
      updates.map(async update => {
        try {
          // 수량 검증
          if (!this.isValidQuantity(update.quantity)) {
            stats.skipped++;
            stats.errors?.push({
              sku: update.sku,
              error: `Invalid quantity: ${update.quantity}`
            });
            return null;
          }

          const variant = await this.graphqlService.findVariantBySku(update.sku);
          if (!variant || !variant.inventoryItem.inventoryLevels.edges.length) {
            logger.warn(`Inventory info not found for SKU: ${update.sku}`);
            stats.skipped++;
            stats.errors?.push({
              sku: update.sku,
              error: 'Inventory info not found'
            });
            return null;
          }

          const firstEdge = variant.inventoryItem.inventoryLevels.edges[0];
          if (!firstEdge) {
            logger.warn(`No inventory levels for SKU: ${update.sku}`);
            stats.skipped++;
            return null;
          }

          const inventoryLevel = firstEdge.node;
          
          let availableDelta = update.quantity;
          if (!update.adjustment) {
            // 절대값인 경우 현재값과의 차이 계산
            availableDelta = update.quantity - inventoryLevel.available;
          }

          // 변경사항이 없으면 스킵
          if (availableDelta === 0) {
            stats.skipped++;
            logger.debug(`No inventory change for SKU: ${update.sku}`);
            return null;
          }

          return {
            inventoryItemId: variant.inventoryItem.id,
            locationId: inventoryLevel.location.id,
            availableDelta,
            sku: update.sku,
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          logger.error(`Failed to find inventory for SKU: ${update.sku}`, { error: errorMessage });
          stats.failed++;
          stats.errors?.push({
            sku: update.sku,
            error: errorMessage
          });
          return null;
        }
      })
    );

    return results;
  }

  /**
   * 전체 동기화 (가격 + 재고)
   */
  async fullSync(
    items: SyncItem[],
    options: BulkServiceOptions = {}
  ): Promise<{
    price: BulkUpdateStats;
    inventory: BulkUpdateStats;
    totalExecutionTime: number;
  }> {
    const startTime = performance.now();
    logger.info(`Starting full sync for ${items.length} items`);

    // 입력 검증
    if (!items || items.length === 0) {
      return {
        price: this.createEmptyStats(),
        inventory: this.createEmptyStats(),
        totalExecutionTime: 0
      };
    }

    // 가격 업데이트
    const priceStats = await this.bulkUpdatePrices(
      items.map(item => ({ sku: item.sku, price: item.price })),
      options
    );

    // 잠시 대기 (Rate limiting)
    await this.delay(2000);

    // 재고 업데이트
    const inventoryStats = await this.bulkUpdateInventory(
      items.map(item => ({ sku: item.sku, quantity: item.quantity, adjustment: false })),
      options
    );

    const totalExecutionTime = performance.now() - startTime;
    
    logger.info('Full sync completed', { 
      priceStats, 
      inventoryStats,
      totalExecutionTime 
    });
    
    return {
      price: priceStats,
      inventory: inventoryStats,
      totalExecutionTime
    };
  }

  /**
   * CSV 파일로부터 대량 업데이트
   */
  async updateFromCSV(
    csvData: CSVRow[],
    options: BulkServiceOptions = {}
  ): Promise<{
    price?: BulkUpdateStats;
    inventory?: BulkUpdateStats;
    summary: {
      totalRows: number;
      validPriceRows: number;
      validInventoryRows: number;
      invalidRows: number;
    };
  }> {
    logger.info('Starting update from CSV', { totalRows: csvData.length });

    const results: {
      price?: BulkUpdateStats;
      inventory?: BulkUpdateStats;
      summary: {
        totalRows: number;
        validPriceRows: number;
        validInventoryRows: number;
        invalidRows: number;
      };
    } = {
      summary: {
        totalRows: csvData.length,
        validPriceRows: 0,
        validInventoryRows: 0,
        invalidRows: 0
      }
    };

    // CSV 데이터 검증 및 파싱
    const { priceUpdates, inventoryUpdates } = this.parseCSVData(csvData, results.summary);

    // 가격 업데이트 실행
    if (priceUpdates.length > 0) {
      results.price = await this.bulkUpdatePrices(priceUpdates, options);
    }

    // 재고 업데이트 실행
    if (inventoryUpdates.length > 0) {
      // 가격 업데이트 후 잠시 대기
      if (priceUpdates.length > 0) {
        await this.delay(2000);
      }
      results.inventory = await this.bulkUpdateInventory(inventoryUpdates, options);
    }

    logger.info('CSV update completed', results);
    return results;
  }

  /**
   * CSV 데이터 파싱 및 검증
   */
  private parseCSVData(
    csvData: CSVRow[],
    summary: {
      validPriceRows: number;
      validInventoryRows: number;
      invalidRows: number;
    }
  ): {
    priceUpdates: PriceUpdate[];
    inventoryUpdates: InventoryUpdate[];
  } {
    const priceUpdates: PriceUpdate[] = [];
    const inventoryUpdates: InventoryUpdate[] = [];
    const processedSkus = new Set<string>();

    for (const row of csvData) {
      if (!row.sku || typeof row.sku !== 'string' || row.sku.trim() === '') {
        summary.invalidRows++;
        logger.warn('Invalid row: missing or invalid SKU', { row });
        continue;
      }

      const sku = row.sku.trim();

      // 중복 SKU 체크
      if (processedSkus.has(sku)) {
        summary.invalidRows++;
        logger.warn(`Duplicate SKU in CSV: ${sku}`);
        continue;
      }
      processedSkus.add(sku);

      // 가격 파싱
      if (row.price !== undefined && row.price !== '' && row.price !== null) {
        const priceValue = this.parsePrice(row.price);
        
        if (priceValue !== null) {
          priceUpdates.push({
            sku,
            price: priceValue,
          });
          summary.validPriceRows++;
        } else {
          logger.warn(`Invalid price value for SKU ${sku}:`, row.price);
        }
      }

      // 재고 파싱
      if (row.quantity !== undefined && row.quantity !== '' && row.quantity !== null) {
        const quantityValue = this.parseQuantity(row.quantity);
        
        if (quantityValue !== null) {
          inventoryUpdates.push({
            sku,
            quantity: quantityValue,
            adjustment: false,
          });
          summary.validInventoryRows++;
        } else {
          logger.warn(`Invalid quantity value for SKU ${sku}:`, row.quantity);
        }
      }
    }

    return { priceUpdates, inventoryUpdates };
  }

  /**
   * 가격 값 파싱 및 검증
   */
  private parsePrice(value: string | number): number | null {
    let priceValue: number;
    
    if (typeof value === 'string') {
      // 통화 기호 및 쉼표 제거
      const cleanedValue = value.replace(/[$,]/g, '').trim();
      priceValue = parseFloat(cleanedValue);
    } else {
      priceValue = value;
    }
    
    return this.isValidPrice(priceValue) ? priceValue : null;
  }

  /**
   * 재고 수량 파싱 및 검증
   */
  private parseQuantity(value: string | number): number | null {
    let quantityValue: number;
    
    if (typeof value === 'string') {
      // 쉼표 제거 및 정수 변환
      const cleanedValue = value.replace(/,/g, '').trim();
      quantityValue = parseInt(cleanedValue, 10);
    } else {
      quantityValue = Math.floor(value);
    }
    
    return this.isValidQuantity(quantityValue) ? quantityValue : null;
  }

  /**
   * 가격 유효성 검증
   */
  private isValidPrice(price: number): boolean {
    return !isNaN(price) && isFinite(price) && price > 0 && price <= 999999.99;
  }

  /**
   * 수량 유효성 검증
   */
  private isValidQuantity(quantity: number): boolean {
    return !isNaN(quantity) && isFinite(quantity) && quantity >= 0 && quantity <= 999999;
  }

  /**
   * 빈 통계 객체 생성
   */
  private createEmptyStats(): BulkUpdateStats {
    return {
      total: 0,
      success: 0,
      failed: 0,
      skipped: 0,
      errors: [],
      executionTime: 0
    };
  }
}