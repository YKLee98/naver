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
      version: process.env.npm_package_version || '1.0.0',
    });
  });

  // Health check endpoint
  router.get('/health', (req, res) => {
    res.json({
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
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
      protectedRouter.get('/dashboard/charts/sales', ctrl.getSalesChartData.bind(ctrl));
      protectedRouter.get('/dashboard/charts/inventory', ctrl.getInventoryChartData.bind(ctrl));
      protectedRouter.get('/dashboard/charts/sync', ctrl.getSyncChartData.bind(ctrl));
      
      // Additional dashboard endpoints
      if (ctrl.getTrendsChart) {
        protectedRouter.get('/dashboard/charts/trends', ctrl.getTrendsChart.bind(ctrl));
      }
      if (ctrl.getSummary) {
        protectedRouter.get('/dashboard/summary', ctrl.getSummary.bind(ctrl));
      }
      protectedRouter.get('/dashboard/alerts', ctrl.getAlerts.bind(ctrl));
      if (ctrl.getQuickStats) {
        protectedRouter.get('/dashboard/quick-stats', ctrl.getQuickStats.bind(ctrl));
      } else {
        protectedRouter.get('/dashboard/quick-stats', ctrl.getStatistics.bind(ctrl));
      }

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
      
      if (ctrl.syncProduct) {
        protectedRouter.post('/products/:sku/sync', ctrl.syncProduct.bind(ctrl));
      }

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
      protectedRouter.patch('/mappings/:id/toggle', ctrl.toggleMapping.bind(ctrl));
      protectedRouter.post('/mappings/:id/validate', ctrl.validateMapping.bind(ctrl));
      protectedRouter.post('/mappings/auto-discover', ctrl.autoDiscoverMappings.bind(ctrl));
      protectedRouter.get('/mappings/search-shopify', ctrl.searchShopifyProducts.bind(ctrl));
      protectedRouter.post('/mappings/auto-search', ctrl.autoSearchAndCreate.bind(ctrl));
      protectedRouter.get('/mappings/export/csv', ctrl.exportMappings.bind(ctrl));
      protectedRouter.get('/mappings/template/download', ctrl.downloadTemplate.bind(ctrl));

      logger.info('✅ Mapping routes registered');
    }

    // ============================================
    // INVENTORY ROUTES
    // ============================================
    if (serviceContainer.inventoryController) {
      const ctrl = serviceContainer.inventoryController;

      // Main inventory routes
      protectedRouter.get('/inventory', ctrl.getInventory.bind(ctrl));
      protectedRouter.get('/inventory/:sku', ctrl.getInventoryBySku.bind(ctrl));
      protectedRouter.put('/inventory/:sku', ctrl.updateInventory.bind(ctrl));
      protectedRouter.post('/inventory/:sku/adjust', ctrl.adjustInventory.bind(ctrl));
      
      // Inventory status and history
      protectedRouter.get('/inventory/:sku/status', ctrl.getInventoryStatus.bind(ctrl));
      protectedRouter.get('/inventory/:sku/history', ctrl.getInventoryHistory.bind(ctrl));
      
      // Bulk operations
      protectedRouter.post('/inventory/bulk-update', ctrl.bulkUpdateInventory.bind(ctrl));
      
      // Sync operations
      protectedRouter.post('/inventory/sync/:sku', ctrl.syncInventoryBySku.bind(ctrl));
      protectedRouter.post('/inventory/sync', ctrl.syncAllInventory.bind(ctrl));
      
      // Discrepancy management
      protectedRouter.post('/inventory/discrepancy-check', ctrl.checkDiscrepancy.bind(ctrl));
      protectedRouter.get('/inventory/discrepancies/list', ctrl.getDiscrepancies.bind(ctrl));
      protectedRouter.post('/inventory/discrepancies/resolve', ctrl.resolveDiscrepancy.bind(ctrl));
      protectedRouter.post('/inventory/discrepancies/:sku/resolve', ctrl.resolveDiscrepancy.bind(ctrl));

      logger.info('✅ Inventory routes registered');
    }

    // ============================================
    // SYNC ROUTES
    // ============================================
    if (serviceContainer.syncController) {
      const ctrl = serviceContainer.syncController;

      protectedRouter.post('/sync/all', ctrl.syncAll.bind(ctrl));
      protectedRouter.post('/sync/inventory', ctrl.syncInventory.bind(ctrl));
      protectedRouter.post('/sync/prices', ctrl.syncPrices.bind(ctrl));
      protectedRouter.post('/sync/products', ctrl.syncProducts.bind(ctrl));
      protectedRouter.post('/sync/sku/:sku', ctrl.syncSingleSku.bind(ctrl));
      protectedRouter.get('/sync/status', ctrl.getSyncStatus.bind(ctrl));
      protectedRouter.get('/sync/history', ctrl.getSyncHistory.bind(ctrl));
      protectedRouter.get('/sync/jobs', ctrl.getSyncJobs.bind(ctrl));
      protectedRouter.get('/sync/jobs/:id', ctrl.getSyncJobById.bind(ctrl));
      protectedRouter.post('/sync/jobs/:id/cancel', ctrl.cancelSyncJob.bind(ctrl));
      protectedRouter.post('/sync/jobs/:id/retry', ctrl.retrySyncJob.bind(ctrl));

      logger.info('✅ Sync routes registered');
    }

    // ============================================
    // PRICE ROUTES
    // ============================================
    if (serviceContainer.priceController) {
      const ctrl = serviceContainer.priceController;

      protectedRouter.get('/prices', ctrl.getPrices.bind(ctrl));
      protectedRouter.get('/prices/:sku', ctrl.getPriceBySku.bind(ctrl));
      protectedRouter.put('/prices/:sku', ctrl.updatePrice.bind(ctrl));
      protectedRouter.post('/prices/bulk-update', ctrl.bulkUpdatePrices.bind(ctrl));
      protectedRouter.get('/prices/discrepancies', ctrl.getPriceDiscrepancies.bind(ctrl));
      protectedRouter.get('/prices/history/:sku', ctrl.getPriceHistory.bind(ctrl));
      protectedRouter.post('/prices/calculate', ctrl.calculatePrice.bind(ctrl));
      protectedRouter.get('/prices/margins', ctrl.getMargins.bind(ctrl));
      protectedRouter.post('/prices/sync/:sku', ctrl.syncPriceBySku.bind(ctrl));

      logger.info('✅ Price routes registered');
    }

    // ============================================
    // ANALYTICS ROUTES
    // ============================================
    if (serviceContainer.analyticsController) {
      const ctrl = serviceContainer.analyticsController;

      protectedRouter.get('/analytics/overview', ctrl.getOverview.bind(ctrl));
      protectedRouter.get('/analytics/sales', ctrl.getSalesAnalytics.bind(ctrl));
      protectedRouter.get('/analytics/inventory', ctrl.getInventoryAnalytics.bind(ctrl));
      protectedRouter.get('/analytics/sync', ctrl.getSyncAnalytics.bind(ctrl));
      protectedRouter.get('/analytics/performance', ctrl.getPerformanceMetrics.bind(ctrl));
      protectedRouter.get('/analytics/trends', ctrl.getTrends.bind(ctrl));
      protectedRouter.get('/analytics/export', ctrl.exportAnalytics.bind(ctrl));

      logger.info('✅ Analytics routes registered');
    }

    // ============================================
    // SETTINGS ROUTES
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
    // NOTIFICATION ROUTES
    // ============================================
    if (serviceContainer.notificationController) {
      const ctrl = serviceContainer.notificationController;

      protectedRouter.get('/notifications', ctrl.getNotifications.bind(ctrl));
      protectedRouter.get('/notifications/:id', ctrl.getNotificationById.bind(ctrl));
      protectedRouter.patch('/notifications/:id/read', ctrl.markAsRead.bind(ctrl));
      protectedRouter.patch('/notifications/read-all', ctrl.markAllAsRead.bind(ctrl));
      protectedRouter.delete('/notifications/:id', ctrl.deleteNotification.bind(ctrl));
      protectedRouter.post('/notifications/test', ctrl.sendTestNotification.bind(ctrl));

      logger.info('✅ Notification routes registered');
    }

    // ============================================
    // REPORT ROUTES
    // ============================================
    if (serviceContainer.reportController) {
      const ctrl = serviceContainer.reportController;

      protectedRouter.get('/reports', ctrl.getReports.bind(ctrl));
      protectedRouter.get('/reports/:id', ctrl.getReportById.bind(ctrl));
      protectedRouter.post('/reports/generate', ctrl.generateReport.bind(ctrl));
      protectedRouter.get('/reports/:id/download', ctrl.downloadReport.bind(ctrl));
      protectedRouter.delete('/reports/:id', ctrl.deleteReport.bind(ctrl));
      protectedRouter.get('/reports/templates', ctrl.getReportTemplates.bind(ctrl));

      logger.info('✅ Report routes registered');
    }

    // ============================================
    // AUTH ROUTES (Public)
    // ============================================
    if (serviceContainer.authController) {
      const ctrl = serviceContainer.authController;

      router.post('/auth/login', ctrl.login.bind(ctrl));
      router.post('/auth/register', ctrl.register.bind(ctrl));
      router.post('/auth/refresh', ctrl.refreshToken.bind(ctrl));
      router.post('/auth/logout', ctrl.logout.bind(ctrl));
      router.post('/auth/forgot-password', ctrl.forgotPassword.bind(ctrl));
      router.post('/auth/reset-password', ctrl.resetPassword.bind(ctrl));
      
      // Protected auth routes
      protectedRouter.get('/auth/me', ctrl.getProfile.bind(ctrl));
      protectedRouter.put('/auth/profile', ctrl.updateProfile.bind(ctrl));
      protectedRouter.put('/auth/change-password', ctrl.changePassword.bind(ctrl));

      logger.info('✅ Auth routes registered');
    }
  };

  // Setup routes if container is provided
  if (container) {
    setupContainerRoutes(container);
  }

  // Mount protected routes
  router.use('/', protectedRouter);

  // 404 handler for API routes
  router.use((req, res) => {
    res.status(404).json({
      success: false,
      error: 'API endpoint not found',
      path: req.path,
    });
  });

  return router;
}

export default setupApiRoutes;