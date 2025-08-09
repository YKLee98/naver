// ===== 11. packages/backend/src/routes/product.routes.ts =====
import { Router } from 'express';
import { searchShopifyProducts, searchNaverProducts } from '../controllers/ProductController.js';

const router = Router();

router.get('/products/search/shopify', searchShopifyProducts);
router.get('/products/search/naver', searchNaverProducts);
