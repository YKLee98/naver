// packages/backend/src/routes/api.routes.ts
import { Router } from 'express';
import { authMiddleware } from '../middlewares/index.js';
import { logger } from '../utils/logger.js';
import { getRedisClient } from '../config/redis.js';

/**
 * Setup API routes with dynamic loading and error handling
 */
export async function setupApiRoutes(): Promise<Router> {
  const router = Router();
  const protectedRouter = Router();

  // Apply auth middleware to protected routes
  protectedRouter.use(authMiddleware);

  // Mapping routes
  try {
    const mappingModule = await import('../controllers/MappingController.js');
    const MappingController = mappingModule.MappingController;
    
    if (MappingController) {
      const syncModule = await import('../services/sync/index.js');
      const naverModule = await import('../services/naver/index.js');
      const shopifyModule = await import('../services/shopify/index.js');

      const redis = getRedisClient();
      const naverAuthService = new naverModule.NaverAuthService(redis);
      const naverProductService = new naverModule.NaverProductService(naverAuthService);
      const shopifyGraphQLService = new shopifyModule.ShopifyGraphQLService();

      const mappingService = new syncModule.MappingService(
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
      protectedRouter.get('/mappings/sku/:sku', mappingController.getMappingBySku.bind(mappingController));
      protectedRouter.get('/mappings/search/:sku', mappingController.searchProductsBySku.bind(mappingController));
      protectedRouter.get('/mappings/search-by-sku', mappingController.searchProductsBySku.bind(mappingController));
      protectedRouter.post('/mappings/auto-discover', mappingController.autoDiscoverMappings.bind(mappingController));
      protectedRouter.post('/mappings/:id/validate', mappingController.validateMapping.bind(mappingController));
      protectedRouter.post('/mappings/:id/retry', mappingController.retryPendingMapping.bind(mappingController));
      protectedRouter.post('/mappings/:id/sync', mappingController.syncMapping.bind(mappingController));
      protectedRouter.post('/mappings/bulk', mappingController.bulkUploadMappings.bind(mappingController));
      protectedRouter.get('/mappings/export', mappingController.exportMappings.bind(mappingController));
      protectedRouter.post('/mappings/import', mappingController.importMappings.bind(mappingController));
      protectedRouter.get('/mappings/stats', mappingController.getMappingStats.bind(mappingController));
      
      logger.info('✅ Mapping routes initialized');
    } else {
      logger.warn('MappingController not available');
    }
  } catch (error: any) {
    logger.error('Mapping routes setup error:', error.message);
  }

  // Product routes
  try {
    const productModule = await import('../controllers/ProductController.js');
    const ProductController = productModule.ProductController;
    
    if (ProductController) {
      const naverModule = await import('../services/naver/index.js');
      const shopifyModule = await import('../services/shopify/index.js');

      const redis = getRedisClient();
      const naverAuthService = new naverModule.NaverAuthService(redis);
      const naverProductService = new naverModule.NaverProductService(naverAuthService);
      const shopifyGraphQLService = new shopifyModule.ShopifyGraphQLService();

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
    } else {
      logger.warn('ProductController not available');
    }
  } catch (error: any) {
    logger.error('Product routes setup error:', error.message);
  }

  // Inventory routes
  try {
    const inventoryModule = await import('../controllers/InventoryController.js');
    const InventoryController = inventoryModule.InventoryController;
    
    if (InventoryController) {
      const syncModule = await import('../services/sync/index.js');
      const naverModule = await import('../services/naver/index.js');
      const shopifyModule = await import('../services/shopify/index.js');

      const redis = getRedisClient();
      const naverAuthService = new naverModule.NaverAuthService(redis);
      const naverProductService = new naverModule.NaverProductService(naverAuthService);
      const shopifyBulkService = new shopifyModule.ShopifyBulkService();

      const inventorySyncService = new syncModule.InventorySyncService(
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
    } else {
      logger.warn('InventoryController not available');
    }
  } catch (error: any) {
    logger.error('Inventory routes setup error:', error.message);
  }

  // Sync routes
  try {
    const syncControllerModule = await import('../controllers/SyncController.js');
    const SyncController = syncControllerModule.SyncController;
    
    if (SyncController) {
      const syncModule = await import('../services/sync/index.js');
      const naverModule = await import('../services/naver/index.js');
      const shopifyModule = await import('../services/shopify/index.js');

      const redis = getRedisClient();
      const naverAuthService = new naverModule.NaverAuthService(redis);
      const naverProductService = new naverModule.NaverProductService(naverAuthService);
      const naverOrderService = new naverModule.NaverOrderService(naverAuthService);
      const shopifyBulkService = new shopifyModule.ShopifyBulkService();

      const syncService = new syncModule.SyncService(
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
    } else {
      logger.warn('SyncController not available');
    }
  } catch (error: any) {
    logger.error('Sync routes setup error:', error.message);
  }

  // Dashboard routes
  try {
    const dashboardModule = await import('../controllers/DashboardController.js');
    const DashboardController = dashboardModule.DashboardController;
    
    if (DashboardController) {
      const dashboardController = new DashboardController();

      protectedRouter.get('/dashboard/statistics', dashboardController.getStatistics.bind(dashboardController));
      protectedRouter.get('/dashboard/activities', dashboardController.getRecentActivities.bind(dashboardController));
      protectedRouter.get('/dashboard/charts/price', dashboardController.getPriceChartData.bind(dashboardController));
      protectedRouter.get('/dashboard/charts/inventory', dashboardController.getInventoryChartData.bind(dashboardController));
      protectedRouter.get('/dashboard/charts/sync', dashboardController.getSyncChartData.bind(dashboardController));
      protectedRouter.get('/dashboard/alerts', dashboardController.getAlerts.bind(dashboardController));
      protectedRouter.post('/dashboard/alerts/:id/dismiss', dashboardController.dismissAlert.bind(dashboardController));
      
      logger.info('✅ Dashboard routes initialized');
    } else {
      logger.warn('DashboardController not available');
    }
  } catch (error: any) {
    logger.error('Dashboard routes setup error:', error.message);
  }

  // Analytics routes
  try {
    const analyticsModule = await import('../controllers/AnalyticsController.js');
    const AnalyticsController = analyticsModule.AnalyticsController;
    
    if (AnalyticsController) {
      const analyticsController = new AnalyticsController();

      protectedRouter.get('/analytics/overview', analyticsController.getOverview.bind(analyticsController));
      protectedRouter.get('/analytics/performance', analyticsController.getPerformanceMetrics.bind(analyticsController));
      protectedRouter.get('/analytics/trends', analyticsController.getTrends.bind(analyticsController));
      protectedRouter.get('/analytics/reports', analyticsController.getReports.bind(analyticsController));
      protectedRouter.post('/analytics/export', analyticsController.exportData.bind(analyticsController));
      
      logger.info('✅ Analytics routes initialized');
    } else {
      logger.warn('AnalyticsController not available');
    }
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
export default setupApiRoutes;