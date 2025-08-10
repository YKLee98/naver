// packages/backend/src/routes/api.routes.ts
import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.middleware.js';
import { logger } from '../utils/logger.js';

// Controllers
import { 
  ProductController,
  InventoryController,
  SyncController,
  MappingController,
  DashboardController,
  AnalyticsController
} from '../controllers/index.js';

// Services
import { 
  NaverAuthService,
  NaverProductService,
  NaverOrderService
} from '../services/naver/index.js';
import { 
  ShopifyGraphQLService,
  ShopifyBulkService
} from '../services/shopify/index.js';
import { 
  SyncService,
  InventorySyncService,
  MappingService,
  PriceSyncService
} from '../services/sync/index.js';
import { getRedisClient } from '../config/redis.js';

/**
 * Setup API Routes with proper error handling and logging
 */
export function setupApiRoutes(): Router {
  const router = Router();
  const protectedRouter = Router();

  try {
    // Initialize Redis
    const redis = getRedisClient();
    
    // Initialize Services
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

    const priceSyncService = new PriceSyncService(
      naverProductService,
      shopifyBulkService,
      redis
    );

    // Initialize Controllers
    const productController = new ProductController(
      naverProductService,
      shopifyGraphQLService
    );
    const inventoryController = new InventoryController(inventorySyncService);
    const syncController = new SyncController(syncService);
    const mappingController = new MappingController(mappingService);
    const dashboardController = new DashboardController();
    const analyticsController = new AnalyticsController();

    // Apply authentication middleware to protected routes
    protectedRouter.use(authMiddleware);

    // ============================================
    // PRODUCT ROUTES
    // ============================================
    protectedRouter.get('/products/search/naver', productController.searchNaverProducts.bind(productController));
    protectedRouter.get('/products/search/shopify', productController.searchShopifyProducts.bind(productController));
    protectedRouter.get('/products', productController.getMappedProducts.bind(productController));
    protectedRouter.post('/products/bulk-sync', productController.bulkSyncProducts.bind(productController));
    protectedRouter.get('/products/:sku', productController.getProductBySku.bind(productController));
    protectedRouter.post('/products/sync/:sku', productController.syncProduct.bind(productController));
    
    logger.info('✅ Product routes initialized');

    // ============================================
    // INVENTORY ROUTES - FIXED
    // ============================================
    // List all inventory status (this was missing!)
    protectedRouter.get('/inventory/status', inventoryController.getAllInventoryStatus.bind(inventoryController));
    protectedRouter.get('/inventory', inventoryController.getAllInventoryStatus.bind(inventoryController));
    protectedRouter.get('/inventory/low-stock', inventoryController.getLowStockProducts.bind(inventoryController));
    protectedRouter.get('/inventory/discrepancies', inventoryController.getInventoryDiscrepancies.bind(inventoryController));
    protectedRouter.get('/inventory/metrics', inventoryController.getInventoryMetrics.bind(inventoryController));
    protectedRouter.post('/inventory/sync-all', inventoryController.syncAllInventory.bind(inventoryController));
    protectedRouter.get('/inventory/:sku/status', inventoryController.getInventoryStatus.bind(inventoryController));
    protectedRouter.get('/inventory/:sku/history', inventoryController.getInventoryHistory.bind(inventoryController));
    protectedRouter.post('/inventory/:sku/adjust', inventoryController.adjustInventory.bind(inventoryController));
    protectedRouter.post('/inventory/:sku/sync', inventoryController.syncInventory.bind(inventoryController));
    
    logger.info('✅ Inventory routes initialized');

    // ============================================
    // MAPPING ROUTES
    // ============================================
    protectedRouter.get('/mappings/export', mappingController.exportMappings.bind(mappingController));
    protectedRouter.get('/mappings/stats', mappingController.getMappingStats.bind(mappingController));
    protectedRouter.get('/mappings/search-by-sku', mappingController.searchProductsBySku.bind(mappingController));
    protectedRouter.get('/mappings/search/:sku', mappingController.searchProductsBySku.bind(mappingController));
    protectedRouter.get('/mappings/sku/:sku', mappingController.getMappingBySku.bind(mappingController));
    protectedRouter.post('/mappings/auto-discover', mappingController.autoDiscoverMappings.bind(mappingController));
    protectedRouter.post('/mappings/bulk', mappingController.bulkUploadMappings.bind(mappingController));
    protectedRouter.post('/mappings/import', mappingController.importMappings.bind(mappingController));
    protectedRouter.post('/mappings/validate', mappingController.validateMappingData.bind(mappingController));
    protectedRouter.get('/mappings', mappingController.getAllMappings.bind(mappingController));
    protectedRouter.post('/mappings', mappingController.createMapping.bind(mappingController));
    protectedRouter.get('/mappings/:id', mappingController.getMappingById.bind(mappingController));
    protectedRouter.put('/mappings/:id', mappingController.updateMapping.bind(mappingController));
    protectedRouter.delete('/mappings/:id', mappingController.deleteMapping.bind(mappingController));
    protectedRouter.post('/mappings/:id/validate', mappingController.validateMapping.bind(mappingController));
    protectedRouter.post('/mappings/:id/retry', mappingController.retryPendingMapping.bind(mappingController));
    protectedRouter.post('/mappings/:id/sync', mappingController.syncMapping.bind(mappingController));
    
    logger.info('✅ Mapping routes initialized');

    // ============================================
    // SYNC ROUTES
    // ============================================
    protectedRouter.post('/sync/full', syncController.performFullSync.bind(syncController));
    protectedRouter.get('/sync/status', syncController.getSyncStatus.bind(syncController));
    protectedRouter.get('/sync/settings', syncController.getSyncSettings.bind(syncController));
    protectedRouter.put('/sync/settings', syncController.updateSyncSettings.bind(syncController));
    protectedRouter.get('/sync/history', syncController.getSyncHistory.bind(syncController));
    protectedRouter.post('/sync/sku/:sku', syncController.syncSingleSku.bind(syncController));
    protectedRouter.post('/sync/retry/:jobId', syncController.retrySyncJob.bind(syncController));
    protectedRouter.post('/sync/cancel/:jobId', syncController.cancelSyncJob.bind(syncController));
    
    logger.info('✅ Sync routes initialized');

    // ============================================
    // DASHBOARD ROUTES - COMPLETE
    // ============================================
    protectedRouter.get('/dashboard/statistics', dashboardController.getStatistics.bind(dashboardController));
    protectedRouter.get('/dashboard/statistics/:type', dashboardController.getStatisticsByType.bind(dashboardController));
    protectedRouter.get('/dashboard/activities', dashboardController.getRecentActivities.bind(dashboardController));
    protectedRouter.get('/dashboard/activities/:id', dashboardController.getActivityById.bind(dashboardController));
    protectedRouter.get('/dashboard/charts/price', dashboardController.getPriceChartData.bind(dashboardController));
    protectedRouter.get('/dashboard/charts/inventory', dashboardController.getInventoryChartData.bind(dashboardController));
    protectedRouter.get('/dashboard/charts/sync', dashboardController.getSyncChartData.bind(dashboardController));
    protectedRouter.get('/dashboard/charts/sales', dashboardController.getSalesChartData.bind(dashboardController));
    protectedRouter.get('/dashboard/charts/performance', dashboardController.getPerformanceChartData.bind(dashboardController));
    protectedRouter.get('/dashboard/alerts', dashboardController.getAlerts.bind(dashboardController));
    protectedRouter.get('/dashboard/alerts/:id', dashboardController.getAlertById.bind(dashboardController));
    protectedRouter.post('/dashboard/alerts/:id/dismiss', dashboardController.dismissAlert.bind(dashboardController));
    protectedRouter.post('/dashboard/alerts/:id/acknowledge', dashboardController.acknowledgeAlert.bind(dashboardController));
    protectedRouter.get('/dashboard/widgets', dashboardController.getWidgets.bind(dashboardController));
    protectedRouter.get('/dashboard/widgets/:widgetId', dashboardController.getWidgetData.bind(dashboardController));
    protectedRouter.post('/dashboard/widgets/:widgetId/refresh', dashboardController.refreshWidget.bind(dashboardController));
    protectedRouter.get('/dashboard/config', dashboardController.getDashboardConfig.bind(dashboardController));
    protectedRouter.put('/dashboard/config', dashboardController.updateDashboardConfig.bind(dashboardController));
    protectedRouter.post('/dashboard/config/reset', dashboardController.resetDashboardConfig.bind(dashboardController));
    protectedRouter.post('/dashboard/export', dashboardController.exportDashboardData.bind(dashboardController));
    protectedRouter.get('/dashboard/export/:exportId/status', dashboardController.getExportStatus.bind(dashboardController));
    protectedRouter.get('/dashboard/export/:exportId/download', dashboardController.downloadExport.bind(dashboardController));
    
    logger.info('✅ Dashboard routes initialized');

    // ============================================
    // ANALYTICS ROUTES (optional)
    // ============================================
    try {
      protectedRouter.get('/analytics/overview', analyticsController.getOverview.bind(analyticsController));
      protectedRouter.get('/analytics/performance', analyticsController.getPerformanceMetrics.bind(analyticsController));
      protectedRouter.get('/analytics/trends', analyticsController.getTrends.bind(analyticsController));
      protectedRouter.get('/analytics/reports', analyticsController.getReports.bind(analyticsController));
      protectedRouter.post('/analytics/export', analyticsController.exportData.bind(analyticsController));
      
      logger.info('✅ Analytics routes initialized');
    } catch (error) {
      logger.warn('Analytics routes not available');
    }

  } catch (error) {
    logger.error('Failed to initialize routes:', error);
    throw error;
  }

  // Add all protected routes to main router
  router.use('/', protectedRouter);

  // ============================================
  // PUBLIC ROUTES (no auth required)
  // ============================================
  
  // Health check endpoint
  router.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      version: process.env.npm_package_version || '1.0.0'
    });
  });

  // Status endpoint
  router.get('/status', (req, res) => {
    res.json({
      status: 'operational',
      timestamp: new Date().toISOString(),
      services: {
        database: 'connected',
        redis: 'connected',
        api: 'running'
      }
    });
  });

  // Version endpoint
  router.get('/version', (req, res) => {
    res.json({
      version: process.env.npm_package_version || '1.0.0',
      apiVersion: 'v1',
      nodeVersion: process.version
    });
  });

  // Error handling for undefined routes
  router.use('*', (req, res) => {
    logger.warn(`404 - Route not found: ${req.method} ${req.originalUrl}`);
    res.status(404).json({
      success: false,
      error: 'Route not found',
      message: `The requested endpoint ${req.originalUrl} does not exist`,
      method: req.method,
      timestamp: new Date().toISOString()
    });
  });

  return router;
}

// Default export for compatibility
export default setupApiRoutes;