// packages/backend/src/services/sync/SyncService.ts
import { Redis } from 'ioredis';
import { 
  ProductMapping, 
  InventoryTransaction, 
  PriceHistory,
  OrderSyncStatus,
  SystemLog 
} from '../../models';
import { NaverProductService, NaverOrderService } from '../../services/naver';
import { ShopifyBulkService, ShopifyGraphQLService } from '../../services/shopify';
import { PriceSyncService } from './PriceSyncService';
import { InventorySyncService } from './InventorySyncService';
import { logger } from '../../utils/logger';
import { EventEmitter } from 'events';
import { AppError } from '../../utils/errors';

export interface SyncResult {
  success: boolean;
  totalItems: number;
  successCount: number;
  failureCount: number;
  errors: Array<{
    sku: string;
    error: string;
  }>;
  duration: number;
}

export interface SyncOptions {
  batchSize?: number;
  retryAttempts?: number;
  rateLimit?: number;
  vendor?: string;
}

export class SyncService extends EventEmitter {
  private naverProductService: NaverProductService;
  private naverOrderService: NaverOrderService;
  private shopifyBulkService: ShopifyBulkService;
  private shopifyGraphQLService: ShopifyGraphQLService;
  private priceSyncService: PriceSyncService;
  private inventorySyncService: InventorySyncService;
  private redis: Redis;
  private isSyncing: boolean = false;

  // Default configurations
  private readonly DEFAULT_BATCH_SIZE = 50;
  private readonly DEFAULT_RETRY_ATTEMPTS = 3;
  private readonly DEFAULT_RATE_LIMIT = 500; // ms between requests

  constructor(
    naverProductService: NaverProductService,
    naverOrderService: NaverOrderService,
    shopifyBulkService: ShopifyBulkService,
    shopifyGraphQLService: ShopifyGraphQLService,
    redis: Redis
  ) {
    super();
    this.naverProductService = naverProductService;
    this.naverOrderService = naverOrderService;
    this.shopifyBulkService = shopifyBulkService;
    this.shopifyGraphQLService = shopifyGraphQLService; // Used by PriceSyncService
    this.redis = redis;
    
    // Initialize dependent services with proper dependencies
    this.priceSyncService = new PriceSyncService(
      redis,
      naverProductService,
      shopifyGraphQLService
    );
    
    this.inventorySyncService = new InventorySyncService(
      naverProductService,
      shopifyBulkService
    );
  }

  /**
   * 전체 동기화 실행
   */
  async performFullSync(options: SyncOptions = {}): Promise<SyncResult> {
    if (this.isSyncing) {
      throw new AppError('Sync already in progress', 409);
    }

    const {
      batchSize = this.DEFAULT_BATCH_SIZE,
      retryAttempts = this.DEFAULT_RETRY_ATTEMPTS,
      rateLimit = this.DEFAULT_RATE_LIMIT,
      vendor = 'album'
    } = options;

    this.isSyncing = true;
    const startTime = Date.now();
    const result: SyncResult = {
      success: false,
      totalItems: 0,
      successCount: 0,
      failureCount: 0,
      errors: [],
      duration: 0,
    };

    try {
      logger.info('Starting full sync', { vendor, batchSize });
      this.emit('sync:start', { vendor, startTime });

      // 활성 매핑 조회
      const mappings = await ProductMapping.find({
        vendor,
        isActive: true,
      }).lean();

      result.totalItems = mappings.length;
      logger.info(`Found ${mappings.length} active mappings to sync`);

      // 배치 처리
      const batches = this.createBatches(mappings, batchSize);
      
      for (const [batchIndex, batch] of batches.entries()) {
        logger.info(`Processing batch ${batchIndex + 1} of ${batches.length}`);
        
        try {
          await this.processBatch(batch, result, { retryAttempts, rateLimit });
        } catch (error) {
          logger.error(`Batch ${batchIndex + 1} processing failed`, error);
          // Continue with next batch instead of failing entire sync
        }
      }

      // 네이버 주문 동기화
      await this.syncNaverOrders();

      result.success = result.successCount > 0;
      logger.info('Full sync completed', {
        successCount: result.successCount,
        failureCount: result.failureCount,
        duration: Date.now() - startTime
      });
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Full sync failed', { error: errorMessage });
      
      await SystemLog.create({
        level: 'error',
        category: 'sync',
        message: 'Full sync failed',
        error: {
          name: error instanceof Error ? error.name : 'Unknown',
          message: errorMessage,
          stack: error instanceof Error ? error.stack : undefined,
        },
      });
    } finally {
      this.isSyncing = false;
      result.duration = Date.now() - startTime;
      this.emit('sync:complete', result);
    }

    return result;
  }

