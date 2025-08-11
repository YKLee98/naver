// packages/backend/src/middlewares/webhook.middleware.ts
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { logger } from '../utils/logger.js';

export function validateWebhookSignature(source: 'shopify' | 'naver') {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (process.env.WEBHOOK_VERIFY_SIGNATURE === 'false') {
        logger.debug('Webhook signature verification disabled');
        return next();
      }

      if (source === 'shopify') {
        const signature = req.get('X-Shopify-Hmac-Sha256');
        const topic = req.get('X-Shopify-Topic');
        const shopId = req.get('X-Shopify-Shop-Domain');

        if (!signature) {
          logger.warn('Missing Shopify webhook signature');
          return res.status(401).json({ error: 'Unauthorized' });
        }

        const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
        if (!secret) {
          logger.warn('Shopify webhook secret not configured');
          return next(); // Allow in development
        }

        // Verify signature
        const rawBody = (req as any).rawBody || JSON.stringify(req.body);
        const hash = crypto
          .createHmac('sha256', secret)
          .update(rawBody, 'utf8')
          .digest('base64');

        if (hash !== signature) {
          logger.warn('Invalid Shopify webhook signature', {
            topic,
            shopId,
            expected: hash,
            received: signature,
          });
          return res.status(401).json({ error: 'Invalid signature' });
        }

        logger.debug('Shopify webhook signature verified', { topic, shopId });
      } else if (source === 'naver') {
        const signature = req.get('X-Naver-Signature');
        const timestamp = req.get('X-Naver-Timestamp');

        if (!signature || !timestamp) {
          logger.warn('Missing Naver webhook headers');
          // Naver might not always send signatures, so we allow it
          return next();
        }

        const secret = process.env.NAVER_CLIENT_SECRET;
        if (!secret) {
          logger.warn('Naver client secret not configured');
          return next(); // Allow in development
        }

        // Verify signature
        const rawBody = (req as any).rawBody || JSON.stringify(req.body);
        const message = `${timestamp}.${rawBody}`;
        const expectedSignature = crypto
          .createHmac('sha256', secret)
          .update(message)
          .digest('base64');

        if (signature !== expectedSignature) {
          logger.warn('Invalid Naver webhook signature');
          return res.status(401).json({ error: 'Invalid signature' });
        }

        logger.debug('Naver webhook signature verified');
      }

      next();
    } catch (error) {
      logger.error('Webhook signature validation error:', error);
      res.status(500).json({ error: 'Signature validation failed' });
    }
  };
}

export function captureRawBody(
  req: Request,
  res: Response,
  next: NextFunction
) {
  let data = '';

  req.on('data', (chunk) => {
    data += chunk;
  });

  req.on('end', () => {
    (req as any).rawBody = data;
    next();
  });
}

export default validateWebhookSignature;
