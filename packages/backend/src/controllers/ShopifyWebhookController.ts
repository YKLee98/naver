// packages/backend/src/controllers/ShopifyWebhookController.ts
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { SyncService } from '../services/sync/SyncService.js';
import { InventorySyncService } from '../services/sync/InventorySyncService.js';
import { NotificationService } from '../services/notification/NotificationService.js';
import { WebhookLog } from '../models/WebhookLog.js';
import { Activity } from '../models/Activity.js';
import { logger } from '../utils/logger.js';

export class ShopifyWebhookController {
  private syncService: SyncService;
  private inventorySyncService: InventorySyncService;
  private notificationService: NotificationService;
  private webhookSecret: string;

  constructor(
    syncService: SyncService,
    inventorySyncService: InventorySyncService,
    notificationService: NotificationService
  ) {
    this.syncService = syncService;
    this.inventorySyncService = inventorySyncService;
    this.notificationService = notificationService;
    this.webhookSecret = process.env.SHOPIFY_WEBHOOK_SECRET || '';
  }

  /**
   * Verify Shopify webhook signature
   */
  private verifyWebhookSignature(rawBody: string, signature: string): boolean {
    if (!this.webhookSecret) {
      logger.warn(
        'Shopify webhook secret not configured, skipping verification'
      );
      return true; // Skip verification in development
    }

    const hash = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(rawBody, 'utf8')
      .digest('base64');

    return hash === signature;
  }

  /**
   * Log webhook event
   */
  private async logWebhook(
    event: string,
    payload: any,
    headers: any,
    success: boolean,
    error?: string
  ): Promise<void> {
    try {
      await WebhookLog.create({
        source: 'shopify',
        event,
        payload,
        headers,
        processed: true,
        success,
        error,
        processingTime: Date.now(),
      });
    } catch (err) {
      logger.error('Failed to log webhook:', err);
    }
  }

  /**
   * Handle order creation
   * POST /webhooks/shopify/orders/create
   */
  async handleOrderCreate(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const startTime = Date.now();

    try {
      const signature = req.headers['x-shopify-hmac-sha256'] as string;
      const topic = req.headers['x-shopify-topic'] as string;
      const shopDomain = req.headers['x-shopify-shop-domain'] as string;

      logger.info('Shopify webhook received:', { topic, shopDomain });

      // Verify signature
      const rawBody = (req as any).rawBody || JSON.stringify(req.body);
      if (
        this.webhookSecret &&
        !this.verifyWebhookSignature(rawBody, signature)
      ) {
        logger.warn('Invalid Shopify webhook signature');
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const order = req.body;

      // Process order items for inventory sync
      const lineItems = order.line_items || [];
      const inventoryUpdates = [];

      for (const item of lineItems) {
        if (item.sku) {
          inventoryUpdates.push({
            sku: item.sku,
            quantity: item.quantity,
            platform: 'shopify' as const,
            type: 'order',
          });
        }
      }

      // Log activity
      await Activity.create({
        type: 'order',
        action: 'Order created via webhook',
        details: `Shopify order ${order.name} created`,
        metadata: {
          orderId: order.id,
          orderNumber: order.name,
          totalAmount: order.total_price,
          itemCount: lineItems.length,
        },
        success: true,
      });

      // Send notification
      await this.notificationService.send({
        type: 'info',
        title: '새 주문 접수',
        message: `Shopify 주문 ${order.name}이(가) 접수되었습니다. (${lineItems.length}개 상품)`,
        metadata: { orderId: order.id, orderNumber: order.name },
        channel: 'orders',
        priority: 'normal',
      });

      // Log webhook
      await this.logWebhook(
        'orders/create',
        order,
        req.headers,
        true,
        undefined
      );

      const processingTime = Date.now() - startTime;
      logger.info(`Order create webhook processed in ${processingTime}ms`);

      res.status(200).json({
        success: true,
        message: 'Order webhook processed',
        processingTime,
      });
    } catch (error) {
      logger.error('Order create webhook error:', error);

      await this.logWebhook(
        'orders/create',
        req.body,
        req.headers,
        false,
        (error as Error).message
      );

      next(error);
    }
  }

  /**
   * Handle order update
   * POST /webhooks/shopify/orders/update
   */
  async handleOrderUpdate(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const signature = req.headers['x-shopify-hmac-sha256'] as string;
      const rawBody = (req as any).rawBody || JSON.stringify(req.body);

      if (
        this.webhookSecret &&
        !this.verifyWebhookSignature(rawBody, signature)
      ) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const order = req.body;

      logger.info(`Shopify order updated: ${order.name}`);

      // Log activity
      await Activity.create({
        type: 'order',
        action: 'Order updated via webhook',
        details: `Shopify order ${order.name} updated`,
        metadata: { orderId: order.id, status: order.fulfillment_status },
        success: true,
      });

      await this.logWebhook('orders/update', order, req.headers, true);

      res.status(200).json({ success: true });
    } catch (error) {
      logger.error('Order update webhook error:', error);
      await this.logWebhook(
        'orders/update',
        req.body,
        req.headers,
        false,
        (error as Error).message
      );
      next(error);
    }
  }

