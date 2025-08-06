// ===== 5. packages/backend/src/routes/exchangeRates.routes.ts =====
import { Router } from 'express';
import { authMiddleware, adminMiddleware } from '../middlewares';
import { ExchangeRateController } from '../controllers/ExchangeRateController';
import { ExchangeRateService } from '../services/exchangeRate/ExchangeRateService';
import { getRedisClient } from '../config/redis';
import { validateRequest } from '../middlewares/validation.middleware';
import { body } from 'express-validator';

export default function setupExchangeRatesRoutes(): Router {
  const router = Router();
  
  // 서비스 및 컨트롤러 인스턴스 생성
  const redis = getRedisClient();
  const exchangeRateService = new ExchangeRateService(redis);
  const exchangeRateController = new ExchangeRateController(exchangeRateService);

  // 인증 미들웨어 적용
  router.use(authMiddleware);

  // 현재 환율 조회
  router.get('/current', exchangeRateController.getCurrentRate);

  // 환율 이력 조회
  router.get('/', exchangeRateController.getRateHistory);

  // 환율 업데이트
  router.post(
    '/update',
    [
      body('rate').optional().isFloat({ min: 0.00001, max: 1 }),
      body('isManual').optional().isBoolean()
    ],
    validateRequest,
    exchangeRateController.updateRate
  );

  // 수동 환율 설정 (관리자 전용)
  router.post(
    '/manual',
    adminMiddleware,
    [
      body('rate').isFloat({ min: 0.00001, max: 1 }),
      body('reason').notEmpty().isString(),
      body('validHours').optional().isInt({ min: 1, max: 8760 })
    ],
    validateRequest,
    exchangeRateController.setManualRate
  );

  // 환율 갱신 (관리자 전용)
  router.post(
    '/refresh',
    adminMiddleware,
    exchangeRateController.refreshRate
  );

  return router;
}