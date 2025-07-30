// packages/backend/src/middlewares/webhook.middleware.ts
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { logger } from '../utils/logger';

/**
 * Shopify Webhook 검증 미들웨어
 */
export const validateShopifyWebhook = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const shopifyWebhookSecret = process.env['SHOPIFY_WEBHOOK_SECRET'];
    
    if (!shopifyWebhookSecret) {
      logger.error('Shopify webhook secret not configured');
      res.status(500).json({ error: 'Server configuration error' });
      return;
    }

    const hmacHeader = req.get('X-Shopify-Hmac-Sha256');
    const topic = req.get('X-Shopify-Topic');
    const shopDomain = req.get('X-Shopify-Shop-Domain');

    if (!hmacHeader || !topic || !shopDomain) {
      logger.warn('Missing required webhook headers');
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Raw body가 필요하므로 bodyParser 이전에 처리되어야 함
    const rawBody = JSON.stringify(req.body);
    
    // HMAC 검증
    const hash = crypto
      .createHmac('sha256', shopifyWebhookSecret)
      .update(rawBody, 'utf8')
      .digest('base64');

    if (hash !== hmacHeader) {
      logger.warn('Invalid webhook signature', { 
        topic, 
        shopDomain,
        receivedHmac: hmacHeader.substring(0, 10) + '...' 
      });
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // 검증 성공 - 요청에 메타데이터 추가
    (req as any).webhookTopic = topic;
    (req as any).shopDomain = shopDomain;
    (req as any).webhookId = req.get('X-Shopify-Webhook-Id');

    logger.info('Webhook verified successfully', { topic, shopDomain });
    
    next();
  } catch (error) {
    logger.error('Webhook validation error:', error);
    res.status(400).json({ error: 'Bad Request' });
  }
};