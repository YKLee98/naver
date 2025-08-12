// packages/backend/src/routes/dashboard.routes.ts
import { Router } from 'express';
import { ServiceContainer } from '../services/ServiceContainer.js';
import { authenticate } from '../middlewares/auth.middleware.js';
import { logger } from '../utils/logger.js';

export function setupDashboardRoutes(services?: ServiceContainer): Router {
  const router = Router();

  // Apply authentication to all dashboard routes
  router.use(authenticate);

  // If DashboardController exists, use it
  if (services?.dashboardController) {
    const ctrl = services.dashboardController;

    // Statistics
    router.get('/statistics', ctrl.getStatistics.bind(ctrl));
    router.get('/statistics/:type', ctrl.getStatisticsByType.bind(ctrl));

    // Activities
    router.get('/activities', ctrl.getRecentActivities.bind(ctrl));
    router.get('/activities/:id', ctrl.getActivityById.bind(ctrl));

    // Charts
    router.get('/charts/sales', ctrl.getSalesChart.bind(ctrl));
    router.get('/charts/inventory', ctrl.getInventoryChart.bind(ctrl));
    router.get('/charts/sync', ctrl.getSyncChart.bind(ctrl));
    router.get('/charts/trends', ctrl.getTrendsChart.bind(ctrl));

    // Summary
    router.get('/summary', ctrl.getSummary.bind(ctrl));
    router.get('/alerts', ctrl.getAlerts.bind(ctrl));
    router.get('/quick-stats', ctrl.getQuickStats.bind(ctrl));

    // Widgets
    router.get(
      '/widgets',
      ctrl.getWidgets?.bind(ctrl) || defaultWidgetsHandler
    );
    router.get(
      '/widgets/:widgetId',
      ctrl.getWidget?.bind(ctrl) || defaultWidgetHandler
    );

    logger.info('✅ Dashboard routes initialized with controller');
  } else {
    // Fallback routes if controller is not available
    router.get('/statistics', defaultStatisticsHandler);
    router.get('/statistics/:type', defaultStatisticsTypeHandler);
    router.get('/activities', defaultActivitiesHandler);
    router.get('/activities/:id', defaultActivityHandler);
    router.get('/charts/sales', defaultSalesChartHandler);
    router.get('/charts/inventory', defaultInventoryChartHandler);
    router.get('/charts/sync', defaultSyncChartHandler);
    router.get('/charts/trends', defaultTrendsChartHandler);
    router.get('/summary', defaultSummaryHandler);
    router.get('/alerts', defaultAlertsHandler);
    router.get('/quick-stats', defaultQuickStatsHandler);
    router.get('/widgets', defaultWidgetsHandler);
    router.get('/widgets/:widgetId', defaultWidgetHandler);

    logger.warn('Dashboard routes initialized with default handlers');
  }

  return router;
}

// Default handlers when controller is not available
async function defaultStatisticsHandler(req: any, res: any) {
  try {
    const { ProductMapping, Activity, SyncJob } = await import(
      '../models/index.js'
    );

    const [totalProducts, activeProducts, totalActivities, totalSyncs] =
      await Promise.all([
        ProductMapping.countDocuments(),
        ProductMapping.countDocuments({ isActive: true }),
        Activity.countDocuments(),
        SyncJob.countDocuments(),
      ]);

    res.json({
      success: true,
      data: {
        products: {
          total: totalProducts,
          active: activeProducts,
        },
        activities: {
          total: totalActivities,
        },
        syncs: {
          total: totalSyncs,
        },
      },
    });
  } catch (error) {
    logger.error('Get statistics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get statistics',
    });
  }
}

async function defaultStatisticsTypeHandler(req: any, res: any) {
  try {
    const { type } = req.params;
    const { ProductMapping, Activity, SyncJob, InventoryTransaction } =
      await import('../models/index.js');

    let data: any = {};

    switch (type) {
      case 'products':
        const [total, active, synced, error] = await Promise.all([
          ProductMapping.countDocuments(),
          ProductMapping.countDocuments({ isActive: true }),
          ProductMapping.countDocuments({ syncStatus: 'synced' }),
          ProductMapping.countDocuments({ syncStatus: 'error' }),
        ]);
        data = { total, active, synced, error };
        break;

      case 'inventory':
        const [transactions, lowStock, outOfStock] = await Promise.all([
          InventoryTransaction.countDocuments(),
          ProductMapping.countDocuments({
            $or: [
              { 'inventory.naver.available': { $lt: 10 } },
              { 'inventory.shopify.available': { $lt: 10 } },
            ],
          }),
          ProductMapping.countDocuments({
            $or: [
              { 'inventory.naver.available': 0 },
              { 'inventory.shopify.available': 0 },
            ],
          }),
        ]);
        data = { transactions, lowStock, outOfStock };
        break;

      case 'sync':
        const [totalSyncs, completedSyncs, failedSyncs, pendingSyncs] =
          await Promise.all([
            SyncJob.countDocuments(),
            SyncJob.countDocuments({ status: 'completed' }),
            SyncJob.countDocuments({ status: 'failed' }),
            SyncJob.countDocuments({ status: 'pending' }),
          ]);
        data = {
          total: totalSyncs,
          completed: completedSyncs,
          failed: failedSyncs,
          pending: pendingSyncs,
        };
        break;

      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid statistics type',
        });
    }

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    logger.error('Get statistics by type error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get statistics',
    });
  }
}

