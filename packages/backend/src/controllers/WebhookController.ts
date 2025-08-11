// packages/backend/src/controllers/WebhookController.ts
import { Request, Response, NextFunction } from 'express';
import { InventorySyncService } from '../services/sync';
import { InventoryTransaction, ProductMapping } from '../models';
import { logger } from '../utils/logger';
import { getRedisClient } from '../config/redis';

interface ShopifyOrder {
  id: number;
  name: string;
  email?: string;
  created_at: string;
  updated_at: string;
  cancelled_at?: string;
  financial_status: string;
  fulfillment_status: string;
  total_price: string;
  currency: string;
  line_items: Array<{
    id: number;
    variant_id: number;
    product_id: number;
    title: string;
    variant_title?: string;
    sku?: string;
    quantity: number;
    price: string;
    vendor?: string;
  }>;
  customer?: {
    id: number;
    email?: string;
    first_name?: string;
    last_name?: string;
  };
  shipping_address?: {
    address1?: string;
    address2?: string;
    city?: string;
    province?: string;
    country?: string;
    zip?: string;
  };
}

interface ShopifyInventoryLevel {
  inventory_item_id: number;
  location_id: number;
  available: number;
  updated_at: string;
}

interface OrderSyncRecord {
  orderId: string;
  platform: 'shopify';
  orderNumber: string;
  orderDate: Date;
  syncStatus: 'pending' | 'processing' | 'completed' | 'failed';
  items: Array<{
    sku: string;
    quantity: number;
    status: 'pending' | 'completed' | 'failed';
    error?: string;
  }>;
  processedAt?: Date;
  error?: string;
}

export class WebhookController {
  private inventorySyncService: InventorySyncService;

  constructor(inventorySyncService: InventorySyncService) {
    this.inventorySyncService = inventorySyncService;
  }

  /**
   * Shopify 주문 결제 웹훅
   */
  handleOrdersPaid = async (
    req: Request,
    res: Response,
    _next: NextFunction
  ): Promise<void> => {
    try {
      const order: ShopifyOrder = req.body;
      const webhookId = req.headers['x-shopify-webhook-id'] as string;

      logger.info(`Processing Shopify order webhook: ${order.name}`, {
        webhookId,
        orderId: order.id,
        itemCount: order.line_items.length,
      });

      // 멱등성 체크
      const redis = getRedisClient();
      const processed = await redis.get(`webhook:${webhookId}`);

      if (processed) {
        logger.info(`Webhook already processed: ${webhookId}`);
        res.status(200).send('OK');
        return;
      }

      // 주문 처리
      const syncRecord = await this.processShopifyOrder(order);

      // 처리 완료 표시 (24시간 TTL)
      await redis.setex(
        `webhook:${webhookId}`,
        86400,
        JSON.stringify({
          processedAt: new Date(),
          orderId: order.id,
          syncStatus: syncRecord.syncStatus,
        })
      );

      logger.info(`Order webhook processed successfully: ${order.name}`, {
        syncStatus: syncRecord.syncStatus,
        processedItems: syncRecord.items.filter((i) => i.status === 'completed')
          .length,
        failedItems: syncRecord.items.filter((i) => i.status === 'failed')
          .length,
      });

      res.status(200).send('OK');
    } catch (error) {
      logger.error('Failed to process order webhook:', error);
      // Always return 200 to prevent Shopify retries
      res.status(200).send('OK');
    }
  };

