// ===== 4. packages/backend/src/routes/exchangeRate.routes.ts =====
import { Router } from 'express';
import { authMiddleware } from '../middlewares/index.js';
import { ExchangeRateController } from '../controllers/ExchangeRateController.js';
import { ExchangeRateService } from '../services/exchangeRate/ExchangeRateService.js';
import { getRedisClient } from '../config/redis.js';

export default function setupExchangeRateRoutes(): Router {
  const router = Router();

  const redis = getRedisClient();
  const exchangeRateService = new ExchangeRateService(redis);
  const exchangeRateController = new ExchangeRateController(
    exchangeRateService
  );

  router.use(authMiddleware);

  router.get('/current', exchangeRateController.getCurrentRate);
  router.get('/history', exchangeRateController.getRateHistory);
  router.post('/manual', exchangeRateController.setManualRate);
  router.post('/refresh', exchangeRateController.refreshRate);

  return router;
}
