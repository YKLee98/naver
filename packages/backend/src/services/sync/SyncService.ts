// packages/backend/src/services/sync/SyncService.ts
import { Redis } from 'ioredis';
import { 
  ProductMapping, 
  InventoryTransaction, 
  PriceHistory,
  OrderSyncStatus,
  SystemLog 
} from '@/models';
import { NaverProductService, NaverOrderService } from '@/services/naver';
import { ShopifyBulkService } from '@/services/shopify';
import { PriceSyncService } from './PriceSyncService';
import { InventorySyncService } from './InventorySyncService';
import { logger } from '@/utils/logger';
import { EventEmitter } from 'events';

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

export class SyncService extends EventEmitter {
  private naverProductService: NaverProductService;
  private naverOrderService: NaverOrderService;
  private shopifyBulkService: ShopifyBulkService;
  private priceSyncService: PriceSyncService;
  private inventorySyncService: InventorySyncService;
  private redis: Redis;
  private isSyncing: boolean = false;

  constructor(
    naverProductService: NaverProductService,
    naverOrderService: NaverOrderService,
    shopifyBulkService: ShopifyBulkService,
    redis: Redis
  ) {
    super();
    this.naverProductService = naverProductService;
    this.naverOrderService = naverOrderService;
    this.shopifyBulkService = shopifyBulkService;
    this.redis = redis;
    
    this.priceSyncService = new PriceSyncService(redis);
    this.inventorySyncService = new InventorySyncService(
      naverProductService,
      shopifyBulkService
    );
  }

  /**
   * 전체 동기화 실행
   */
  async performFullSync(): Promise<SyncResult> {
    if (this.isSyncing) {
      throw new Error('Sync already in progress');
    }

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
      logger.info('Starting full sync');
      this.emit('sync:start');

      // 활성 매핑 조회
      const mappings = await ProductMapping.find({
        vendor: 'album',
        isActive: true,
      });

      result.totalItems = mappings.length;
      logger.info(`Found ${mappings.length} active mappings to sync`);

      // 배치 처리를 위한 데이터 준비
      const syncData: Array<{
        mapping: any;
        naverProduct: any;
        price: number;
        quantity: number;
      }> = [];

      // 네이버 상품 정보 조회
      for (const mapping of mappings) {
        try {
          const naverProduct = await this.naverProductService.getProduct(
            mapping.naverProductId
          );

          if (!naverProduct) {
            throw new Error('Naver product not found');
          }

          // 가격 계산
          const price = await this.priceSyncService.calculateShopifyPrice(
            naverProduct.salePrice,
            mapping.priceMargin
          );

          syncData.push({
            mapping,
            naverProduct,
            price,
            quantity: naverProduct.stockQuantity,
          });

          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
          logger.error(`Failed to fetch Naver product: ${mapping.sku}`, error);
          result.errors.push({
            sku: mapping.sku,
            error: error.message,
          });
          result.failureCount++;
        }
      }

      // Shopify 벌크 업데이트
      if (syncData.length > 0) {
        logger.info(`Updating ${syncData.length} items in Shopify`);
        
        await this.shopifyBulkService.fullSync(
          syncData.map(item => ({
            sku: item.mapping.sku,
            price: item.price,
            quantity: item.quantity,
          }))
        );

        // 동기화 상태 업데이트
        for (const item of syncData) {
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
            previousQuantity: 0, // TODO: 이전 값 조회
            newQuantity: item.quantity,
            performedBy: 'system',
            syncStatus: 'completed',
            syncedAt: new Date(),
          });

          result.successCount++;
        }
      }

      // 네이버 주문 동기화
      await this.syncNaverOrders();

      result.success = true;
      logger.info('Full sync completed successfully');
    } catch (error) {
      logger.error('Full sync failed', error);
      await SystemLog.create({
        level: 'error',
        category: 'sync',
        message: 'Full sync failed',
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
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
      orderSync.syncStatus = 'failed';
      orderSync.errorMessage = error.message;
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
      throw new Error(`Active mapping not found for SKU: ${sku}`);
    }

    const naverProduct = await this.naverProductService.getProduct(mapping.naverProductId);
    const price = await this.priceSyncService.calculateShopifyPrice(
      naverProduct.salePrice,
      mapping.priceMargin
    );

    await this.shopifyBulkService.fullSync([{
      sku: mapping.sku,
      price,
      quantity: naverProduct.stockQuantity,
    }]);

    mapping.lastSyncedAt = new Date();
    mapping.syncStatus = 'synced';
    await mapping.save();

    logger.info(`Single SKU sync completed: ${sku}`);
  }

  /**
   * 동기화 상태 조회
   */
  async getSyncStatus(): Promise<{
    isRunning: boolean;
    lastSync: Date | null;
    statistics: {
      totalMappings: number;
      syncedMappings: number;
      pendingMappings: number;
      errorMappings: number;
    };
  }> {
    const [totalMappings, syncedMappings, pendingMappings, errorMappings] = await Promise.all([
      ProductMapping.countDocuments({ isActive: true }),
      ProductMapping.countDocuments({ isActive: true, syncStatus: 'synced' }),
      ProductMapping.countDocuments({ isActive: true, syncStatus: 'pending' }),
      ProductMapping.countDocuments({ isActive: true, syncStatus: 'error' }),
    ]);

    const lastSync = await ProductMapping.findOne({ isActive: true })
      .sort({ lastSyncedAt: -1 })
      .select('lastSyncedAt');

    return {
      isRunning: this.isSyncing,
      lastSync: lastSync?.lastSyncedAt || null,
      statistics: {
        totalMappings,
        syncedMappings,
        pendingMappings,
        errorMappings,
      },
    };
  }
}
