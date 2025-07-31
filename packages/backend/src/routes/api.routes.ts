// packages/backend/src/routes/api.routes.ts
import { Router } from 'express';
import { Redis } from 'ioredis';
import { authMiddleware } from '../middlewares/auth.middleware';

// Route imports
import authRoutes from './auth.routes';
import healthRoutes from './health.routes';

// Controller imports (lazy loaded for dependency injection)
export function createApiRouter(redis: Redis): Router {
  const router = Router();

  // 인증 라우트 (인증 불필요)
  router.use('/auth', authRoutes);
  
  // Health check (인증 불필요)
  router.use('/health', healthRoutes);

  // 인증이 필요한 라우트들
  router.use(authMiddleware); // 이 아래의 모든 라우트는 인증 필요

  // Lazy load controllers with Redis dependency
  const createControllers = () => {
    const { ProductController } = require('../controllers/ProductController');
    const { InventoryController } = require('../controllers/InventoryController');
    const { SyncController } = require('../controllers/SyncController');
    const { MappingController } = require('../controllers/MappingController');
    const { DashboardController } = require('../controllers/DashboardController');

    // Services
    const { NaverAuthService, NaverProductService, NaverOrderService } = require('../services/naver');
    const { ShopifyGraphQLService, ShopifyBulkService } = require('../services/shopify');
    const { SyncService, InventorySyncService, MappingService } = require('../services/sync');

    // Service instances
    const naverAuthService = new NaverAuthService(redis);
    const naverProductService = new NaverProductService(naverAuthService);
    const naverOrderService = new NaverOrderService(naverAuthService);
    const shopifyGraphQLService = new ShopifyGraphQLService();
    const shopifyBulkService = new ShopifyBulkService();

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

    const mappingService = new MappingService(
      naverProductService,
      shopifyGraphQLService
    );

    return {
      product: new ProductController(naverProductService, shopifyGraphQLService),
      inventory: new InventoryController(inventorySyncService),
      sync: new SyncController(syncService),
      mapping: new MappingController(mappingService),
      dashboard: new DashboardController(),
    };
  };

  const controllers = createControllers();

  // 상품 관련 라우트
  router.get('/products', controllers.product.getMappedProducts.bind(controllers.product));
  router.get('/products/:sku', controllers.product.getProductBySku.bind(controllers.product));
  router.post('/products/search/naver', controllers.product.searchNaverProducts.bind(controllers.product));
  router.post('/products/search/shopify', controllers.product.searchShopifyProducts.bind(controllers.product));

  // 재고 관련 라우트
  router.get('/inventory/:sku/status', controllers.inventory.getInventoryStatus.bind(controllers.inventory));
  router.get('/inventory/:sku/history', controllers.inventory.getInventoryHistory.bind(controllers.inventory));
  router.post('/inventory/:sku/adjust', controllers.inventory.adjustInventory.bind(controllers.inventory));
  router.get('/inventory/low-stock', controllers.inventory.getLowStockProducts.bind(controllers.inventory));

  // 동기화 관련 라우트
  router.post('/sync/full', controllers.sync.performFullSync.bind(controllers.sync));
  router.post('/sync/sku/:sku', controllers.sync.syncSingleSku.bind(controllers.sync));
  router.get('/sync/status', controllers.sync.getSyncStatus.bind(controllers.sync));
  router.get('/sync/settings', controllers.sync.getSyncSettings.bind(controllers.sync));
  router.put('/sync/settings', controllers.sync.updateSyncSettings.bind(controllers.sync));

  // 매핑 관련 라우트
  router.get('/mappings', controllers.mapping.getMappings.bind(controllers.mapping));
  router.get('/mappings/:sku', controllers.mapping.getMappings.bind(controllers.mapping)); // getMappingBySku가 없으므로 getMappings 사용
  router.post('/mappings', controllers.mapping.createMapping.bind(controllers.mapping));
  router.put('/mappings/:id', controllers.mapping.updateMapping.bind(controllers.mapping));
  router.delete('/mappings/:id', controllers.mapping.deleteMapping.bind(controllers.mapping));
  router.post('/mappings/auto-discover', controllers.mapping.autoDiscoverMappings.bind(controllers.mapping));
  router.post('/mappings/:id/validate', controllers.mapping.validateMapping.bind(controllers.mapping));
  router.post('/mappings/bulk', controllers.mapping.bulkUploadMappings.bind(controllers.mapping));

  // 대시보드 관련 라우트
  router.get('/dashboard/stats', controllers.dashboard.getStats.bind(controllers.dashboard));
  router.get('/dashboard/activity', controllers.dashboard.getRecentActivity.bind(controllers.dashboard));
  router.get('/dashboard/charts/sales', controllers.dashboard.getSalesChartData.bind(controllers.dashboard));
  router.get('/dashboard/charts/inventory', controllers.dashboard.getInventoryChartData.bind(controllers.dashboard));

  return router;
}

export default createApiRouter;