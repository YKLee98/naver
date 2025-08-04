// ===== 2. packages/backend/src/routes/exchangeRate.routes.ts =====
import { Router } from 'express';
import { authMiddleware, adminMiddleware } from '../middlewares';
import { ExchangeRateController } from '../controllers/ExchangeRateController';
import { ExchangeRateService } from '../services/exchangeRate';
import { getRedisClient } from '../config/redis';
import { validateRequest } from '../middlewares/validation.middleware';
import { body } from 'express-validator';

// 라우터 설정 함수로 export
export default function setupExchangeRateRoutes(): Router {
  const router = Router();

  // 서비스 인스턴스 생성 - Redis가 초기화된 후에 실행됨
  const redis = getRedisClient();
  const exchangeRateService = new ExchangeRateService(redis);

  // 컨트롤러 인스턴스
  const exchangeRateController = new ExchangeRateController(exchangeRateService);

  // 인증 미들웨어 적용
  router.use(authMiddleware);

  // 현재 환율 조회
  router.get('/current', exchangeRateController.getCurrentRate);

  // 환율 이력 조회
  router.get('/history', exchangeRateController.getRateHistory);

  // 수동 환율 설정 (관리자 전용)
  router.post(
    '/manual',
    adminMiddleware,
    [
      body('rate').isFloat({ min: 0.00001, max: 10000 }),
      body('reason').notEmpty().isString(),
      body('validHours').optional().isInt({ min: 1, max: 8760 }) // 최대 1년
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