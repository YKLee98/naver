// packages/backend/src/routes/priceSync.routes.ts
import { Router } from 'express';
import { authMiddleware, adminMiddleware } from '../middlewares';
import { PriceSyncController } from '../controllers/PriceSyncController';
import { PriceSyncService } from '../services/sync';
import { NaverAuthService, NaverProductService } from '../services/naver';
import { ShopifyGraphQLService } from '../services/shopify';
import { getRedisClient } from '../config/redis';
import { validateRequest } from '../middlewares/validation.middleware';
import { body, query, param } from 'express-validator';

const router = Router();

// 라우터 설정 함수로 변경 - 지연 초기화
export default function setupPriceSyncRoutes(): Router {
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

  // 초기 가격 데이터 조회
  router.get(
    '/initial-prices',
    [
      query('skus').optional().isString(),
      query('limit').optional().isInt({ min: 1, max: 1000 }),
      query('offset').optional().isInt({ min: 0 })
    ],
    validateRequest,
    priceSyncController.getInitialPrices
  );

  // 가격 동기화 실행
  router.post(
    '/sync',
    adminMiddleware,
    [
      body('mode').optional().isIn(['auto', 'manual']),
      body('skus').optional().isArray(),
      body('margin').optional().isFloat({ min: 0.01, max: 10 }),
      body('exchangeRateSource').optional().isIn(['api', 'manual']),
      body('customExchangeRate').optional().isFloat({ min: 0.00001, max: 1 }),
      body('roundingStrategy').optional().isIn(['up', 'down', 'nearest']),
      body('applyRules').optional().isBoolean()
    ],
    validateRequest,
    priceSyncController.syncPrices
  );

  // 마진 일괄 적용
  router.post(
    '/apply-margins',
    [
      body('updates').isArray({ min: 1 }),
      body('updates.*.sku').notEmpty().isString(),
      body('updates.*.margin').isFloat({ min: -99, max: 999 })
    ],
    validateRequest,
    priceSyncController.applyMargins
  );

  // 가격 이력 조회
  router.get(
    '/history',
    [
      query('sku').optional().isString(),
      query('platform').optional().isIn(['naver', 'shopify']),
      query('startDate').optional().isISO8601(),
      query('endDate').optional().isISO8601(),
      query('limit').optional().isInt({ min: 1, max: 1000 }),
      query('offset').optional().isInt({ min: 0 })
    ],
    validateRequest,
    priceSyncController.getPriceHistory
  );

  // 동기화 작업 상태 조회
  router.get(
    '/jobs/:jobId',
    [
      param('jobId').isUUID()
    ],
    validateRequest,
    priceSyncController.getJobStatus
  );

  // 가격 규칙 관리
  router.post(
    '/rules',
    adminMiddleware,
    [
      body('name').notEmpty().isString(),
      body('type').isIn(['category', 'sku', 'brand', 'price_range']),
      body('value').notEmpty().isString(),
      body('marginRate').isFloat({ min: 0.01, max: 10 }),
      body('priority').optional().isInt({ min: 0 }),
      body('enabled').optional().isBoolean(),
      body('conditions').optional().isObject()
    ],
    validateRequest,
    priceSyncController.createPriceRule
  );

  router.put(
    '/rules/:id',
    adminMiddleware,
    [
      param('id').isMongoId(),
      body('name').optional().isString(),
      body('type').optional().isIn(['category', 'sku', 'brand', 'price_range']),
      body('value').optional().isString(),
      body('marginRate').optional().isFloat({ min: 0.01, max: 10 }),
      body('priority').optional().isInt({ min: 0 }),
      body('enabled').optional().isBoolean(),
      body('conditions').optional().isObject()
    ],
    validateRequest,
    priceSyncController.updatePriceRule
  );

  router.delete(
    '/rules/:id',
    adminMiddleware,
    [
      param('id').isMongoId()
    ],
    validateRequest,
    priceSyncController.deletePriceRule
  );

  return router;
}