  /**
   * 배치 처리
   */
  private async processBatch(
    batch: any[],
    result: SyncResult,
    options: { retryAttempts: number; rateLimit: number }
  ): Promise<void> {
    const syncData: Array<{
      mapping: any;
      naverProduct: any;
      price: number;
      quantity: number;
    }> = [];

    // 네이버 상품 정보 조회 및 가격 계산
    for (const mapping of batch) {
      try {
        const naverProduct = await this.fetchNaverProductWithRetry(
          mapping.naverProductId,
          options.retryAttempts
        );

        if (!naverProduct) {
          throw new Error('Naver product not found');
        }

        // 가격 계산 - PriceSyncService의 올바른 메서드 사용
        const priceResult = await this.priceSyncService.applyPriceSyncRules(
          mapping.sku,
          {
            mode: 'auto',
            margin: mapping.priceMargin || 1.15,
            exchangeRateSource: 'api',
            roundingStrategy: 'nearest'
          }
        );

        syncData.push({
          mapping,
          naverProduct,
          price: priceResult.shopifyPrice,
          quantity: naverProduct.stockQuantity,
        });

        // Rate limiting
        await this.delay(options.rateLimit);
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`Failed to fetch Naver product: ${mapping.sku}`, { error: errorMessage });
        
        result.errors.push({
          sku: mapping.sku,
          error: errorMessage,
        });
        result.failureCount++;
      }
    }

