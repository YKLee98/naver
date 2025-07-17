// packages/backend/src/middlewares/index.ts
export { authMiddleware } from './auth.middleware';
export { errorMiddleware, AppError } from './error.middleware';
export { loggingMiddleware } from './logging.middleware';
export { rateLimiterMiddleware } from './rateLimiter.middleware';
export { validateShopifyWebhook } from './webhook.middleware';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      id?: string;
      webhookTopic?: string;
      shopDomain?: string;
    }
  }
}
