// packages/backend/src/routes/api.routes.ts
import { Router } from 'express';
import { authMiddleware } from '../middlewares';
import { logger } from '../utils/logger';

/**
 * Setup API routes with dynamic loading and error handling
 * This approach prevents import errors and allows graceful degradation
 */
export function setupApiRoutes(): Router {
  const router = Router();
  const protectedRouter = Router();

  // Apply auth middleware to protected routes
  protectedRouter.use(authMiddleware);

  // Mapping routes
  try {
    const { MappingController } = require('../controllers');
    const { MappingService } = require('../services/sync');
    const { NaverAuthService, NaverProductService } = require('../services/naver');
    const { ShopifyGraphQLService } = require('../services/shopify');
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

    // Bind methods to maintain context
    protectedRouter.post('/mappings', mappingController.createMapping.bind(mappingController));
    protectedRouter.put('/mappings/:id', mappingController.updateMapping.bind(mappingController));
    protectedRouter.delete('/mappings/:id', mappingController.deleteMapping.bind(mappingController));
    protectedRouter.get('/mappings', mappingController.getAllMappings.bind(mappingController));
    protectedRouter.get('/mappings/:id', mappingController.getMappingById.bind(mappingController));
    protectedRouter.post('/mappings/auto-discover', mappingController.autoDiscoverMappings.bind(mappingController));
    protectedRouter.post('/mappings/:id/validate', mappingController.validateMapping.bind(mappingController));
    protectedRouter.post('/mappings/bulk', mappingController.bulkUploadMappings.bind(mappingController));
    
    logger.info('✅ Mapping routes initialized');
  } catch (error: any) {
    logger.error('Mapping routes setup error:', error.message);
  }

  // Product routes
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
    protectedRouter.post('/products/sync/:sku', productController.syncProduct.bind(productController));
    protectedRouter.post('/products/bulk-sync', productController.bulkSyncProducts.bind(productController));
    
    logger.info('✅ Product routes initialized');
  } catch (error: any) {
    logger.error('Product routes setup error:', error.message);
  }

  // Inventory routes
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

    protectedRouter.get('/inventory/status', inventoryController.getAllInventoryStatus.bind(inventoryController));
    protectedRouter.get('/inventory/:sku/status', inventoryController.getInventoryStatus.bind(inventoryController));
    protectedRouter.get('/inventory/:sku/history', inventoryController.getInventoryHistory.bind(inventoryController));
    protectedRouter.post('/inventory/:sku/adjust', inventoryController.adjustInventory.bind(inventoryController));
    protectedRouter.get('/inventory/low-stock', inventoryController.getLowStockProducts.bind(inventoryController));
    protectedRouter.get('/inventory/out-of-stock', inventoryController.getOutOfStockProducts.bind(inventoryController));
    protectedRouter.post('/inventory/bulk-adjust', inventoryController.bulkAdjustInventory.bind(inventoryController));
    protectedRouter.get('/inventory/discrepancies', inventoryController.getInventoryDiscrepancies.bind(inventoryController));
    
    logger.info('✅ Inventory routes initialized');
  } catch (error: any) {
    logger.error('Inventory routes setup error:', error.message);
  }

  // Sync routes
  try {
    const { SyncController } = require('../controllers');
    const { SyncService } = require('../services/sync');
    const { NaverAuthService, NaverProductService, NaverOrderService } = require('../services/naver');
    const { ShopifyBulkService } = require('../services/shopify');
    const { getRedisClient } = require('../config/redis');

    const redis = getRedisClient();
    const naverAuthService = new NaverAuthService(redis);
    const naverProductService = new NaverProductService(naverAuthService);
    const naverOrderService = new NaverOrderService(naverAuthService);
    const shopifyBulkService = new ShopifyBulkService();

    const syncService = new SyncService(
      naverProductService,
      naverOrderService,
      shopifyBulkService,
      redis
    );

    const syncController = new SyncController(syncService);

    protectedRouter.post('/sync/full', syncController.performFullSync.bind(syncController));
    protectedRouter.post('/sync/sku/:sku', syncController.syncSingleSku.bind(syncController));
    protectedRouter.get('/sync/status', syncController.getSyncStatus.bind(syncController));
    protectedRouter.get('/sync/settings', syncController.getSyncSettings.bind(syncController));
    protectedRouter.put('/sync/settings', syncController.updateSyncSettings.bind(syncController));
    protectedRouter.get('/sync/history', syncController.getSyncHistory.bind(syncController));
    protectedRouter.post('/sync/retry/:jobId', syncController.retrySyncJob.bind(syncController));
    protectedRouter.post('/sync/cancel/:jobId', syncController.cancelSyncJob.bind(syncController));
    
    logger.info('✅ Sync routes initialized');
  } catch (error: any) {
    logger.error('Sync routes setup error:', error.message);
  }

  // Dashboard routes (kept separate for better organization)
  try {
    const { DashboardController } = require('../controllers');
    const dashboardController = new DashboardController();

    protectedRouter.get('/dashboard/statistics', dashboardController.getStatistics.bind(dashboardController));
    protectedRouter.get('/dashboard/activities', dashboardController.getRecentActivities.bind(dashboardController));
    protectedRouter.get('/dashboard/charts/price', dashboardController.getPriceChartData.bind(dashboardController));
    protectedRouter.get('/dashboard/charts/inventory', dashboardController.getInventoryChartData.bind(dashboardController));
    protectedRouter.get('/dashboard/charts/sync', dashboardController.getSyncChartData.bind(dashboardController));
    protectedRouter.get('/dashboard/alerts', dashboardController.getAlerts.bind(dashboardController));
    protectedRouter.post('/dashboard/alerts/:id/dismiss', dashboardController.dismissAlert.bind(dashboardController));
    
    logger.info('✅ Dashboard routes initialized');
  } catch (error: any) {
    logger.error('Dashboard routes setup error:', error.message);
  }

  // Analytics routes
  try {
    const { AnalyticsController } = require('../controllers');
    const analyticsController = new AnalyticsController();

    protectedRouter.get('/analytics/overview', analyticsController.getOverview.bind(analyticsController));
    protectedRouter.get('/analytics/performance', analyticsController.getPerformanceMetrics.bind(analyticsController));
    protectedRouter.get('/analytics/trends', analyticsController.getTrends.bind(analyticsController));
    protectedRouter.get('/analytics/reports', analyticsController.getReports.bind(analyticsController));
    protectedRouter.post('/analytics/export', analyticsController.exportData.bind(analyticsController));
    
    logger.info('✅ Analytics routes initialized');
  } catch (error: any) {
    logger.warn('Analytics routes not available:', error.message);
  }

  // Add all protected routes to main router
  router.use('/', protectedRouter);

  // Add health check endpoint (no auth)
  router.get('/status', (req, res) => {
    res.json({
      status: 'operational',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0'
    });
  });

  return router;
}

// Default export for compatibility
export default setupApiRoutes();