  /**
   * Shopify 주문 취소 웹훅
   */
  handleOrdersCancelled = async (
    req: Request,
    res: Response,
    _next: NextFunction
  ): Promise<void> => {
    try {
      const order: ShopifyOrder = req.body;
      const webhookId = req.headers['x-shopify-webhook-id'] as string;

      logger.info(
        `Processing Shopify order cancellation webhook: ${order.name}`,
        {
          webhookId,
          orderId: order.id,
        }
      );

      // 멱등성 체크
      const redis = getRedisClient();
      const processed = await redis.get(`webhook:${webhookId}`);

      if (processed) {
        logger.info(`Cancellation webhook already processed: ${webhookId}`);
        res.status(200).send('OK');
        return;
      }

      // 주문 취소 처리
      await this.processOrderCancellation(order);

      await redis.setex(
        `webhook:${webhookId}`,
        86400,
        JSON.stringify({
          processedAt: new Date(),
          orderId: order.id,
          action: 'cancelled',
        })
      );

      logger.info(`Order cancellation processed successfully: ${order.name}`);

      res.status(200).send('OK');
    } catch (error) {
      logger.error('Failed to process cancellation webhook:', error);
      res.status(200).send('OK');
    }
  };

  /**
   * Shopify 재고 업데이트 웹훅
   */
  handleInventoryUpdate = async (
    req: Request,
    res: Response,
    _next: NextFunction
  ): Promise<void> => {
    try {
      const inventoryLevel: ShopifyInventoryLevel = req.body;
      const webhookId = req.headers['x-shopify-webhook-id'] as string;

      logger.info('Inventory update webhook received:', {
        webhookId,
        inventoryItemId: inventoryLevel.inventory_item_id,
        locationId: inventoryLevel.location_id,
        available: inventoryLevel.available,
      });

      // 멱등성 체크
      const redis = getRedisClient();
      const processed = await redis.get(`webhook:${webhookId}`);

      if (processed) {
        logger.info(`Inventory webhook already processed: ${webhookId}`);
        res.status(200).send('OK');
        return;
      }

      // 재고 업데이트 처리
      await this.processInventoryUpdate(inventoryLevel);

      await redis.setex(
        `webhook:${webhookId}`,
        86400,
        JSON.stringify({
          processedAt: new Date(),
          inventoryItemId: inventoryLevel.inventory_item_id,
          available: inventoryLevel.available,
        })
      );

      res.status(200).send('OK');
    } catch (error) {
      logger.error('Failed to process inventory webhook:', error);
      res.status(200).send('OK');
    }
  };

  /**
   * Shopify 주문 처리
   */
  private async processShopifyOrder(
    order: ShopifyOrder
  ): Promise<OrderSyncRecord> {
    const syncRecord: OrderSyncRecord = {
      orderId: order.id.toString(),
      platform: 'shopify',
      orderNumber: order.name,
      orderDate: new Date(order.created_at),
      syncStatus: 'processing',
      items: [],
    };

    try {
      // Redis에 주문 처리 상태 저장
      const redis = getRedisClient();
      await redis.setex(
        `order:sync:${order.id}`,
        3600,
        JSON.stringify(syncRecord)
      );

      // 각 라인 아이템 처리
      for (const item of order.line_items) {
        const itemRecord = {
          sku: item.sku || '',
          quantity: item.quantity,
          status: 'pending' as 'pending' | 'completed' | 'failed',
          error: undefined as string | undefined,
        };

        syncRecord.items.push(itemRecord);

        try {
          if (!item.sku) {
            throw new Error('SKU not found for line item');
          }

          if (item.variant_id && item.quantity > 0) {
            // SKU로 매핑 조회
            const mapping = await ProductMapping.findOne({
              shopifyVariantId: item.variant_id.toString(),
              isActive: true,
            });

            if (!mapping) {
              throw new Error(
                `No active mapping found for variant ${item.variant_id}`
              );
            }

            // 재고 동기화 실행
            await this.inventorySyncService.syncInventoryFromShopifySale(
              item.variant_id.toString(),
              item.quantity,
              order.id.toString()
            );

            itemRecord.status = 'completed';

            logger.info(`Inventory synced for item: ${item.sku}`, {
              orderId: order.id,
              quantity: item.quantity,
              variantId: item.variant_id,
            });
          }
        } catch (itemError) {
          itemRecord.status = 'failed';
          itemRecord.error =
            itemError instanceof Error ? itemError.message : 'Unknown error';

          logger.error(`Failed to sync inventory for item: ${item.sku}`, {
            orderId: order.id,
            error: itemError,
          });
        }
      }

      // 전체 동기화 상태 업데이트
      const failedItems = syncRecord.items.filter((i) => i.status === 'failed');
      syncRecord.syncStatus =
        failedItems.length === 0
          ? 'completed'
          : failedItems.length === syncRecord.items.length
            ? 'failed'
            : 'completed';
      syncRecord.processedAt = new Date();

      // Redis 상태 업데이트
      await redis.setex(
        `order:sync:${order.id}`,
        86400,
        JSON.stringify(syncRecord)
      );

      return syncRecord;
    } catch (error) {
      syncRecord.syncStatus = 'failed';
      syncRecord.error =
        error instanceof Error ? error.message : 'Unknown error';

      logger.error(`Order processing failed: ${order.name}`, error);
      throw error;
    }
  }

