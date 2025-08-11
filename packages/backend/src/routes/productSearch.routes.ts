// ===== 12. packages/backend/src/routes/productSearch.routes.ts =====
import { Router } from 'express';
import { ProductSearchController } from '../controllers/ProductSearchController.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';
import { validateRequest } from '../middlewares/validation.middleware.js';
import { query } from 'express-validator';
import { Redis } from 'ioredis';

export function createProductSearchRouter(redis: Redis): Router {
  const router = Router();
  const productSearchController = new ProductSearchController(redis);

  // 모든 라우트는 인증 필요
  router.use(authMiddleware);

  // 네이버 상품 검색
  router.get(
    '/naver/search',
    [query('sku').notEmpty().withMessage('SKU는 필수입니다')],
    validateRequest,
    productSearchController.searchNaverProducts.bind(productSearchController)
  );

  // Shopify 상품 검색
  router.get(
    '/shopify/search',
    [query('sku').notEmpty().withMessage('SKU는 필수입니다')],
    validateRequest,
    productSearchController.searchShopifyProducts.bind(productSearchController)
  );

  return router;
}