    // Shopify 벌크 업데이트
    if (syncData.length > 0) {
      await this.updateShopifyProducts(syncData, result);
    }
  }

  /**
   * Shopify 상품 업데이트
   */
  private async updateShopifyProducts(
    syncData: Array<{
      mapping: any;
      naverProduct: any;
      price: number;
      quantity: number;
    }>,
    result: SyncResult
  ): Promise<void> {
    try {
      logger.info(`Updating ${syncData.length} items in Shopify`);
      
      await this.shopifyBulkService.fullSync(
        syncData.map(item => ({
          sku: item.mapping.sku,
          price: item.price,
          quantity: item.quantity,
        }))
      );

      // 동기화 상태 업데이트 및 이력 저장
      for (const item of syncData) {
        await this.updateSyncStatus(item);
        result.successCount++;
      }
    } catch (error) {
      logger.error('Failed to update Shopify products', error);
      throw error;
    }
  }

  /**
   * 동기화 상태 업데이트
   */
  private async updateSyncStatus(item: {
    mapping: any;
    naverProduct: any;
    price: number;
    quantity: number;
  }): Promise<void> {
    // 매핑 상태 업데이트
    await ProductMapping.findByIdAndUpdate(item.mapping._id, {
      lastSyncedAt: new Date(),
      syncStatus: 'synced',
      syncError: null,
    });

    // 가격 이력 저장
    await PriceHistory.create({
      sku: item.mapping.sku,
      naverPrice: item.naverProduct.salePrice,
      exchangeRate: await this.priceSyncService.getCurrentExchangeRate(),
      calculatedShopifyPrice: item.price,
      finalShopifyPrice: item.price,
      priceMargin: item.mapping.priceMargin,
      syncStatus: 'completed',
      syncedAt: new Date(),
    });

    // 재고 트랜잭션 기록
    await InventoryTransaction.create({
      sku: item.mapping.sku,
      platform: 'shopify',
      transactionType: 'sync',
      quantity: item.quantity,
      previousQuantity: 0, // TODO: 이전 값 조회 로직 추가
      newQuantity: item.quantity,
      performedBy: 'system',
      syncStatus: 'completed',
      syncedAt: new Date(),
    });
  }

  /**
   * 네이버 주문 동기화
   */
  private async syncNaverOrders(): Promise<void> {
    try {
      const lastSyncTime = await this.redis.get('sync:lastNaverOrderSync');
      const since = lastSyncTime 
        ? new Date(lastSyncTime) 
        : new Date(Date.now() - 24 * 60 * 60 * 1000); // 24시간 전

      const orders = await this.naverOrderService.getRecentPaidOrders(since);
      logger.info(`Found ${orders.length} new Naver orders to sync`);

      for (const order of orders) {
        try {
          // 이미 처리된 주문인지 확인
          const existing = await OrderSyncStatus.findOne({ orderId: order.orderId });
          if (existing) continue;

          // 주문 처리
          await this.processNaverOrder(order);
        } catch (error) {
          logger.error(`Failed to sync Naver order: ${order.orderId}`, error);
        }
      }

      // 마지막 동기화 시간 업데이트
      await this.redis.set('sync:lastNaverOrderSync', new Date().toISOString());
    } catch (error) {
      logger.error('Failed to sync Naver orders', error);
    }
  }

  /**
   * 네이버 주문 처리
   */
  private async processNaverOrder(order: any): Promise<void> {
    const orderSync = await OrderSyncStatus.create({
      orderId: order.orderId,
      platform: 'naver',
      orderNumber: order.orderNo,
      orderDate: new Date(order.paymentDate),
      syncStatus: 'processing',
      items: order.orderItems.map((item: any) => ({
        sku: item.sellerProductCode,
        quantity: item.quantity,
        syncStatus: 'pending',
      })),
    });

    try {
      // 각 아이템의 재고 차감
      for (const item of order.orderItems) {
        await this.inventorySyncService.syncInventoryFromNaverSale(
          item.sellerProductCode,
          item.quantity,
          order.orderId
        );

        // 아이템 상태 업데이트
        await OrderSyncStatus.updateOne(
          { _id: orderSync._id, 'items.sku': item.sellerProductCode },
          { $set: { 'items.$.syncStatus': 'completed' } }
        );
      }

      // 주문 상태 완료
      orderSync.syncStatus = 'completed';
      orderSync.completedAt = new Date();
      await orderSync.save();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      orderSync.syncStatus = 'failed';
      orderSync.errorMessage = errorMessage;
      await orderSync.save();
      throw error;
    }
  }

  /**
   * 개별 SKU 동기화
   */
  async syncSingleSku(sku: string): Promise<void> {
    const mapping = await ProductMapping.findOne({ sku, isActive: true });
    if (!mapping) {
      throw new AppError(`Active mapping not found for SKU: ${sku}`, 404);
    }

    const naverProduct = await this.naverProductService.getProduct(mapping.naverProductId);
    
    // 가격 계산
    const priceResult = await this.priceSyncService.applyPriceSyncRules(
      sku,
      {
        mode: 'manual',
        margin: mapping.priceMargin || 1.15,
        exchangeRateSource: 'api',
        roundingStrategy: 'nearest'
      }
    );

    // Shopify 업데이트
    await this.shopifyBulkService.fullSync([{
      sku: mapping.sku,
      price: priceResult.shopifyPrice,
      quantity: naverProduct.stockQuantity,
    }]);

    // 동기화 상태 업데이트
    await this.updateSyncStatus({
      mapping,
      naverProduct,
      price: priceResult.shopifyPrice,
      quantity: naverProduct.stockQuantity,
    });
  }

  /**
   * 동기화 상태 조회
   */
  async getSyncStatus(): Promise<{
    isSyncing: boolean;
    lastSync?: Date;
    nextSync?: Date;
  }> {
    const lastSyncTime = await this.redis.get('sync:lastFullSync');
    const nextSyncTime = await this.redis.get('sync:nextFullSync');

    return {
      isSyncing: this.isSyncing,
      lastSync: lastSyncTime ? new Date(lastSyncTime) : undefined,
      nextSync: nextSyncTime ? new Date(nextSyncTime) : undefined,
    };
  }

  /**
   * 네이버 상품 조회 with retry
   */
  private async fetchNaverProductWithRetry(
    productId: string,
    maxRetries: number
  ): Promise<any> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.naverProductService.getProduct(productId);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        logger.warn(`Attempt ${attempt} failed for product ${productId}`, { error: lastError.message });
        
        if (attempt < maxRetries) {
          await this.delay(Math.pow(2, attempt) * 1000); // Exponential backoff
        }
      }
    }

    throw lastError || new Error('Failed to fetch product after retries');
  }

  /**
   * 배치 생성
   */
  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * 지연 함수
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}