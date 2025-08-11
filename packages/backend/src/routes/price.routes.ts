// ===== 9. packages/backend/src/routes/price.routes.ts =====
import { Router } from 'express';
import { authMiddleware } from '../middlewares/index.js';
import { PriceController } from '../controllers/PriceController.js';

export default function setupPriceRoutes(): Router {
  const router = Router();
  const priceController = new PriceController();

  // 인증 미들웨어 적용
  router.use(authMiddleware);

  // 가격 이력 조회
  router.get('/history', priceController.getPriceHistory);

  // 현재 가격 조회
  router.get('/current', priceController.getCurrentPrices);
  router.get('/current/:sku', priceController.getCurrentPrice);

  // 가격 업데이트
  router.post('/update', priceController.updatePrice);

  // 일괄 가격 업데이트
  router.post('/bulk-update', priceController.bulkUpdatePrices);

  // 가격 계산 시뮬레이션
  router.post('/simulate', priceController.simulatePriceCalculation);

  // 가격 규칙 설정
  router.post('/rules', priceController.setPricingRules);
  router.get('/rules', priceController.getPricingRules);

  return router;
}