  /**
   * Handle order cancellation
   * POST /webhooks/shopify/orders/cancel
   */
  async handleOrderCancel(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const signature = req.headers['x-shopify-hmac-sha256'] as string;
      const rawBody = (req as any).rawBody || JSON.stringify(req.body);

      if (
        this.webhookSecret &&
        !this.verifyWebhookSignature(rawBody, signature)
      ) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const order = req.body;

      logger.info(`Shopify order cancelled: ${order.name}`);

      // Restore inventory for cancelled items
      const lineItems = order.line_items || [];
      for (const item of lineItems) {
        if (item.sku) {
          // TODO: Implement inventory restoration logic
          logger.info(
            `Restoring inventory for SKU ${item.sku}, quantity: ${item.quantity}`
          );
        }
      }

      // Send notification
      await this.notificationService.send({
        type: 'warning',
        title: '주문 취소',
        message: `Shopify 주문 ${order.name}이(가) 취소되었습니다.`,
        metadata: { orderId: order.id, orderNumber: order.name },
        channel: 'orders',
        priority: 'high',
      });

      await this.logWebhook('orders/cancel', order, req.headers, true);

      res.status(200).json({ success: true });
    } catch (error) {
      logger.error('Order cancel webhook error:', error);
      await this.logWebhook(
        'orders/cancel',
        req.body,
        req.headers,
        false,
        (error as Error).message
      );
      next(error);
    }
  }

  /**
   * Handle product creation
   * POST /webhooks/shopify/products/create
   */
  async handleProductCreate(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const signature = req.headers['x-shopify-hmac-sha256'] as string;
      const rawBody = (req as any).rawBody || JSON.stringify(req.body);

      if (
        this.webhookSecret &&
        !this.verifyWebhookSignature(rawBody, signature)
      ) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const product = req.body;

      logger.info(`Shopify product created: ${product.title}`);

      // Log activity
      await Activity.create({
        type: 'mapping',
        action: 'Product created via webhook',
        details: `Shopify product "${product.title}" created`,
        metadata: {
          productId: product.id,
          title: product.title,
          vendor: product.vendor,
          variantCount: product.variants?.length || 0,
        },
        success: true,
      });

      // Send notification
      await this.notificationService.send({
        type: 'info',
        title: '새 상품 생성',
        message: `Shopify 상품 "${product.title}"이(가) 생성되었습니다.`,
        metadata: { productId: product.id },
        channel: 'products',
        priority: 'normal',
      });

      await this.logWebhook('products/create', product, req.headers, true);

      res.status(200).json({ success: true });
    } catch (error) {
      logger.error('Product create webhook error:', error);
      await this.logWebhook(
        'products/create',
        req.body,
        req.headers,
        false,
        (error as Error).message
      );
      next(error);
    }
  }

  /**
   * Handle product update
   * POST /webhooks/shopify/products/update
   */
  async handleProductUpdate(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const signature = req.headers['x-shopify-hmac-sha256'] as string;
      const rawBody = (req as any).rawBody || JSON.stringify(req.body);

      if (
        this.webhookSecret &&
        !this.verifyWebhookSignature(rawBody, signature)
      ) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const product = req.body;

      logger.info(`Shopify product updated: ${product.title}`);

      // Check if price or inventory changed
      // TODO: Compare with previous values and trigger sync if needed

      await Activity.create({
        type: 'mapping',
        action: 'Product updated via webhook',
        details: `Shopify product "${product.title}" updated`,
        metadata: { productId: product.id },
        success: true,
      });

      await this.logWebhook('products/update', product, req.headers, true);

      res.status(200).json({ success: true });
    } catch (error) {
      logger.error('Product update webhook error:', error);
      await this.logWebhook(
        'products/update',
        req.body,
        req.headers,
        false,
        (error as Error).message
      );
      next(error);
    }
  }

  /**
   * Handle product deletion
   * POST /webhooks/shopify/products/delete
   */
  async handleProductDelete(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const signature = req.headers['x-shopify-hmac-sha256'] as string;
      const rawBody = (req as any).rawBody || JSON.stringify(req.body);

      if (
        this.webhookSecret &&
        !this.verifyWebhookSignature(rawBody, signature)
      ) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const product = req.body;

      logger.info(`Shopify product deleted: ${product.id}`);

      // Send notification
      await this.notificationService.send({
        type: 'warning',
        title: '상품 삭제',
        message: `Shopify 상품이 삭제되었습니다. (ID: ${product.id})`,
        metadata: { productId: product.id },
        channel: 'products',
        priority: 'high',
      });

      await this.logWebhook('products/delete', product, req.headers, true);

      res.status(200).json({ success: true });
    } catch (error) {
      logger.error('Product delete webhook error:', error);
      await this.logWebhook(
        'products/delete',
        req.body,
        req.headers,
        false,
        (error as Error).message
      );
      next(error);
    }
  }

  /**
   * Handle inventory update
   * POST /webhooks/shopify/inventory/update
   */
  async handleInventoryUpdate(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const signature = req.headers['x-shopify-hmac-sha256'] as string;
      const rawBody = (req as any).rawBody || JSON.stringify(req.body);

      if (
        this.webhookSecret &&
        !this.verifyWebhookSignature(rawBody, signature)
      ) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const inventoryLevel = req.body;

      logger.info('Shopify inventory updated:', inventoryLevel);

      // Trigger inventory sync for affected SKU
      // TODO: Map inventory item to SKU and sync

      await Activity.create({
        type: 'inventory_update',
        action: 'Inventory updated via webhook',
        details: `Shopify inventory level updated`,
        metadata: inventoryLevel,
        success: true,
      });

      await this.logWebhook(
        'inventory/update',
        inventoryLevel,
        req.headers,
        true
      );

      res.status(200).json({ success: true });
    } catch (error) {
      logger.error('Inventory update webhook error:', error);
      await this.logWebhook(
        'inventory/update',
        req.body,
        req.headers,
        false,
        (error as Error).message
      );
      next(error);
    }
  }

  /**
   * Register webhook endpoints with Shopify
   */
  async registerWebhooks(): Promise<void> {
    try {
      const baseUrl =
        process.env.WEBHOOK_BASE_URL ||
        `http://localhost:${process.env.PORT || 3000}`;

      const webhooks = [
        {
          topic: 'orders/create',
          address: `${baseUrl}/webhooks/shopify/orders/create`,
        },
        {
          topic: 'orders/updated',
          address: `${baseUrl}/webhooks/shopify/orders/update`,
        },
        {
          topic: 'orders/cancelled',
          address: `${baseUrl}/webhooks/shopify/orders/cancel`,
        },
        {
          topic: 'products/create',
          address: `${baseUrl}/webhooks/shopify/products/create`,
        },
        {
          topic: 'products/update',
          address: `${baseUrl}/webhooks/shopify/products/update`,
        },
        {
          topic: 'products/delete',
          address: `${baseUrl}/webhooks/shopify/products/delete`,
        },
        {
          topic: 'inventory_levels/update',
          address: `${baseUrl}/webhooks/shopify/inventory/update`,
        },
      ];

      // TODO: Implement webhook registration with Shopify API
      logger.info('Webhook registration not implemented yet');

      for (const webhook of webhooks) {
        logger.info(
          `Would register webhook: ${webhook.topic} -> ${webhook.address}`
        );
      }
    } catch (error) {
      logger.error('Failed to register webhooks:', error);
    }
  }
}

export default ShopifyWebhookController;
