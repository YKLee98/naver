// ===== 3. packages/backend/src/routes/dashboard.routes.ts =====
import { Router } from 'express';
import { authMiddleware } from '../middlewares/index.js';
import { DashboardController } from '../controllers/index.js';
import { logger } from '../utils/logger.js';

/**
 * Setup dashboard routes with proper error handling
 */
export function setupDashboardRoutes(): Router {
  const router = Router();

  try {
    // Create controller instance
    const dashboardController = new DashboardController();

    // Apply authentication middleware
    router.use(authMiddleware);

    // Statistics endpoints
    router.get('/statistics', dashboardController.getStatistics.bind(dashboardController));
    router.get('/statistics/:type', dashboardController.getStatisticsByType.bind(dashboardController));

    // Activity endpoints  
    router.get('/activities', dashboardController.getRecentActivities.bind(dashboardController));
    router.get('/activities/:id', dashboardController.getActivityById.bind(dashboardController));

    // Chart data endpoints
    router.get('/charts/price', dashboardController.getPriceChartData.bind(dashboardController));
    router.get('/charts/inventory', dashboardController.getInventoryChartData.bind(dashboardController));
    router.get('/charts/sync', dashboardController.getSyncChartData.bind(dashboardController));
    router.get('/charts/sales', dashboardController.getSalesChartData.bind(dashboardController));
    router.get('/charts/performance', dashboardController.getPerformanceChartData.bind(dashboardController));

    // Alert endpoints
    router.get('/alerts', dashboardController.getAlerts.bind(dashboardController));
    router.get('/alerts/:id', dashboardController.getAlertById.bind(dashboardController));
    router.post('/alerts/:id/dismiss', dashboardController.dismissAlert.bind(dashboardController));
    router.post('/alerts/:id/acknowledge', dashboardController.acknowledgeAlert.bind(dashboardController));

    // Widget data endpoints
    router.get('/widgets', dashboardController.getWidgets.bind(dashboardController));
    router.get('/widgets/:widgetId', dashboardController.getWidgetData.bind(dashboardController));
    router.post('/widgets/:widgetId/refresh', dashboardController.refreshWidget.bind(dashboardController));

    // Custom dashboard configuration
    router.get('/config', dashboardController.getDashboardConfig.bind(dashboardController));
    router.put('/config', dashboardController.updateDashboardConfig.bind(dashboardController));
    router.post('/config/reset', dashboardController.resetDashboardConfig.bind(dashboardController));

    // Export functionality
    router.post('/export', dashboardController.exportDashboardData.bind(dashboardController));
    router.get('/export/:exportId/status', dashboardController.getExportStatus.bind(dashboardController));
    router.get('/export/:exportId/download', dashboardController.downloadExport.bind(dashboardController));

    logger.info('Dashboard routes initialized successfully');
  } catch (error: any) {
    logger.error('Failed to initialize dashboard routes:', error);
    
    // Return router with error endpoint
    router.use('*', (req, res) => {
      res.status(500).json({
        success: false,
        error: 'Dashboard service temporarily unavailable',
        message: error.message
      });
    });
  }

  return router;
}

// Default export for backward compatibility
export default setupDashboardRoutes();
