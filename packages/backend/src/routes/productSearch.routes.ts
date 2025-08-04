// packages/backend/src/routes/productSearch.routes.ts
import { Router } from 'express';
import { ProductSearchController } from '../controllers/ProductSearchController';
import { authMiddleware } from '../middlewares/auth.middleware';
import { validateRequest } from '../middlewares/validation.middleware';
import { query } from 'express-validator';

const router = Router();
const productSearchController = new ProductSearchController();

// 모든 라우트는 인증 필요
router.use(authMiddleware);

// 네이버 상품 검색
router.get(
  '/naver/search',
  [
    query('sku').notEmpty().withMessage('SKU는 필수입니다'),
  ],
  validateRequest,
  productSearchController.searchNaverProducts.bind(productSearchController)
);

// Shopify 상품 검색
router.get(
  '/shopify/search',
  [
    query('sku').notEmpty().withMessage('SKU는 필수입니다'),
  ],
  validateRequest,
  productSearchController.searchShopifyProducts.bind(productSearchController)
);

export default router;