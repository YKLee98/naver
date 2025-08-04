// packages/backend/src/routes/exchangeRate.routes.ts
import { Router } from 'express';
import { authMiddleware, adminMiddleware } from '../middlewares';
import { PriceSyncController } from '../controllers/PriceSyncController';
import { PriceSyncService } from '../services/sync';
import { NaverAuthService, NaverProductService } from '../services/naver';
import { ShopifyGraphQLService } from '../services/shopify';
import { getRedisClient } from '../config/redis';
import { validateRequest } from '../middlewares/validation.middleware';
import { body } from 'express-validator';

// 라우터 설정 함수로 export
export default function setupExchangeRateRoutes(): Router {
  const router = Router();

  // 서비스 인스턴스 생성 - Redis가 초기화된 후에 실행됨
  const redis = getRedisClient();
  const naverAuthService = new NaverAuthService(redis);
  const naverProductService = new NaverProductService(naverAuthService);
  const shopifyGraphQLService = new ShopifyGraphQLService();

  const priceSyncService = new PriceSyncService(
    redis,
    naverProductService,
    shopifyGraphQLService
  );

  // 컨트롤러 인스턴스
  const priceSyncController = new PriceSyncController(priceSyncService);

  // 인증 미들웨어 적용
  router.use(authMiddleware);

  // 현재 환율 조회
  router.get('/current', priceSyncController.getCurrentExchangeRate);

  // 수동 환율 설정 (관리자 전용)
  router.post(
    '/manual',
    adminMiddleware,
    [
      body('rate').isFloat({ min: 0.00001, max: 1 }),
      body('reason').notEmpty().isString(),
      body('validDays').optional().isInt({ min: 1, max: 365 })
    ],
    validateRequest,
    priceSyncController.setManualExchangeRate
  );

  return router;
}