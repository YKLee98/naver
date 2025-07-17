// packages/backend/src/middlewares/webhook.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { ShopifyWebhookService } from '../services/shopify';
import { logger } from '../utils/logger';

export const validateShopifyWebhook = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const webhookService = new ShopifyWebhookService();
    const rawBody = req.body.toString('utf8');
    
    const validation = webhookService.validateWebhook(rawBody, req.headers);

    if (!validation.isValid) {
      logger.warn('Invalid Shopify webhook signature');
      res.status(401).json({
        success: false,
        message: 'Invalid webhook signature',
      });
      return;
    }

    // Parse body and attach to request
    req.body = JSON.parse(rawBody);
    req.webhookTopic = validation.topic;
    req.shopDomain = validation.shopDomain;

    next();
  } catch (error) {
    logger.error('Webhook validation error:', error);
    res.status(400).json({
      success: false,
      message: 'Invalid webhook',
    });
  }
};
