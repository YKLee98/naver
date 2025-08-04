// packages/backend/src/routes/api.routes.ts
import { Router } from 'express';
import { Redis } from 'ioredis';
import { authMiddleware } from '../middlewares/auth.middleware';
import { createProductSearchRouter } from './productSearch.routes';
import { createInventoryAdjustRouter } from './inventoryAdjust.routes';

// Static routes that don't need Redis
import authRoutes from './auth.routes';
import healthRoutes from './health.routes';

export function createApiRouter(redis: Redis): Router {
  const router = Router();

  // 인증 라우트 (인증 불필요)
  router.use('/auth', authRoutes);
  
  // Health check (인증 불필요)
  router.use('/health', healthRoutes);

  // 인증이 필요한 라우트들
  router.use(authMiddleware);

  // Product search routes with Redis injection
  router.use('/search', createProductSearchRouter(redis));
  
  // Inventory adjust routes with Redis injection
  router.use('/inventory', createInventoryAdjustRouter(redis));

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
      dashboard: new DashboardController()
    };
  };

  // Create controllers
  const controllers = createControllers();

  // 상품 관련 라우트
  router.get('/products', controllers.product.getMappedProducts.bind(controllers.product));
  router.get('/products/:sku', controllers.product.getProductBySku.bind(controllers.product));
  router.get('/products/search/naver', controllers.product.searchNaverProducts.bind(controllers.product));
  router.get('/products/search/shopify', controllers.product.searchShopifyProducts.bind(controllers.product));

  // 재고 관련 라우트 - 프론트엔드가 기대하는 엔드포인트 추가
  router.get('/inventory/status', async (req, res) => {
    // 재고 목록 조회
    try {
      const { page = 1, limit = 20, search = '' } = req.query;
      
      // 임시 구현 - 실제로는 서비스를 통해 데이터를 가져와야 함
      res.json({
        success: true,
        data: [],
        total: 0,
        page: Number(page),
        totalPages: 0
      });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });
  
  router.get('/inventory/:sku/status', controllers.inventory.getInventoryStatus.bind(controllers.inventory));
  router.get('/inventory/:sku/history', controllers.inventory.getInventoryHistory.bind(controllers.inventory));
  router.get('/inventory/low-stock', controllers.inventory.getLowStockProducts.bind(controllers.inventory));

  // 동기화 관련 라우트
  router.post('/sync/full', controllers.sync.performFullSync.bind(controllers.sync));
  router.post('/sync/sku/:sku', controllers.sync.syncSingleSku.bind(controllers.sync));
  router.get('/sync/status', controllers.sync.getSyncStatus.bind(controllers.sync));
  router.get('/sync/settings', controllers.sync.getSyncSettings.bind(controllers.sync));
  router.put('/sync/settings', controllers.sync.updateSyncSettings.bind(controllers.sync));

  // 매핑 관련 라우트
  router.get('/mappings', controllers.mapping.getMappings.bind(controllers.mapping));
  router.get('/mappings/:sku', controllers.mapping.getMappings.bind(controllers.mapping));
  router.post('/mappings', controllers.mapping.createMapping.bind(controllers.mapping));
  router.put('/mappings/:id', controllers.mapping.updateMapping.bind(controllers.mapping));
  router.delete('/mappings/:id', controllers.mapping.deleteMapping.bind(controllers.mapping));
  router.post('/mappings/auto-discover', controllers.mapping.autoDiscoverMappings.bind(controllers.mapping));
  router.post('/mappings/:id/validate', controllers.mapping.validateMapping.bind(controllers.mapping));
  router.post('/mappings/bulk', controllers.mapping.bulkUploadMappings.bind(controllers.mapping));

  // 대시보드 관련 라우트
  router.get('/dashboard/stats', controllers.dashboard.getStats.bind(controllers.dashboard));
  router.get('/dashboard/statistics', controllers.dashboard.getStats.bind(controllers.dashboard)); // alias
  router.get('/dashboard/activity', controllers.dashboard.getRecentActivity.bind(controllers.dashboard));
  router.get('/dashboard/activities', controllers.dashboard.getRecentActivity.bind(controllers.dashboard)); // alias
  router.get('/dashboard/charts/sales', controllers.dashboard.getSalesChartData.bind(controllers.dashboard));
  router.get('/dashboard/charts/inventory', controllers.dashboard.getInventoryChartData.bind(controllers.dashboard));

  return router;
}

export default createApiRouter;