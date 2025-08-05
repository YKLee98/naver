// packages/backend/src/routes/api.routes.ts
import { Router } from 'express';
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
import { initializeRedis } from '../config/redis';

// 라우터 설정 함수로 export
export function setupApiRoutes(): Router {
  const router = Router();

  // 서비스 인스턴스 생성 - Redis가 초기화된 후에 실행됨
  const redis = initializeRedis();
  
  // Naver 서비스 초기화
  const naverAuthService = new NaverAuthService(redis);
  const naverProductService = new NaverProductService(naverAuthService);
  const naverOrderService = new NaverOrderService(naverAuthService);
  
  // Shopify 서비스 초기화
  const shopifyGraphQLService = new ShopifyGraphQLService();
  const shopifyBulkService = new ShopifyBulkService();

  // 동기화 서비스 초기화
  const inventorySyncService = new InventorySyncService(
    naverProductService,
    shopifyBulkService
  );

  const syncService = new SyncService(
    naverProductService,
    naverOrderService,
    shopifyBulkService,
    shopifyGraphQLService,
    redis
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
  
  // SyncController에 두 개의 서비스 전달
  const syncController = new SyncController(
    syncService,
    inventorySyncService
  );
  
  const mappingController = new MappingController(mappingService);
  const dashboardController = new DashboardController();

  // 인증 미들웨어 적용
  router.use(authMiddleware);

  // 상품 관련 라우트
  router.get('/products', productController.getMappedProducts);
  router.get('/products/:sku', productController.getProductBySku);
  router.get('/products/search/naver', productController.searchNaverProducts);
  router.get('/products/search/shopify', productController.searchShopifyProducts);

  // 재고 관련 라우트 - 순서 중요! 구체적인 경로가 먼저 와야 함
  router.get('/inventory/status', inventoryController.getInventoryStatusList);
  router.get('/inventory/low-stock', inventoryController.getLowStockProducts);
  router.get('/inventory/:sku/status', inventoryController.getInventoryStatus);
  router.get('/inventory/:sku/history', inventoryController.getInventoryHistory);
  router.post('/inventory/:sku/adjust', inventoryController.adjustInventory);

  // 동기화 관련 라우트
  router.post('/sync/full', syncController.performFullSync);
  router.post('/sync/inventory', syncController.syncInventory); // 누락된 라우트 추가!
  router.post('/sync/sku/:sku', syncController.syncSingleSku);
  router.get('/sync/status', syncController.getSyncStatus);
  router.get('/sync/settings', syncController.getSyncSettings);
  router.put('/sync/settings', syncController.updateSyncSettings);
  router.get('/sync/history', syncController.getSyncHistory);

  // 매핑 관련 라우트
  router.get('/mappings', mappingController.getMappings);
  router.post('/mappings', mappingController.createMapping);
  router.put('/mappings/:id', mappingController.updateMapping);
  router.delete('/mappings/:id', mappingController.deleteMapping);
  router.post('/mappings/auto-discover', mappingController.autoDiscoverMappings);
  router.post('/mappings/:id/validate', mappingController.validateMapping);
  router.post('/mappings/bulk', mappingController.bulkUploadMappings);
  router.get('/mappings/template', mappingController.downloadTemplate);

  // 대시보드 관련 라우트 - 별도 설정 필요 없음 (dashboard.routes.ts에서 처리)

  return router;
}

// 기본 export도 제공 (호환성)
export default setupApiRoutes();