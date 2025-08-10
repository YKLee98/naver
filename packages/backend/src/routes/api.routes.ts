// packages/backend/src/routes/api.routes.ts
import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import { logger } from '../utils/logger.js';

// Type definitions for controllers
interface Controller {
  [key: string]: any;
}

// Dynamic controller loader with fallback
async function loadController(name: string): Promise<Controller | null> {
  try {
    const module = await import(`../controllers/${name}.js`);
    return module.default || module[name] || new module[name]();
  } catch (error) {
    logger.warn(`Controller ${name} not found, skipping routes`);
    return null;
  }
}

export function setupApiRoutes(): Router {
  const router = Router();
  const protectedRouter = Router();

  // Apply authentication middleware to protected routes
  protectedRouter.use(authenticate);

  // ============================================
  // PUBLIC ROUTES
  // ============================================
  router.get('/status', (req, res) => {
    res.json({
      success: true,
      message: 'API is running',
      timestamp: new Date().toISOString()
    });
  });

  // Load and setup routes asynchronously
  (async () => {
    // ============================================
    // DASHBOARD ROUTES (Priority - These should work)
    // ============================================
    try {
      const DashboardController = await import('../controllers/DashboardController.js');
      const dashboardController = DashboardController.default || new DashboardController.DashboardController();
      
      // Main dashboard statistics
      protectedRouter.get('/dashboard/statistics', dashboardController.getStatistics?.bind(dashboardController));
      protectedRouter.get('/dashboard/statistics/:type', dashboardController.getStatisticsByType?.bind(dashboardController));
      
      // Activities
      protectedRouter.get('/dashboard/activities', dashboardController.getRecentActivities?.bind(dashboardController));
      protectedRouter.get('/dashboard/activities/:id', dashboardController.getActivityById?.bind(dashboardController));
      
      // Charts - All chart endpoints
      protectedRouter.get('/dashboard/charts/sales', dashboardController.getSalesChartData?.bind(dashboardController));
      protectedRouter.get('/dashboard/charts/inventory', dashboardController.getInventoryChartData?.bind(dashboardController));
      protectedRouter.get('/dashboard/charts/price', dashboardController.getPriceChartData?.bind(dashboardController));
      protectedRouter.get('/dashboard/charts/sync', dashboardController.getSyncChartData?.bind(dashboardController));
      protectedRouter.get('/dashboard/charts/performance', dashboardController.getPerformanceChartData?.bind(dashboardController));
      
      // Alerts
      protectedRouter.get('/dashboard/alerts', dashboardController.getAlerts?.bind(dashboardController));
      protectedRouter.get('/dashboard/alerts/:id', dashboardController.getAlertById?.bind(dashboardController));
      protectedRouter.post('/dashboard/alerts/:id/dismiss', dashboardController.dismissAlert?.bind(dashboardController));
      protectedRouter.post('/dashboard/alerts/:id/acknowledge', dashboardController.acknowledgeAlert?.bind(dashboardController));
      
      // Widgets
      protectedRouter.get('/dashboard/widgets', dashboardController.getWidgets?.bind(dashboardController));
      protectedRouter.get('/dashboard/widgets/:widgetId', dashboardController.getWidgetData?.bind(dashboardController));
      protectedRouter.post('/dashboard/widgets/:widgetId/refresh', dashboardController.refreshWidget?.bind(dashboardController));
      
      // Configuration
      protectedRouter.get('/dashboard/config', dashboardController.getDashboardConfig?.bind(dashboardController));
      protectedRouter.put('/dashboard/config', dashboardController.updateDashboardConfig?.bind(dashboardController));
      protectedRouter.post('/dashboard/config/reset', dashboardController.resetDashboardConfig?.bind(dashboardController));
      
      // Export
      protectedRouter.post('/dashboard/export', dashboardController.exportDashboardData?.bind(dashboardController));
      protectedRouter.get('/dashboard/export/:exportId/status', dashboardController.getExportStatus?.bind(dashboardController));
      protectedRouter.get('/dashboard/export/:exportId/download', dashboardController.downloadExport?.bind(dashboardController));
      
      logger.info('✅ Dashboard routes initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize dashboard routes:', error);
    }

    // ============================================
    // MAPPING ROUTES
    // ============================================
    try {
      const MappingController = await import('../controllers/MappingController.js');
      const mappingController = MappingController.default || new MappingController.MappingController();
      
      if (mappingController) {
        protectedRouter.get('/mappings', mappingController.getMappings?.bind(mappingController));
        protectedRouter.get('/mappings/:id', mappingController.getMappingById?.bind(mappingController));
        protectedRouter.post('/mappings', mappingController.createMapping?.bind(mappingController));
        protectedRouter.put('/mappings/:id', mappingController.updateMapping?.bind(mappingController));
        protectedRouter.delete('/mappings/:id', mappingController.deleteMapping?.bind(mappingController));
        protectedRouter.post('/mappings/bulk', mappingController.bulkCreateMappings?.bind(mappingController));
        protectedRouter.post('/mappings/bulk-upload', mappingController.bulkUploadMappings?.bind(mappingController));
        protectedRouter.post('/mappings/:id/toggle', mappingController.toggleMapping?.bind(mappingController));
        protectedRouter.post('/mappings/:id/validate', mappingController.validateMapping?.bind(mappingController));
        protectedRouter.post('/mappings/auto-discover', mappingController.autoDiscoverMappings?.bind(mappingController));
        protectedRouter.post('/mappings/search-shopify', mappingController.searchShopifyProducts?.bind(mappingController));
        protectedRouter.post('/mappings/auto-search', mappingController.autoSearchAndMap?.bind(mappingController));
        protectedRouter.get('/mappings/export/csv', mappingController.exportMappings?.bind(mappingController));
        protectedRouter.get('/mappings/template/download', mappingController.downloadTemplate?.bind(mappingController));
        
        logger.info('✅ Mapping routes initialized');
      }
    } catch (error) {
      logger.warn('Mapping controller not available:', error);
    }

    // ============================================
    // INVENTORY ROUTES
    // ============================================
    try {
      const InventoryController = await import('../controllers/InventoryController.js');
      const inventoryController = InventoryController.default || new InventoryController.InventoryController();
      
      if (inventoryController) {
        protectedRouter.get('/inventory', inventoryController.getInventory?.bind(inventoryController));
        protectedRouter.get('/inventory/:sku', inventoryController.getInventoryBySku?.bind(inventoryController));
        protectedRouter.post('/inventory/sync', inventoryController.syncInventory?.bind(inventoryController));
        protectedRouter.post('/inventory/sync/:sku', inventoryController.syncInventoryBySku?.bind(inventoryController));
        protectedRouter.put('/inventory/:sku', inventoryController.updateInventory?.bind(inventoryController));
        protectedRouter.get('/inventory/history/:sku', inventoryController.getInventoryHistory?.bind(inventoryController));
        protectedRouter.get('/inventory/discrepancies', inventoryController.getDiscrepancies?.bind(inventoryController));
        protectedRouter.post('/inventory/resolve/:sku', inventoryController.resolveDiscrepancy?.bind(inventoryController));
        protectedRouter.get('/inventory/low-stock', inventoryController.getLowStockProducts?.bind(inventoryController));
        protectedRouter.get('/inventory/transactions', inventoryController.getTransactions?.bind(inventoryController));
        protectedRouter.post('/inventory/adjust/:sku', inventoryController.adjustInventory?.bind(inventoryController));
        
        logger.info('✅ Inventory routes initialized');
      }
    } catch (error) {
      logger.warn('Inventory controller not available:', error);
    }

    // ============================================
    // SYNC ROUTES
    // ============================================
    try {
      const SyncController = await import('../controllers/SyncController.js');
      const syncController = SyncController.default || new SyncController.SyncController();
      
      if (syncController) {
        protectedRouter.post('/sync/full', syncController.performFullSync?.bind(syncController));
        protectedRouter.post('/sync/prices', syncController.syncPrices?.bind(syncController));
        protectedRouter.post('/sync/inventory', syncController.syncInventory?.bind(syncController));
        protectedRouter.get('/sync/status', syncController.getSyncStatus?.bind(syncController));
        protectedRouter.get('/sync/status/:jobId', syncController.getSyncJobStatus?.bind(syncController));
        protectedRouter.get('/sync/history', syncController.getSyncHistory?.bind(syncController));
        protectedRouter.post('/sync/sku/:sku', syncController.syncSingleSku?.bind(syncController));
        protectedRouter.post('/sync/retry/:jobId', syncController.retrySyncJob?.bind(syncController));
        protectedRouter.post('/sync/cancel/:jobId', syncController.cancelSyncJob?.bind(syncController));
        protectedRouter.get('/sync/settings', syncController.getSyncSettings?.bind(syncController));
        protectedRouter.put('/sync/settings', syncController.updateSyncSettings?.bind(syncController));
        
        logger.info('✅ Sync routes initialized');
      }
    } catch (error) {
      logger.warn('Sync controller not available:', error);
    }

    // ============================================
    // PRICE ROUTES (Optional)
    // ============================================
    try {
      const PriceController = await import('../controllers/PriceController.js');
      const priceController = PriceController.default || new PriceController.PriceController();
      
      if (priceController) {
        protectedRouter.get('/prices', priceController.getPrices?.bind(priceController));
        protectedRouter.get('/prices/:sku', priceController.getPriceBySku?.bind(priceController));
        protectedRouter.put('/prices/:sku', priceController.updatePrice?.bind(priceController));
        protectedRouter.post('/prices/bulk-update', priceController.bulkUpdatePrices?.bind(priceController));
        protectedRouter.get('/prices/history/:sku', priceController.getPriceHistory?.bind(priceController));
        protectedRouter.post('/prices/calculate', priceController.calculatePrice?.bind(priceController));
        protectedRouter.get('/prices/discrepancies', priceController.getPriceDiscrepancies?.bind(priceController));
        protectedRouter.post('/prices/sync', priceController.syncPrices?.bind(priceController));
        protectedRouter.post('/prices/sync/:sku', priceController.syncPriceBySku?.bind(priceController));
        protectedRouter.get('/prices/rules', priceController.getPriceRules?.bind(priceController));
        protectedRouter.post('/prices/rules', priceController.createPriceRule?.bind(priceController));
        protectedRouter.put('/prices/rules/:id', priceController.updatePriceRule?.bind(priceController));
        protectedRouter.delete('/prices/rules/:id', priceController.deletePriceRule?.bind(priceController));
        
        logger.info('✅ Price routes initialized');
      }
    } catch (error) {
      logger.warn('Price controller not available, skipping price routes');
    }

    // ============================================
    // ANALYTICS ROUTES (Optional)
    // ============================================
    try {
      const AnalyticsController = await import('../controllers/AnalyticsController.js');
      const analyticsController = AnalyticsController.default || new AnalyticsController.AnalyticsController();
      
      if (analyticsController) {
        protectedRouter.get('/analytics/overview', analyticsController.getOverview?.bind(analyticsController));
        protectedRouter.get('/analytics/performance', analyticsController.getPerformanceMetrics?.bind(analyticsController));
        protectedRouter.get('/analytics/trends', analyticsController.getTrends?.bind(analyticsController));
        protectedRouter.get('/analytics/reports', analyticsController.getReports?.bind(analyticsController));
        protectedRouter.post('/analytics/reports/generate', analyticsController.generateReport?.bind(analyticsController));
        protectedRouter.get('/analytics/reports/:id', analyticsController.getReportById?.bind(analyticsController));
        protectedRouter.get('/analytics/reports/:id/download', analyticsController.downloadReport?.bind(analyticsController));
        
        logger.info('✅ Analytics routes initialized');
      }
    } catch (error) {
      logger.warn('Analytics controller not available, skipping analytics routes');
    }

    // ============================================
    // NOTIFICATION ROUTES (Optional)
    // ============================================
    try {
      const NotificationController = await import('../controllers/NotificationController.js');
      const notificationController = NotificationController.default || new NotificationController.NotificationController();
      
      if (notificationController) {
        protectedRouter.get('/notifications', notificationController.getNotifications?.bind(notificationController));
        protectedRouter.get('/notifications/:id', notificationController.getNotificationById?.bind(notificationController));
        protectedRouter.post('/notifications/:id/read', notificationController.markAsRead?.bind(notificationController));
        protectedRouter.post('/notifications/read-all', notificationController.markAllAsRead?.bind(notificationController));
        protectedRouter.delete('/notifications/:id', notificationController.deleteNotification?.bind(notificationController));
        protectedRouter.get('/notifications/preferences', notificationController.getPreferences?.bind(notificationController));
        protectedRouter.put('/notifications/preferences', notificationController.updatePreferences?.bind(notificationController));
        protectedRouter.post('/notifications/test', notificationController.sendTestNotification?.bind(notificationController));
        
        logger.info('✅ Notification routes initialized');
      }
    } catch (error) {
      logger.warn('Notification controller not available, skipping notification routes');
    }

    // ============================================
    // SHOPIFY WEBHOOK ROUTES (Optional)
    // ============================================
    try {
      const ShopifyWebhookController = await import('../controllers/ShopifyWebhookController.js');
      const shopifyWebhookController = ShopifyWebhookController.default || 
                                       ShopifyWebhookController.ShopifyWebhookController ? 
                                       new ShopifyWebhookController.ShopifyWebhookController() : null;
      
      if (shopifyWebhookController) {
        // These routes don't need authentication as they're webhooks from Shopify
        router.post('/webhooks/shopify/orders/create', shopifyWebhookController.handleOrderCreate?.bind(shopifyWebhookController));
        router.post('/webhooks/shopify/orders/update', shopifyWebhookController.handleOrderUpdate?.bind(shopifyWebhookController));
        router.post('/webhooks/shopify/orders/cancel', shopifyWebhookController.handleOrderCancel?.bind(shopifyWebhookController));
        router.post('/webhooks/shopify/products/create', shopifyWebhookController.handleProductCreate?.bind(shopifyWebhookController));
        router.post('/webhooks/shopify/products/update', shopifyWebhookController.handleProductUpdate?.bind(shopifyWebhookController));
        router.post('/webhooks/shopify/products/delete', shopifyWebhookController.handleProductDelete?.bind(shopifyWebhookController));
        router.post('/webhooks/shopify/inventory/update', shopifyWebhookController.handleInventoryUpdate?.bind(shopifyWebhookController));
        
        logger.info('✅ Shopify webhook routes initialized');
      }
    } catch (error) {
      logger.warn('Shopify webhook controller not available, skipping webhook routes');
    }
  })();

  // Combine public and protected routes
  router.use('/', protectedRouter);

  return router;
}

export default setupApiRoutes;