  /**
   * 주문 취소 처리
   */
  private async processOrderCancellation(order: ShopifyOrder): Promise<void> {
    const redis = getRedisClient();

    // 이전 동기화 기록 확인
    const previousSync = await redis.get(`order:sync:${order.id}`);
    if (!previousSync) {
      logger.warn(
        `No previous sync record found for cancelled order: ${order.name}`
      );
      return;
    }

    const syncRecord: OrderSyncRecord = JSON.parse(previousSync);

    // 재고 복원 처리
    for (const item of syncRecord.items) {
      if (item.status === 'completed' && item.quantity > 0) {
        try {
          const mapping = await ProductMapping.findOne({
            sku: item.sku,
            isActive: true,
          });

          if (mapping) {
            // 재고 복원 (양수로 조정)
            await this.inventorySyncService.adjustInventory(
              item.sku,
              item.quantity,
              `Order cancelled: ${order.name}`,
              'shopify'
            );

            logger.info(
              `Inventory restored for cancelled order item: ${item.sku}`,
              {
                orderId: order.id,
                quantity: item.quantity,
              }
            );
          }
        } catch (error) {
          logger.error(
            `Failed to restore inventory for item: ${item.sku}`,
            error
          );
        }
      }
    }

    // 취소 기록 저장
    await redis.setex(
      `order:cancelled:${order.id}`,
      86400 * 7, // 7일 보관
      JSON.stringify({
        cancelledAt: new Date(),
        originalSync: syncRecord,
      })
    );
  }

  /**
   * 재고 업데이트 처리
   */
  private async processInventoryUpdate(
    inventoryLevel: ShopifyInventoryLevel
  ): Promise<void> {
    try {
      // inventory_item_id로 매핑 조회
      const mapping = await ProductMapping.findOne({
        shopifyInventoryItemId: inventoryLevel.inventory_item_id.toString(),
        shopifyLocationId: inventoryLevel.location_id.toString(),
        isActive: true,
      });

      if (!mapping) {
        logger.warn(`No mapping found for inventory update`, {
          inventoryItemId: inventoryLevel.inventory_item_id,
          locationId: inventoryLevel.location_id,
        });
        return;
      }

      // 재고 트랜잭션 기록
      await InventoryTransaction.create({
        sku: mapping.sku,
        platform: 'shopify',
        transactionType: 'sync',
        quantity: 0, // 변경량은 별도 계산 필요
        previousQuantity: 0, // 이전 값은 별도 조회 필요
        newQuantity: inventoryLevel.available,
        reason: 'Shopify inventory level update webhook',
        performedBy: 'webhook',
        syncStatus: 'completed',
        syncedAt: new Date(),
        metadata: {
          inventoryItemId: inventoryLevel.inventory_item_id,
          locationId: inventoryLevel.location_id,
          updatedAt: inventoryLevel.updated_at,
        },
      });

      logger.info(`Inventory level updated for SKU: ${mapping.sku}`, {
        available: inventoryLevel.available,
        inventoryItemId: inventoryLevel.inventory_item_id,
      });
    } catch (error) {
      logger.error('Failed to process inventory update:', error);
      throw error;
    }
  }
}
