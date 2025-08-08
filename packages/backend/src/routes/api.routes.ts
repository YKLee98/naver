// packages/backend/src/routes/api.routes.ts
import { Router } from 'express';
import { authMiddleware } from '../middlewares';

export function setupApiRoutes(): Router {
  const router = Router();

  // 기본 API 정보 라우트 (인증 불필요)
  router.get('/', (req, res) => {
    res.json({
      success: true,
      message: 'Hallyu-Pomaholic Sync API',
      version: '1.0.0',
      endpoints: {
        auth: '/api/v1/auth/*',
        products: '/api/v1/products/*',
        inventory: '/api/v1/inventory/*',
        sync: '/api/v1/sync/*',
        mappings: '/api/v1/mappings/*',
        dashboard: '/api/v1/dashboard/*',
        settings: '/api/v1/settings/*',
        prices: '/api/v1/prices/*',
        exchange: '/api/v1/exchange-rates/*'
      }
    });
  });

  // 인증이 필요한 라우트들
  const protectedRouter = Router();
  protectedRouter.use(authMiddleware);

  // 매핑 관련 라우트 (SKU 검색 포함)
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

    const mappingController = new MappingController(
      mappingService,
      naverProductService,
      shopifyGraphQLService
    );

    // ✅ SKU 검색 라우트 수정 - query 파라미터 사용
    protectedRouter.get('/mappings/search-by-sku', (req, res, next) => {
      // req.query.sku를 req.params.sku로 변환
      const modifiedReq = {
        ...req,
        params: { sku: req.query.sku }
      };
      return mappingController.searchProductsBySku(modifiedReq, res, next);
    });
    
    // 기본 매핑 라우트들
    protectedRouter.get('/mappings', mappingController.getMappings.bind(mappingController));
    protectedRouter.post('/mappings', mappingController.createMapping.bind(mappingController));
    protectedRouter.put('/mappings/:id', mappingController.updateMapping.bind(mappingController));
    protectedRouter.delete('/mappings/:id', mappingController.deleteMapping.bind(mappingController));
    
    // 추가 매핑 기능
    protectedRouter.post('/mappings/validate', mappingController.validateMappingData.bind(mappingController));
    protectedRouter.post('/mappings/:id/validate', mappingController.validateMapping.bind(mappingController));
    protectedRouter.post('/mappings/auto-discover', mappingController.autoDiscoverMappings.bind(mappingController));
    protectedRouter.post('/mappings/bulk', mappingController.bulkUploadMappings.bind(mappingController));
    protectedRouter.get('/mappings/template', mappingController.downloadTemplate.bind(mappingController));
    protectedRouter.put('/mappings/bulk-toggle', mappingController.toggleMappings.bind(mappingController));
    protectedRouter.post('/mappings/bulk-delete', mappingController.bulkDelete.bind(mappingController));
    protectedRouter.get('/mappings/export', mappingController.exportMappings.bind(mappingController));
  } catch (error) {
    console.log('Mapping routes setup error:', error.message);
  }

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
    const { NaverProductService } = require('../services/naver');
    const { ShopifyBulkService } = require('../services/shopify');
    const { InventorySyncService } = require('../services/sync');

    const inventorySyncService = new InventorySyncService(
      new NaverProductService(),
      new ShopifyBulkService()
    );

    const inventoryController = new InventoryController(inventorySyncService);

    protectedRouter.get('/inventory/:sku/status', inventoryController.getInventoryStatus.bind(inventoryController));
    protectedRouter.get('/inventory/:sku/history', inventoryController.getInventoryHistory.bind(inventoryController));
    protectedRouter.post('/inventory/:sku/adjust', inventoryController.adjustInventory.bind(inventoryController));
    protectedRouter.get('/inventory/low-stock', inventoryController.getLowStockProducts.bind(inventoryController));
    protectedRouter.get('/inventory/status', inventoryController.getAllInventoryStatus.bind(inventoryController));
  } catch (error) {
    console.log('Inventory routes setup error:', error.message);
  }

  // 동기화 관련 라우트
  try {
    const { SyncController } = require('../controllers');
    const { SyncService } = require('../services/sync');
    const { getRedisClient } = require('../config/redis');

    const syncService = new SyncService(getRedisClient());
    const syncController = new SyncController(syncService);

    protectedRouter.post('/sync/full', syncController.performFullSync.bind(syncController));
    protectedRouter.post('/sync/sku/:sku', syncController.syncSingleSku.bind(syncController));
    protectedRouter.get('/sync/status', syncController.getSyncStatus.bind(syncController));
    protectedRouter.get('/sync/settings', syncController.getSyncSettings.bind(syncController));
    protectedRouter.put('/sync/settings', syncController.updateSyncSettings.bind(syncController));
  } catch (error) {
    console.log('Sync routes setup error:', error.message);
  }

  // 모든 보호된 라우트를 메인 라우터에 추가
  router.use('/', protectedRouter);

  return router;
}

// 기본 export (호환성)
export default setupApiRoutes();