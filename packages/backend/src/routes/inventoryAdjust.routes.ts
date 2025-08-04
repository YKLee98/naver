// packages/backend/src/routes/inventoryAdjust.routes.ts
import { Router } from 'express';
import { InventoryAdjustController } from '../controllers/InventoryAdjustController';
import { authMiddleware } from '../middlewares/auth.middleware';
import { validateRequest } from '../middlewares/validation.middleware';
import { body } from 'express-validator';

const router = Router();
const inventoryAdjustController = new InventoryAdjustController();

// 모든 라우트는 인증 필요
router.use(authMiddleware);

// 재고 조정
router.post(
  '/adjust',
  [
    body('sku').notEmpty().withMessage('SKU는 필수입니다'),
    body('platform').isIn(['naver', 'shopify', 'both']).withMessage('유효하지 않은 플랫폼입니다'),
    body('adjustType').isIn(['set', 'add', 'subtract']).withMessage('유효하지 않은 조정 유형입니다'),
    body('reason').notEmpty().withMessage('조정 사유는 필수입니다'),
    body('naverQuantity').optional().isInt({ min: 0 }).withMessage('네이버 수량은 0 이상이어야 합니다'),
    body('shopifyQuantity').optional().isInt({ min: 0 }).withMessage('Shopify 수량은 0 이상이어야 합니다'),
  ],
  validateRequest,
  inventoryAdjustController.adjustInventory.bind(inventoryAdjustController)
);

// 재고 조정 이력 조회
router.get(
  '/history/:sku',
  inventoryAdjustController.getAdjustmentHistory.bind(inventoryAdjustController)
);

export default router;