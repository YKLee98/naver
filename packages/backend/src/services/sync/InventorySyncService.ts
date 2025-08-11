// packages/backend/src/services/sync/InventorySyncService.ts
import { NaverProductService } from '@/services/naver';
import { ShopifyBulkService, ShopifyGraphQLService } from '@/services/shopify';
import { ProductMapping, InventoryTransaction } from '@/models';
import { logger } from '@/utils/logger';

export class InventorySyncService {
  private naverProductService: NaverProductService;
  private shopifyBulkService: ShopifyBulkService;
  private shopifyGraphQLService: ShopifyGraphQLService;

  constructor(
    naverProductService: NaverProductService,
    shopifyBulkService: ShopifyBulkService
  ) {
    this.naverProductService = naverProductService;
    this.shopifyBulkService = shopifyBulkService;
    this.shopifyGraphQLService = new ShopifyGraphQLService();
  }

  /**
   * 네이버 판매로 인한 재고 동기화
   */
  async syncInventoryFromNaverSale(
    sku: string,
    quantity: number,
    orderId: string
  ): Promise<void> {
    const mapping = await ProductMapping.findOne({ sku, isActive: true });
    if (!mapping) {
      throw new Error(`Mapping not found for SKU: ${sku}`);
    }

    // 멱등성 체크
    const existing = await InventoryTransaction.findOne({
      orderId,
      orderLineItemId: sku,
      transactionType: 'sale',
    });

    if (existing) {
      logger.warn(`Transaction already processed: ${orderId}/${sku}`);
      return;
    }

    try {
      // Shopify 재고 차감
      await this.shopifyGraphQLService.adjustInventoryQuantity(
        mapping.shopifyInventoryItemId,
        mapping.shopifyLocationId,
        -quantity,
        `Naver order ${orderId}`
      );

      // 트랜잭션 기록
      await InventoryTransaction.create({
        sku,
        platform: 'naver',
        transactionType: 'sale',
        quantity: -quantity,
        previousQuantity: 0, // TODO: 이전 값 조회
        newQuantity: 0, // TODO: 새 값 계산
        orderId,
        orderLineItemId: sku,
        performedBy: 'system',
        syncStatus: 'completed',
        syncedAt: new Date(),
      });

      logger.info(`Inventory synced for Naver sale: ${sku} (-${quantity})`);
    } catch (error) {
      logger.error(`Failed to sync inventory for Naver sale: ${sku}`, error);

      // 실패 트랜잭션 기록
      await InventoryTransaction.create({
        sku,
        platform: 'naver',
        transactionType: 'sale',
        quantity: -quantity,
        previousQuantity: 0,
        newQuantity: 0,
        orderId,
        orderLineItemId: sku,
        performedBy: 'system',
        syncStatus: 'failed',
        errorMessage: error.message,
      });

      throw error;
    }
  }

  /**
   * Shopify 판매로 인한 재고 동기화
   */
  async syncInventoryFromShopifySale(
    variantId: string,
    quantity: number,
    orderId: string
  ): Promise<void> {
    // Variant로 매핑 조회
    const mapping = await ProductMapping.findOne({
      shopifyVariantId: variantId,
      isActive: true,
    });

    if (!mapping) {
      logger.warn(`Mapping not found for variant: ${variantId}`);
      return;
    }

    // 멱등성 체크
    const existing = await InventoryTransaction.findOne({
      orderId,
      orderLineItemId: variantId,
      transactionType: 'sale',
    });

    if (existing) {
      logger.warn(`Transaction already processed: ${orderId}/${variantId}`);
      return;
    }

    try {
      // 네이버 재고 차감
      await this.naverProductService.updateStock(
        mapping.naverProductId,
        quantity,
        'SUBTRACT'
      );

      // 트랜잭션 기록
      await InventoryTransaction.create({
        sku: mapping.sku,
        platform: 'shopify',
        transactionType: 'sale',
        quantity: -quantity,
        previousQuantity: 0, // TODO: 이전 값 조회
        newQuantity: 0, // TODO: 새 값 계산
        orderId,
        orderLineItemId: variantId,
        performedBy: 'webhook',
        syncStatus: 'completed',
        syncedAt: new Date(),
      });

      logger.info(
        `Inventory synced for Shopify sale: ${mapping.sku} (-${quantity})`
      );
    } catch (error) {
      logger.error(
        `Failed to sync inventory for Shopify sale: ${mapping.sku}`,
        error
      );

      // 실패 트랜잭션 기록
      await InventoryTransaction.create({
        sku: mapping.sku,
        platform: 'shopify',
        transactionType: 'sale',
        quantity: -quantity,
        previousQuantity: 0,
        newQuantity: 0,
        orderId,
        orderLineItemId: variantId,
        performedBy: 'webhook',
        syncStatus: 'failed',
        errorMessage: error.message,
      });

      throw error;
    }
  }

  /**
   * 재고 조정
   */
  async adjustInventory(
    sku: string,
    adjustment: number,
    reason: string,
    platform: 'naver' | 'shopify' = 'naver'
  ): Promise<void> {
    const mapping = await ProductMapping.findOne({ sku, isActive: true });
    if (!mapping) {
      throw new Error(`Mapping not found for SKU: ${sku}`);
    }

    if (platform === 'naver') {
      // 네이버 재고 조정 후 Shopify 동기화
      await this.naverProductService.updateStock(
        mapping.naverProductId,
        Math.abs(adjustment),
        adjustment > 0 ? 'ADD' : 'SUBTRACT'
      );

      // Shopify도 동기화
      await this.shopifyGraphQLService.adjustInventoryQuantity(
        mapping.shopifyInventoryItemId,
        mapping.shopifyLocationId,
        adjustment,
        reason
      );
    } else {
      // Shopify 재고 조정 후 네이버 동기화
      await this.shopifyGraphQLService.adjustInventoryQuantity(
        mapping.shopifyInventoryItemId,
        mapping.shopifyLocationId,
        adjustment,
        reason
      );

      // 네이버도 동기화
      await this.naverProductService.updateStock(
        mapping.naverProductId,
        Math.abs(adjustment),
        adjustment > 0 ? 'ADD' : 'SUBTRACT'
      );
    }

    // 트랜잭션 기록
    await InventoryTransaction.create({
      sku,
      platform,
      transactionType: 'adjustment',
      quantity: adjustment,
      previousQuantity: 0, // TODO: 이전 값 조회
      newQuantity: 0, // TODO: 새 값 계산
      reason,
      performedBy: 'manual',
      syncStatus: 'completed',
      syncedAt: new Date(),
    });

    logger.info(
      `Inventory adjusted: ${sku} (${adjustment > 0 ? '+' : ''}${adjustment})`
    );
  }

  /**
   * 재고 트랜잭션 이력 조회
   */
  async getInventoryHistory(sku: string, limit = 100): Promise<any[]> {
    return InventoryTransaction.find({ sku })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
  }
}
