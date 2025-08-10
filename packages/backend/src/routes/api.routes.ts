// packages/backend/src/routes/api.routes.ts
import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import { ServiceContainer } from '../services/ServiceContainer.js';
import { logger } from '../utils/logger.js';

export function setupApiRoutes(container?: ServiceContainer): Router {
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
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0'
    });
  });

  // Health check endpoint
  router.get('/health', (req, res) => {
    res.json({
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString()
    });
  });

  // Setup routes after container is available
  const setupContainerRoutes = (serviceContainer: ServiceContainer) => {
    logger.info('🔗 Setting up API routes with service container...');

    // ============================================
    // DASHBOARD ROUTES
    // ============================================
    if (serviceContainer.dashboardController) {
      const ctrl = serviceContainer.dashboardController;
      
      // Statistics
      protectedRouter.get('/dashboard/statistics', ctrl.getStatistics.bind(ctrl));
      protectedRouter.get('/dashboard/statistics/:type', ctrl.getStatisticsByType.bind(ctrl));
      
      // Activities
      protectedRouter.get('/dashboard/activities', ctrl.getRecentActivities.bind(ctrl));
      protectedRouter.get('/dashboard/activities/:id', ctrl.getActivityById.bind(ctrl));
      
      // Charts
      protectedRouter.get('/dashboard/charts/sales', ctrl.getSalesChart.bind(ctrl));
      protectedRouter.get('/dashboard/charts/inventory', ctrl.getInventoryChart.bind(ctrl));
      protectedRouter.get('/dashboard/charts/sync', ctrl.getSyncChart.bind(ctrl));
      protectedRouter.get('/dashboard/charts/trends', ctrl.getTrendsChart.bind(ctrl));
      
      // Summary
      protectedRouter.get('/dashboard/summary', ctrl.getSummary.bind(ctrl));
      protectedRouter.get('/dashboard/alerts', ctrl.getAlerts.bind(ctrl));
      protectedRouter.get('/dashboard/quick-stats', ctrl.getQuickStats.bind(ctrl));
      
      logger.info('✅ Dashboard routes registered');
    }

    // ============================================
    // PRODUCT ROUTES
    // ============================================
    if (serviceContainer.productController) {
      const ctrl = serviceContainer.productController;
      
      protectedRouter.get('/products', ctrl.getProducts.bind(ctrl));
      protectedRouter.get('/products/:sku', ctrl.getProductBySku.bind(ctrl));
      protectedRouter.post('/products', ctrl.createProduct.bind(ctrl));
      protectedRouter.put('/products/:sku', ctrl.updateProduct.bind(ctrl));
      protectedRouter.delete('/products/:sku', ctrl.deleteProduct.bind(ctrl));
      protectedRouter.get('/products/search/naver', ctrl.searchNaverProducts.bind(ctrl));
      protectedRouter.get('/products/search/shopify', ctrl.searchShopifyProducts.bind(ctrl));
      protectedRouter.post('/products/bulk-update', ctrl.bulkUpdateProducts.bind(ctrl));
      protectedRouter.get('/products/export/csv', ctrl.exportProducts.bind(ctrl));
      
      logger.info('✅ Product routes registered');
    }

    // ============================================
    // MAPPING ROUTES
    // ============================================
    if (serviceContainer.mappingController) {
      const ctrl = serviceContainer.mappingController;
      
      protectedRouter.get('/mappings', ctrl.getMappings.bind(ctrl));
      protectedRouter.get('/mappings/:id', ctrl.getMappingById.bind(ctrl));
      protectedRouter.post('/mappings', ctrl.createMapping.bind(ctrl));
      protectedRouter.put('/mappings/:id', ctrl.updateMapping.bind(ctrl));
      protectedRouter.delete('/mappings/:id', ctrl.deleteMapping.bind(ctrl));
      protectedRouter.post('/mappings/bulk', ctrl.bulkCreateMappings.bind(ctrl));
      protectedRouter.post('/mappings/bulk-upload', ctrl.bulkUploadMappings.bind(ctrl));
      protectedRouter.post('/mappings/:id/toggle', ctrl.toggleMapping.bind(ctrl));
      protectedRouter.post('/mappings/:id/validate', ctrl.validateMapping.bind(ctrl));
      protectedRouter.post('/mappings/auto-discover', ctrl.autoDiscoverMappings.bind(ctrl));
      protectedRouter.post('/mappings/search-shopify', ctrl.searchShopifyProducts.bind(ctrl));
      protectedRouter.post('/mappings/auto-search', ctrl.autoSearchAndMap.bind(ctrl));
      protectedRouter.get('/mappings/export/csv', ctrl.exportMappings.bind(ctrl));
      protectedRouter.get('/mappings/template/download', ctrl.downloadTemplate.bind(ctrl));
      
      logger.info('✅ Mapping routes registered');
    }

    // ============================================
    // INVENTORY ROUTES
    // ============================================
    if (serviceContainer.inventoryController) {
      const ctrl = serviceContainer.inventoryController;
      
      // Main inventory endpoints
      protectedRouter.get('/inventory', ctrl.getAllInventoryStatus.bind(ctrl));
      protectedRouter.get('/inventory/status', ctrl.getAllInventoryStatus.bind(ctrl));
      protectedRouter.get('/inventory/:sku', ctrl.getInventoryBySku.bind(ctrl));
      protectedRouter.get('/inventory/:sku/status', ctrl.getInventoryStatus.bind(ctrl));
      protectedRouter.get('/inventory/:sku/history', ctrl.getInventoryHistory.bind(ctrl));
      
      // Sync endpoints
      protectedRouter.post('/inventory/sync', ctrl.syncAllInventory.bind(ctrl));
      protectedRouter.post('/inventory/sync/:sku', ctrl.syncInventoryBySku.bind(ctrl));
      
      // Update endpoints
      protectedRouter.put('/inventory/:sku', ctrl.updateInventory.bind(ctrl));
      protectedRouter.post('/inventory/:sku/adjust', ctrl.adjustInventory.bind(ctrl));
      
      // Analysis endpoints
      protectedRouter.get('/inventory/discrepancies', ctrl.getDiscrepancies.bind(ctrl));
      protectedRouter.post('/inventory/discrepancies/:sku/resolve', ctrl.resolveDiscrepancy.bind(ctrl));
      protectedRouter.get('/inventory/low-stock', ctrl.getLowStockProducts.bind(ctrl));
      protectedRouter.get('/inventory/transactions', ctrl.getTransactions.bind(ctrl));
      
      logger.info('✅ Inventory routes registered');
    }

    // ============================================
    // SYNC ROUTES
    // ============================================
    if (serviceContainer.syncController) {
      const ctrl = serviceContainer.syncController;
      
      protectedRouter.post('/sync/full', ctrl.performFullSync.bind(ctrl));
      protectedRouter.post('/sync/prices', ctrl.syncPrices?.bind(ctrl) || ((req, res) => res.status(501).json({ error: 'Not implemented' })));
      protectedRouter.post('/sync/inventory', ctrl.syncInventory?.bind(ctrl) || ((req, res) => res.status(501).json({ error: 'Not implemented' })));
      protectedRouter.get('/sync/status', ctrl.getSyncStatus.bind(ctrl));
      protectedRouter.get('/sync/status/:jobId', ctrl.getSyncJobStatus?.bind(ctrl) || ((req, res) => res.status(501).json({ error: 'Not implemented' })));
      protectedRouter.get('/sync/history', ctrl.getSyncHistory.bind(ctrl));
      protectedRouter.post('/sync/sku/:sku', ctrl.syncSingleSku.bind(ctrl));
      protectedRouter.post('/sync/retry/:jobId', ctrl.retrySyncJob.bind(ctrl));
      protectedRouter.post('/sync/cancel/:jobId', ctrl.cancelSyncJob.bind(ctrl));
      protectedRouter.get('/sync/settings', ctrl.getSyncSettings.bind(ctrl));
      protectedRouter.put('/sync/settings', ctrl.updateSyncSettings.bind(ctrl));
      
      logger.info('✅ Sync routes registered');
    }

    // ============================================
    // PRICE ROUTES (Optional)
    // ============================================
    if (serviceContainer.priceController) {
      const ctrl = serviceContainer.priceController;
      
      protectedRouter.get('/prices', ctrl.getPrices.bind(ctrl));
      protectedRouter.get('/prices/:sku', ctrl.getPriceBySku.bind(ctrl));
      protectedRouter.put('/prices/:sku', ctrl.updatePrice.bind(ctrl));
      protectedRouter.post('/prices/bulk-update', ctrl.bulkUpdatePrices.bind(ctrl));
      protectedRouter.get('/prices/history/:sku', ctrl.getPriceHistory.bind(ctrl));
      protectedRouter.post('/prices/calculate', ctrl.calculatePrice.bind(ctrl));
      protectedRouter.get('/prices/discrepancies', ctrl.getPriceDiscrepancies.bind(ctrl));
      protectedRouter.post('/prices/sync', ctrl.syncPrices.bind(ctrl));
      protectedRouter.post('/prices/sync/:sku', ctrl.syncPriceBySku.bind(ctrl));
      protectedRouter.get('/prices/rules', ctrl.getPriceRules.bind(ctrl));
      protectedRouter.post('/prices/rules', ctrl.createPriceRule.bind(ctrl));
      protectedRouter.put('/prices/rules/:id', ctrl.updatePriceRule.bind(ctrl));
      protectedRouter.delete('/prices/rules/:id', ctrl.deletePriceRule.bind(ctrl));
      
      logger.info('✅ Price routes registered');
    }

    // ============================================
    // ANALYTICS ROUTES (Optional)
    // ============================================
    if (serviceContainer.analyticsController) {
      const ctrl = serviceContainer.analyticsController;
      
      protectedRouter.get('/analytics/overview', ctrl.getOverview.bind(ctrl));
      protectedRouter.get('/analytics/performance', ctrl.getPerformanceMetrics.bind(ctrl));
      protectedRouter.get('/analytics/trends', ctrl.getTrends.bind(ctrl));
      protectedRouter.get('/analytics/reports', ctrl.getReports.bind(ctrl));
      protectedRouter.post('/analytics/reports/generate', ctrl.generateReport.bind(ctrl));
      protectedRouter.get('/analytics/reports/:id', ctrl.getReportById.bind(ctrl));
      protectedRouter.get('/analytics/reports/:id/download', ctrl.downloadReport.bind(ctrl));
      
      logger.info('✅ Analytics routes registered');
    }

    // ============================================
    // SETTINGS ROUTES (Optional)
    // ============================================
    if (serviceContainer.settingsController) {
      const ctrl = serviceContainer.settingsController;
      
      protectedRouter.get('/settings', ctrl.getSettings.bind(ctrl));
      protectedRouter.put('/settings', ctrl.updateSettings.bind(ctrl));
      protectedRouter.get('/settings/:key', ctrl.getSettingByKey.bind(ctrl));
      protectedRouter.put('/settings/:key', ctrl.updateSettingByKey.bind(ctrl));
      protectedRouter.post('/settings/reset', ctrl.resetSettings.bind(ctrl));
      protectedRouter.get('/settings/export', ctrl.exportSettings.bind(ctrl));
      protectedRouter.post('/settings/import', ctrl.importSettings.bind(ctrl));
      
      logger.info('✅ Settings routes registered');
    }

    // ============================================
    // NOTIFICATION ROUTES (Optional)
    // ============================================
    if (serviceContainer.notificationController) {
      const ctrl = serviceContainer.notificationController;
      
      protectedRouter.get('/notifications', ctrl.getNotifications.bind(ctrl));
      protectedRouter.post('/notifications/:id/read', ctrl.markAsRead.bind(ctrl));
      protectedRouter.delete('/notifications/:id', ctrl.deleteNotification.bind(ctrl));
      protectedRouter.post('/notifications/test', ctrl.sendTestNotification.bind(ctrl));
      
      logger.info('✅ Notification routes registered');
    }

    // ============================================
    // REPORT ROUTES (Optional)
    // ============================================
    if (serviceContainer.reportController) {
      const ctrl = serviceContainer.reportController;
      
      protectedRouter.get('/reports', ctrl.getReports.bind(ctrl));
      protectedRouter.post('/reports/generate', ctrl.generateReport.bind(ctrl));
      protectedRouter.get('/reports/:id', ctrl.getReportById.bind(ctrl));
      protectedRouter.get('/reports/:id/download', ctrl.downloadReport.bind(ctrl));
      protectedRouter.delete('/reports/:id', ctrl.deleteReport.bind(ctrl));
      
      logger.info('✅ Report routes registered');
    }

    // ============================================
    // WEBHOOK ROUTES (Public - no auth required)
    // ============================================
    if (serviceContainer.webhookController) {
      const ctrl = serviceContainer.webhookController;
      
      router.post('/webhooks/naver', ctrl.handleNaverWebhook.bind(ctrl));
      router.post('/webhooks/shopify', ctrl.handleShopifyWebhook.bind(ctrl));
      
      logger.info('✅ Webhook routes registered');
    }

    // ============================================
    // SHOPIFY WEBHOOK ROUTES (Public - with HMAC validation)
    // ============================================
    if (serviceContainer.shopifyWebhookController) {
      const ctrl = serviceContainer.shopifyWebhookController;
      
      router.post('/webhooks/shopify/orders/create', ctrl.handleOrderCreate.bind(ctrl));
      router.post('/webhooks/shopify/orders/update', ctrl.handleOrderUpdate.bind(ctrl));
      router.post('/webhooks/shopify/orders/cancel', ctrl.handleOrderCancel.bind(ctrl));
      router.post('/webhooks/shopify/products/create', ctrl.handleProductCreate.bind(ctrl));
      router.post('/webhooks/shopify/products/update', ctrl.handleProductUpdate.bind(ctrl));
      router.post('/webhooks/shopify/products/delete', ctrl.handleProductDelete.bind(ctrl));
      router.post('/webhooks/shopify/inventory/update', ctrl.handleInventoryUpdate.bind(ctrl));
      
      logger.info('✅ Shopify webhook routes registered');
    }
  };

  // If container is provided, set up routes immediately
  if (container) {
    setupContainerRoutes(container);
  } else {
    // Defer route setup until container is available
    process.nextTick(async () => {
      try {
        const serviceContainer = ServiceContainer.getInstance();
        setupContainerRoutes(serviceContainer);
      } catch (error) {
        logger.error('Failed to get ServiceContainer for route setup:', error);
      }
    });
  }

  // Combine public and protected routes
  router.use('/', protectedRouter);

  // 404 handler for API routes
  router.use('*', (req, res) => {
    res.status(404).json({
      success: false,
      error: 'API endpoint not found',
      path: req.originalUrl
    });
  });

  return router;
}

export default setupApiRoutes;