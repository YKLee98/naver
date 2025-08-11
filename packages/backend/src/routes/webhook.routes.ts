// packages/backend/src/routes/webhook.routes.ts
import { Router } from 'express';
import { ServiceContainer } from '../services/ServiceContainer.js';
import { validateWebhookSignature } from '../middlewares/webhook.middleware.js';
import { logger } from '../utils/logger.js';
import { WebhookLog } from '../models/WebhookLog.js';

export function setupWebhookRoutes(services: ServiceContainer): Router {
  const router = Router();

  // Naver Commerce webhooks
  router.post('/naver', async (req, res, next) => {
    try {
      // Log webhook
      await WebhookLog.create({
        source: 'naver',
        event: req.body.event || 'unknown',
        payload: req.body,
        headers: req.headers as any,
        processed: false,
      });

      if (services.webhookController) {
        await services.webhookController.handleNaverWebhook(req, res, next);
      } else {
        res.status(200).json({ received: true });
      }
    } catch (error) {
      logger.error('Naver webhook error:', error);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  });

  // Shopify webhooks (with signature validation)
  router.post(
    '/shopify/orders/create',
    validateWebhookSignature('shopify'),
    async (req, res, next) => {
      try {
        await logShopifyWebhook('orders/create', req);

        if (services.shopifyWebhookController) {
          await services.shopifyWebhookController.handleOrderCreate(
            req,
            res,
            next
          );
        } else {
          res.status(200).send('OK');
        }
      } catch (error) {
        logger.error('Shopify order create webhook error:', error);
        res.status(500).send('Error');
      }
    }
  );

  router.post(
    '/shopify/orders/update',
    validateWebhookSignature('shopify'),
    async (req, res, next) => {
      try {
        await logShopifyWebhook('orders/update', req);

        if (services.shopifyWebhookController) {
          await services.shopifyWebhookController.handleOrderUpdate(
            req,
            res,
            next
          );
        } else {
          res.status(200).send('OK');
        }
      } catch (error) {
        logger.error('Shopify order update webhook error:', error);
        res.status(500).send('Error');
      }
    }
  );

  router.post(
    '/shopify/orders/cancel',
    validateWebhookSignature('shopify'),
    async (req, res, next) => {
      try {
        await logShopifyWebhook('orders/cancel', req);

        if (services.shopifyWebhookController) {
          await services.shopifyWebhookController.handleOrderCancel(
            req,
            res,
            next
          );
        } else {
          res.status(200).send('OK');
        }
      } catch (error) {
        logger.error('Shopify order cancel webhook error:', error);
        res.status(500).send('Error');
      }
    }
  );

  router.post(
    '/shopify/products/create',
    validateWebhookSignature('shopify'),
    async (req, res, next) => {
      try {
        await logShopifyWebhook('products/create', req);

        if (services.shopifyWebhookController) {
          await services.shopifyWebhookController.handleProductCreate(
            req,
            res,
            next
          );
        } else {
          res.status(200).send('OK');
        }
      } catch (error) {
        logger.error('Shopify product create webhook error:', error);
        res.status(500).send('Error');
      }
    }
  );

  router.post(
    '/shopify/products/update',
    validateWebhookSignature('shopify'),
    async (req, res, next) => {
      try {
        await logShopifyWebhook('products/update', req);

        if (services.shopifyWebhookController) {
          await services.shopifyWebhookController.handleProductUpdate(
            req,
            res,
            next
          );
        } else {
          res.status(200).send('OK');
        }
      } catch (error) {
        logger.error('Shopify product update webhook error:', error);
        res.status(500).send('Error');
      }
    }
  );

  router.post(
    '/shopify/products/delete',
    validateWebhookSignature('shopify'),
    async (req, res, next) => {
      try {
        await logShopifyWebhook('products/delete', req);

        if (services.shopifyWebhookController) {
          await services.shopifyWebhookController.handleProductDelete(
            req,
            res,
            next
          );
        } else {
          res.status(200).send('OK');
        }
      } catch (error) {
        logger.error('Shopify product delete webhook error:', error);
        res.status(500).send('Error');
      }
    }
  );

  router.post(
    '/shopify/inventory_levels/update',
    validateWebhookSignature('shopify'),
    async (req, res, next) => {
      try {
        await logShopifyWebhook('inventory_levels/update', req);

        if (services.shopifyWebhookController) {
          await services.shopifyWebhookController.handleInventoryUpdate(
            req,
            res,
            next
          );
        } else {
          res.status(200).send('OK');
        }
      } catch (error) {
        logger.error('Shopify inventory update webhook error:', error);
        res.status(500).send('Error');
      }
    }
  );

  // Generic webhook endpoint for testing
  router.post('/test', async (req, res) => {
    logger.info('Test webhook received:', {
      headers: req.headers,
      body: req.body,
    });

    res.status(200).json({
      received: true,
      timestamp: new Date().toISOString(),
      data: req.body,
    });
  });

  // Get webhook logs
  router.get('/logs', async (req, res) => {
    try {
      const { source, event, limit = 50, offset = 0 } = req.query;

      const query: any = {};
      if (source) query.source = source;
      if (event) query.event = event;

      const logs = await WebhookLog.find(query)
        .sort({ createdAt: -1 })
        .limit(Number(limit))
        .skip(Number(offset))
        .lean();

      const total = await WebhookLog.countDocuments(query);

      res.json({
        success: true,
        data: logs,
        pagination: {
          total,
          limit: Number(limit),
          offset: Number(offset),
        },
      });
    } catch (error) {
      logger.error('Get webhook logs error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get webhook logs',
      });
    }
  });

  logger.info('✅ Webhook routes initialized');
  return router;
}

async function logShopifyWebhook(event: string, req: any): Promise<void> {
  try {
    await WebhookLog.create({
      source: 'shopify',
      event,
      payload: req.body,
      headers: req.headers,
      processed: false,
    });
  } catch (error) {
    logger.error('Failed to log Shopify webhook:', error);
  }
}

export default setupWebhookRoutes;
