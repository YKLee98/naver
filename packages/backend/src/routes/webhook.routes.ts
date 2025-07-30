// packages/backend/src/routes/webhook.routes.ts
import { Router } from 'express';
import { Redis } from 'ioredis';
import { validateShopifyWebhook } from '../middlewares';
import { WebhookController } from '../controllers';
import { InventorySyncService } from '../services/sync';
import { NaverAuthService, NaverProductService } from '../services/naver';
import { ShopifyBulkService } from '../services/shopify';

export function createWebhookRouter(redis: Redis): Router {
  const router = Router();

  // 서비스 인스턴스 생성
  const naverAuthService = new NaverAuthService(redis);
  const naverProductService = new NaverProductService(naverAuthService);
  const shopifyBulkService = new ShopifyBulkService();

  const inventorySyncService = new InventorySyncService(
    naverProductService,
    shopifyBulkService
  );

  // 컨트롤러 인스턴스
  const webhookController = new WebhookController(inventorySyncService);

  // Shopify 웹훅 검증 미들웨어 적용
  router.use(validateShopifyWebhook);

  // Shopify 웹훅 엔드포인트
  router.post('/orders/paid', webhookController.handleOrdersPaid);
  router.post('/orders/cancelled', webhookController.handleOrdersCancelled);
  router.post('/inventory/update', webhookController.handleInventoryUpdate);

  return router;
}

export default createWebhookRouter;