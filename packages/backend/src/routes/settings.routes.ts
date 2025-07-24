// packages/backend/src/routes/settings.routes.ts
import { Router } from 'express';
import { authMiddleware, adminMiddleware } from '../middlewares';
import { PriceSyncController } from '../controllers/PriceSyncController';
import { PriceSyncService } from '../services/sync';
import { NaverAuthService, NaverProductService } from '../services/naver';
import { ShopifyGraphQLService } from '../services/shopify';
import { getRedisClient } from '../config/redis';
import { validateRequest } from '../middlewares/validation.middleware';
import { body } from 'express-validator';

const router = Router();

// 서비스 인스턴스 생성
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

// 가격 동기화 설정 조회
router.get('/price-sync', priceSyncController.getSettings);

// 가격 동기화 설정 저장 (관리자 전용)
router.put(
  '/price-sync',
  adminMiddleware,
  [
    body('mode').isIn(['auto', 'manual']),
    body('autoSync').isBoolean(),
    body('defaultMargin').isFloat({ min: -99, max: 999 }),
    body('exchangeRateSource').isIn(['api', 'manual']),
    body('customExchangeRate').optional().isFloat({ min: 0.00001, max: 1 }),
    body('roundingStrategy').isIn(['up', 'down', 'nearest']),
    body('syncSchedule').isString()
  ],
  validateRequest,
  priceSyncController.updateSettings
);

export default router;