async function defaultActivitiesHandler(req: any, res: any) {
  try {
    const { Activity } = await import('../models/index.js');
    const { limit = 50, offset = 0 } = req.query;

    const activities = await Activity.find()
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip(Number(offset))
      .lean();

    const total = await Activity.countDocuments();

    res.json({
      success: true,
      data: activities,
      pagination: {
        total,
        limit: Number(limit),
        offset: Number(offset),
      },
    });
  } catch (error) {
    logger.error('Get activities error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get activities',
    });
  }
}

async function defaultActivityHandler(req: any, res: any) {
  try {
    const { Activity } = await import('../models/index.js');
    const { id } = req.params;

    const activity = await Activity.findById(id).lean();

    if (!activity) {
      return res.status(404).json({
        success: false,
        error: 'Activity not found',
      });
    }

    res.json({
      success: true,
      data: activity,
    });
  } catch (error) {
    logger.error('Get activity error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get activity',
    });
  }
}

async function defaultSalesChartHandler(req: any, res: any) {
  res.json({
    success: true,
    data: {
      labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      datasets: [
        {
          label: 'Sales',
          data: [12000, 19000, 15000, 25000, 22000, 30000, 28000],
        },
      ],
    },
  });
}

async function defaultInventoryChartHandler(req: any, res: any) {
  res.json({
    success: true,
    data: {
      labels: ['In Stock', 'Low Stock', 'Out of Stock'],
      datasets: [
        {
          data: [150, 30, 5],
        },
      ],
    },
  });
}

async function defaultSyncChartHandler(req: any, res: any) {
  res.json({
    success: true,
    data: {
      labels: ['Success', 'Failed', 'Pending'],
      datasets: [
        {
          data: [85, 10, 5],
        },
      ],
    },
  });
}

async function defaultTrendsChartHandler(req: any, res: any) {
  res.json({
    success: true,
    data: {
      labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
      datasets: [
        {
          label: 'Revenue',
          data: [30000, 35000, 32000, 40000, 38000, 45000],
        },
        {
          label: 'Orders',
          data: [120, 140, 128, 160, 152, 180],
        },
      ],
    },
  });
}

async function defaultSummaryHandler(req: any, res: any) {
  res.json({
    success: true,
    data: {
      revenue: {
        today: 45000,
        week: 280000,
        month: 1200000,
      },
      orders: {
        today: 12,
        week: 85,
        month: 350,
      },
      products: {
        total: 250,
        active: 230,
        inactive: 20,
      },
      customers: {
        total: 1500,
        new: 45,
      },
    },
  });
}

async function defaultAlertsHandler(req: any, res: any) {
  res.json({
    success: true,
    data: [
      {
        id: '1',
        type: 'warning',
        title: 'Low Stock Alert',
        message: '5 products are running low on stock',
        timestamp: new Date(),
      },
      {
        id: '2',
        type: 'info',
        title: 'Sync Completed',
        message: 'Inventory sync completed successfully',
        timestamp: new Date(),
      },
    ],
  });
}

async function defaultQuickStatsHandler(req: any, res: any) {
  res.json({
    success: true,
    data: {
      todayRevenue: 45000,
      todayOrders: 12,
      activeProducts: 230,
      pendingSyncs: 2,
      lowStockItems: 5,
      newCustomers: 8,
    },
  });
}

async function defaultWidgetsHandler(req: any, res: any) {
  res.json({
    success: true,
    data: [
      {
        id: 'revenue',
        title: 'Revenue',
        type: 'stat',
        value: 45000,
        change: 12.5,
        icon: 'TrendingUp',
      },
      {
        id: 'orders',
        title: 'Orders',
        type: 'stat',
        value: 12,
        change: -5.2,
        icon: 'ShoppingCart',
      },
      {
        id: 'products',
        title: 'Products',
        type: 'stat',
        value: 230,
        change: 2.1,
        icon: 'Package',
      },
    ],
  });
}

async function defaultWidgetHandler(req: any, res: any) {
  const { widgetId } = req.params;

  const widgets: any = {
    revenue: {
      id: 'revenue',
      title: 'Revenue',
      type: 'stat',
      value: 45000,
      change: 12.5,
      icon: 'TrendingUp',
    },
    orders: {
      id: 'orders',
      title: 'Orders',
      type: 'stat',
      value: 12,
      change: -5.2,
      icon: 'ShoppingCart',
    },
  };

  const widget = widgets[widgetId];

  if (!widget) {
    return res.status(404).json({
      success: false,
      error: 'Widget not found',
    });
  }

  res.json({
    success: true,
    data: widget,
  });
}

export default setupDashboardRoutes;
