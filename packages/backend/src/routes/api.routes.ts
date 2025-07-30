// packages/backend/src/routes/api.routes.ts
import { Router } from 'express';
import { Redis } from 'ioredis';
import { authMiddleware } from '../middlewares';
import { 
  ProductController,
  InventoryController,
  SyncController,
  MappingController,
  DashboardController
} from '../controllers';
import { 
  NaverAuthService,
  NaverProductService,
  NaverOrderService
} from '../services/naver';
import { 
  ShopifyGraphQLService,
  ShopifyBulkService
} from '../services/shopify';
import { 
  SyncService,
  InventorySyncService,
  MappingService
} from '../services/sync';

export function createApiRouter(redis: Redis): Router {
  const router = Router();

  // 서비스 인스턴스 생성
  const naverAuthService = new NaverAuthService(redis);
  const naverProductService = new NaverProductService(naverAuthService);
  const naverOrderService = new NaverOrderService(naverAuthService);
  const shopifyGraphQLService = new ShopifyGraphQLService();
  const shopifyBulkService = new ShopifyBulkService();

  // SyncService에 모든 필요한 의존성 전달
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

  // 컨트롤러 인스턴스 생성
  const productController = new ProductController(
    naverProductService,
    shopifyGraphQLService
  );
  const inventoryController = new InventoryController(inventorySyncService);
  const syncController = new SyncController(syncService);
  const mappingController = new MappingController(mappingService);
  const dashboardController = new DashboardController();

  // 인증 미들웨어 적용
  router.use(authMiddleware);

  // 상품 관련 라우트
  router.get('/products', productController.getMappedProducts);
  router.get('/products/:sku', productController.getProductBySku);
  router.get('/products/search/naver', productController.searchNaverProducts);
  router.get('/products/search/shopify', productController.searchShopifyProducts);

  // 재고 관련 라우트
  router.get('/inventory/:sku/status', inventoryController.getInventoryStatus);
  router.get('/inventory/:sku/history', inventoryController.getInventoryHistory);
  router.post('/inventory/:sku/adjust', inventoryController.adjustInventory);
  router.get('/inventory/low-stock', inventoryController.getLowStockProducts);

  // 동기화 관련 라우트
  router.post('/sync/full', syncController.performFullSync);
  router.post('/sync/sku/:sku', syncController.syncSingleSku);
  router.get('/sync/status', syncController.getSyncStatus);
  router.get('/sync/settings', syncController.getSyncSettings);
  router.put('/sync/settings', syncController.updateSyncSettings);

  // 매핑 관련 라우트
  router.get('/mappings', mappingController.getMappings);
  router.get('/mappings/:sku', mappingController.getMappings); // 임시로 getMappings 사용
  router.post('/mappings', mappingController.createMapping);
  router.put('/mappings/:id', mappingController.updateMapping);
  router.delete('/mappings/:id', mappingController.deleteMapping);
  router.post('/mappings/auto-discover', mappingController.autoDiscoverMappings);
  router.post('/mappings/:id/validate', mappingController.validateMapping);
  router.post('/mappings/bulk', mappingController.bulkUploadMappings);

  // 대시보드 관련 라우트
  router.get('/dashboard/stats', dashboardController.getStats);
  router.get('/dashboard/recent-activity', dashboardController.getRecentActivity);
  router.get('/dashboard/charts/sales', dashboardController.getSalesChartData);
  router.get('/dashboard/charts/inventory', dashboardController.getInventoryChartData);

  return router;
}

export default createApiRouter;