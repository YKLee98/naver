// packages/backend/src/routes/api.routes.ts
import { Router } from 'express';
import { authMiddleware } from '../middlewares';

// 라우터 설정 함수로 export
export function setupApiRoutes(): Router {
  const router = Router();

  // 기본 API 정보 라우트 (인증 불필요)
  router.get('/', (req, res) => {
    res.json({
      success: true,
      message: 'Hallyu-Pomaholic Sync API',
      version: '1.0.0',
      endpoints: {
        auth: {
          login: 'POST /api/v1/auth/login',
          register: 'POST /api/v1/auth/register',
          refresh: 'POST /api/v1/auth/refresh',
          logout: 'POST /api/v1/auth/logout',
          me: 'GET /api/v1/auth/me'
        },
        health: 'GET /health',
        dashboard: 'GET /api/v1/dashboard/stats'
      }
    });
  });

  // 인증이 필요한 라우트들
  const protectedRouter = Router();
  protectedRouter.use(authMiddleware);

  // 상품 관련 라우트
  try {
    const { ProductController } = require('../controllers');
    const { NaverAuthService, NaverProductService } = require('../services/naver');
    const { ShopifyGraphQLService } = require('../services/shopify');
    const { getRedisClient } = require('../config/redis');

    const redis = getRedisClient();
    const naverAuthService = new NaverAuthService(redis);
    const naverProductService = new NaverProductService(naverAuthService);
    const shopifyGraphQLService = new ShopifyGraphQLService();

    const productController = new ProductController(
      naverProductService,
      shopifyGraphQLService
    );

    protectedRouter.get('/products', productController.getMappedProducts.bind(productController));
    protectedRouter.get('/products/:sku', productController.getProductBySku.bind(productController));
    protectedRouter.get('/products/search/naver', productController.searchNaverProducts.bind(productController));
    protectedRouter.get('/products/search/shopify', productController.searchShopifyProducts.bind(productController));
  } catch (error) {
    console.log('Product routes setup error:', error.message);
  }

  // 재고 관련 라우트
  try {
    const { InventoryController } = require('../controllers');
    const { NaverAuthService, NaverProductService } = require('../services/naver');
    const { ShopifyBulkService } = require('../services/shopify');
    const { InventorySyncService } = require('../services/sync');
    const { getRedisClient } = require('../config/redis');

    const redis = getRedisClient();
    const naverAuthService = new NaverAuthService(redis);
    const naverProductService = new NaverProductService(naverAuthService);
    const shopifyBulkService = new ShopifyBulkService();

    const inventorySyncService = new InventorySyncService(
      naverProductService,
      shopifyBulkService
    );

    const inventoryController = new InventoryController(inventorySyncService);

    protectedRouter.get('/inventory/:sku/status', inventoryController.getInventoryStatus.bind(inventoryController));
    protectedRouter.get('/inventory/:sku/history', inventoryController.getInventoryHistory.bind(inventoryController));
    protectedRouter.post('/inventory/:sku/adjust', inventoryController.adjustInventory.bind(inventoryController));
    protectedRouter.get('/inventory/low-stock', inventoryController.getLowStockItems.bind(inventoryController));
  } catch (error) {
    console.log('Inventory routes setup error:', error.message);
  }

  // 동기화 관련 라우트
  try {
    const { SyncController } = require('../controllers');
    const { NaverAuthService, NaverProductService, NaverOrderService } = require('../services/naver');
    const { ShopifyBulkService, ShopifyGraphQLService } = require('../services/shopify');
    const { SyncService, InventorySyncService } = require('../services/sync');
    const { getRedisClient } = require('../config/redis');

    const redis = getRedisClient();
    const naverAuthService = new NaverAuthService(redis);
    const naverProductService = new NaverProductService(naverAuthService);
    const naverOrderService = new NaverOrderService(naverAuthService);
    const shopifyBulkService = new ShopifyBulkService();
    const shopifyGraphQLService = new ShopifyGraphQLService();

    const syncService = new SyncService(
      naverProductService,
      naverOrderService,
      shopifyBulkService,
      shopifyGraphQLService,
      redis
    );

    const inventorySyncService = new InventorySyncService(
      naverProductService,
      shopifyBulkService
    );

    const syncController = new SyncController(syncService, inventorySyncService);

    protectedRouter.post('/sync/full', syncController.syncAll.bind(syncController));
    protectedRouter.post('/sync/inventory', syncController.syncInventory.bind(syncController));
    protectedRouter.post('/sync/orders', syncController.syncOrders.bind(syncController));
    protectedRouter.get('/sync/status', syncController.getSyncStatus.bind(syncController));
    protectedRouter.get('/sync/history', syncController.getSyncHistory.bind(syncController));
  } catch (error) {
    console.log('Sync routes setup error:', error.message);
  }

  // 매핑 관련 라우트
  try {
    const { MappingController } = require('../controllers');
    const { NaverAuthService, NaverProductService } = require('../services/naver');
    const { ShopifyGraphQLService } = require('../services/shopify');
    const { MappingService } = require('../services/sync');
    const { getRedisClient } = require('../config/redis');

    const redis = getRedisClient();
    const naverAuthService = new NaverAuthService(redis);
    const naverProductService = new NaverProductService(naverAuthService);
    const shopifyGraphQLService = new ShopifyGraphQLService();

    const mappingService = new MappingService(
      naverProductService,
      shopifyGraphQLService
    );

    const mappingController = new MappingController(mappingService);

    protectedRouter.get('/mappings', mappingController.getMappings.bind(mappingController));
    protectedRouter.post('/mappings', mappingController.createMapping.bind(mappingController));
    protectedRouter.put('/mappings/:id', mappingController.updateMapping.bind(mappingController));
    protectedRouter.delete('/mappings/:id', mappingController.deleteMapping.bind(mappingController));
    protectedRouter.post('/mappings/validate', mappingController.validateMapping.bind(mappingController));
    protectedRouter.post('/mappings/auto-discover', mappingController.autoDiscoverMappings.bind(mappingController));
  } catch (error) {
    console.log('Mapping routes setup error:', error.message);
  }

  // Protected routes를 메인 라우터에 추가
  router.use('/', protectedRouter);

  return router;
}