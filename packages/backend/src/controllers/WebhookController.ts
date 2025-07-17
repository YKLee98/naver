// packages/backend/src/controllers/WebhookController.ts
import { Request, Response, NextFunction } from 'express';
import { InventorySyncService } from '../services/sync';
import { OrderSyncStatus } from '../models';
import { logger } from '../utils/logger';
import { getRedisClient } from '../config/redis';

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
    next: NextFunction
  ): Promise<void> => {
    try {
      const order = req.body;
      const webhookId = req.headers['x-shopify-webhook-id'] as string;

      // 멱등성 체크
      const redis = getRedisClient();
      const processed = await redis.get(`webhook:${webhookId}`);
      
      if (processed) {
        logger.info(`Webhook already processed: ${webhookId}`);
        res.status(200).send('OK');
        return;
      }

      // 주문 처리
      await this.processShopifyOrder(order);

      // 처리 완료 표시 (24시간 TTL)
      await redis.setex(`webhook:${webhookId}`, 86400, 'processed');

      res.status(200).send('OK');
    } catch (error) {
      logger.error('Failed to process order webhook:', error);
      res.status(200).send('OK'); // Always return 200 to prevent retries
    }
  };

  /**
   * Shopify 주문 취소 웹훅
   */
  handleOrdersCancelled = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const order = req.body;
      const webhookId = req.headers['x-shopify-webhook-id'] as string;

      // 멱등성 체크
      const redis = getRedisClient();
      const processed = await redis.get(`webhook:${webhookId}`);
      
      if (processed) {
        logger.info(`Webhook already processed: ${webhookId}`);
        res.status(200).send('OK');
        return;
      }

      // TODO: 주문 취소 처리 로직

      await redis.setex(`webhook:${webhookId}`, 86400, 'processed');
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
    next: NextFunction
  ): Promise<void> => {
    try {
      const inventoryLevel = req.body;
      
      logger.info('Inventory update webhook received:', inventoryLevel);
      
      // TODO: 재고 업데이트 처리 로직

      res.status(200).send('OK');
    } catch (error) {
      logger.error('Failed to process inventory webhook:', error);
      res.status(200).send('OK');
    }
  };

  /**
   * Shopify 주문 처리
   */
  private async processShopifyOrder(order: any): Promise<void> {
    const orderSync = await OrderSyncStatus.create({
      orderId: order.id.toString(),
      platform: 'shopify',
      orderNumber: order.name,
      orderDate: new Date(order.created_at),
      syncStatus: 'processing',
      items: order.line_items.map((item: any) => ({
        sku: item.sku,
        quantity: item.quantity,
        syncStatus: 'pending',
      })),
      metadata: {
        customerInfo: {
          email: order.email,
          name: `${order.customer?.first_name} ${order.customer?.last_name}`,
        },
        paymentInfo: {
          total: order.total_price,
          currency: order.currency,
        },
      },
    });

    try {
      // 각 라인 아이템 처리
      for (const item of order.line_items) {
        if (item.variant_id && item.quantity > 0) {
          await this.inventorySyncService.syncInventoryFromShopifySale(
            item.variant_id.toString(),
            item.quantity,
            order.id.toString()
          );

          // 아이템 상태 업데이트
          await OrderSyncStatus.updateOne(
            { _id: orderSync._id, 'items.sku': item.sku },
            { $set: { 'items.$.syncStatus': 'completed' } }
          );
        }
      }

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
}
