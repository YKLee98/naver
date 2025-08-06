// ===== 6. packages/backend/src/routes/exchangeRate.routes.ts =====
// 이 파일은 exchangeRates.routes.ts와 동일한 기능을 제공하되, 
// /exchange-rate 경로용으로 사용됩니다.
import { Router } from 'express';
import { authMiddleware } from '../middlewares';
import { ExchangeRateController } from '../controllers/ExchangeRateController';
import { ExchangeRateService } from '../services/exchangeRate/ExchangeRateService';
import { getRedisClient } from '../config/redis';

export default function setupExchangeRateRoutes(): Router {
  const router = Router();
  
  const redis = getRedisClient();
  const exchangeRateService = new ExchangeRateService(redis);
  const exchangeRateController = new ExchangeRateController(exchangeRateService);

  router.use(authMiddleware);

  router.get('/current', exchangeRateController.getCurrentRate);
  router.get('/history', exchangeRateController.getRateHistory);
  router.post('/manual', exchangeRateController.setManualRate);
  router.post('/refresh', exchangeRateController.refreshRate);

  return router;
}