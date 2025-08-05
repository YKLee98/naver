// packages/backend/src/routes/api.routes.ts
import { Router } from 'express';
import { authMiddleware } from '../middlewares';
import authRoutes from './auth.routes';
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

  // Auth routes - 인증 불필요 (로그인, 회원가입 등)
  router.use('/auth', authRoutes);

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

  // 인증이 필요한 라우트들을 위한 별도 라우터
  const protectedRouter = Router();
  protectedRouter.use(authMiddleware);

  // 상품 관련 라우트
  protectedRouter.get('/products', productController.getMappedProducts);
  protectedRouter.get('/products/:sku', productController.getProductBySku);
  protectedRouter.get('/products/search/naver', productController.searchNaverProducts);
  protectedRouter.get('/products/search/shopify', productController.searchShopifyProducts);

  // 재고 관련 라우트 - 순서 중요! 구체적인 경로가 먼저 와야 함
  protectedRouter.get('/inventory/status', inventoryController.getInventoryStatusList);
  protectedRouter.get('/inventory/low-stock', inventoryController.getLowStockProducts);
  protectedRouter.get('/inventory/:sku/status', inventoryController.getInventoryStatus);
  protectedRouter.get('/inventory/:sku/history', inventoryController.getInventoryHistory);
  protectedRouter.post('/inventory/:sku/adjust', inventoryController.adjustInventory);

  // 동기화 관련 라우트
  protectedRouter.post('/sync/full', syncController.performFullSync);
  protectedRouter.post('/sync/inventory', syncController.syncInventory); // 누락된 라우트 추가!
  protectedRouter.post('/sync/sku/:sku', syncController.syncSingleSku);
  protectedRouter.get('/sync/status', syncController.getSyncStatus);
  protectedRouter.get('/sync/settings', syncController.getSyncSettings);
  protectedRouter.put('/sync/settings', syncController.updateSyncSettings);
  protectedRouter.get('/sync/history', syncController.getSyncHistory);

  // 매핑 관련 라우트
  protectedRouter.get('/mappings', mappingController.getMappings);
  protectedRouter.post('/mappings', mappingController.createMapping);
  protectedRouter.put('/mappings/:id', mappingController.updateMapping);
  protectedRouter.delete('/mappings/:id', mappingController.deleteMapping);
  protectedRouter.post('/mappings/auto-discover', mappingController.autoDiscoverMappings);
  protectedRouter.post('/mappings/:id/validate', mappingController.validateMapping);
  protectedRouter.post('/mappings/bulk', mappingController.bulkUploadMappings);
  protectedRouter.get('/mappings/template', mappingController.downloadTemplate);

  // 대시보드 관련 라우트 - 별도 설정 필요 없음 (dashboard.routes.ts에서 처리)

  // 인증이 필요한 라우트들을 메인 라우터에 추가
  router.use('/', protectedRouter);

  return router;
}

// 기본 export도 제공 (호환성)
export default setupApiRoutes();