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
  MappingService,
  PriceSyncService
} from '../services/sync';
import { getRedisClient } from '../config/redis';

const router = Router();

// 서비스 인스턴스 생성
const redis = getRedisClient();
const naverAuthService = new NaverAuthService(redis);
const naverProductService = new NaverProductService(naverAuthService);
const naverOrderService = new NaverOrderService(naverAuthService);
const shopifyGraphQLService = new ShopifyGraphQLService();
const shopifyBulkService = new ShopifyBulkService();

const syncService = new SyncService(
  naverProductService,
  naverOrderService,
  shopifyBulkService,
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
router.post('/mappings', mappingController.createMapping);
router.put('/mappings/:id', mappingController.updateMapping);
router.delete('/mappings/:id', mappingController.deleteMapping);
router.post('/mappings/auto-discover', mappingController.autoDiscoverMappings);
router.post('/mappings/:id/validate', mappingController.validateMapping);
router.post('/mappings/bulk', mappingController.bulkUploadMappings);

// 대시보드 관련 라우트
router.get('/dashboard/statistics', dashboardController.getStatistics);
router.get('/dashboard/activities', dashboardController.getRecentActivities);
router.get('/dashboard/charts/price', dashboardController.getPriceChartData);
router.get('/dashboard/charts/inventory', dashboardController.getInventoryChartData);

export default router;


