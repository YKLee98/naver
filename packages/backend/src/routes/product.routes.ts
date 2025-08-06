// packages/backend/src/routes/product.routes.ts
import { searchShopifyProducts, searchNaverProducts } from '../controllers/ProductController';

router.get('/products/search/shopify', searchShopifyProducts);
router.get('/products/search/naver', searchNaverProducts);