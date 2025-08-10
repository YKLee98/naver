// ===== 2. packages/backend/src/controllers/DashboardController.ts =====
import { Request, Response, NextFunction } from 'express';
import { 
  PriceSyncJob,
  InventoryTransaction,
  ProductMapping,
  PriceHistory,
  Activity 
} from '../models/index.js';  // ✅ .js 확장자 포함
import { logger } from '../utils/logger.js';
import { getRedisClient } from '../config/redis.js';

export class DashboardController {
  private redis: any;

  constructor() {
    try {
      this.redis = getRedisClient();
    } catch (error) {
      logger.warn('Redis not available for DashboardController');
      this.redis = null;
    }
  }

  /**
   * Get dashboard statistics
   */
  getStatistics = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const [
        totalMappings,
        activeMappings,
        recentSync,
        inventoryDiscrepancies,
        lowStockCount
      ] = await Promise.all([
        ProductMapping.countDocuments(),
        ProductMapping.countDocuments({ isActive: true }),
        PriceSyncJob.findOne().sort({ createdAt: -1 }),
        this.getInventoryDiscrepancies(),
        this.getLowStockCount()
      ]);

      const statistics = {
        products: {
          total: totalMappings,
          active: activeMappings,
          inactive: totalMappings - activeMappings
        },
        inventory: {
          discrepancies: inventoryDiscrepancies,
          lowStock: lowStockCount,
          lastSync: recentSync?.completedAt || null
        },
        sync: {
          lastRun: recentSync?.createdAt || null,
          status: recentSync?.status || 'idle',
          successRate: await this.calculateSyncSuccessRate()
        }
      };

      res.json({
        success: true,
        data: statistics
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get statistics by type
   */
  getStatisticsByType = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { type } = req.params;
      let data;

      switch (type) {
        case 'products':
          data = await this.getProductStatistics();
          break;
        case 'inventory':
          data = await this.getInventoryStatistics();
          break;
        case 'sync':
          data = await this.getSyncStatistics();
          break;
        case 'pricing':
          data = await this.getPricingStatistics();
          break;
        default:
          res.status(400).json({
            success: false,
            error: 'Invalid statistics type'
          });
          return;
      }

      res.json({
        success: true,
        data
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get recent activities
   */
  getRecentActivities = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { limit = 50, offset = 0, type } = req.query;

      const query: any = {};
      if (type) {
        query.type = type;
      }

      const activities = await Activity.find(query)
        .sort({ createdAt: -1 })
        .limit(Number(limit))
        .skip(Number(offset))
        .lean();

      const total = await Activity.countDocuments(query);

      res.json({
        success: true,
        data: {
          activities,
          pagination: {
            limit: Number(limit),
            offset: Number(offset),
            total
          }
        }
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get activity by ID
   */
  getActivityById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const activity = await Activity.findById(id);

      if (!activity) {
        res.status(404).json({
          success: false,
          error: 'Activity not found'
        });
        return;
      }

      res.json({
        success: true,
        data: activity
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get price chart data
   */
  getPriceChartData = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { period = '7d', sku } = req.query;
      const data = await this.generatePriceChartData(period as string, sku as string);

      res.json({
        success: true,
        data
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get inventory chart data
   */
  getInventoryChartData = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { period = '7d', sku } = req.query;
      const data = await this.generateInventoryChartData(period as string, sku as string);

      res.json({
        success: true,
        data
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get sync chart data
   */
  getSyncChartData = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { period = '7d' } = req.query;
      const data = await this.generateSyncChartData(period as string);

      res.json({
        success: true,
        data
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get sales chart data
   */
  getSalesChartData = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { period = '7d', platform } = req.query;
      const data = await this.generateSalesChartData(period as string, platform as string);

      res.json({
        success: true,
        data
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get performance chart data
   */
  getPerformanceChartData = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { metric = 'response_time' } = req.query;
      const data = await this.generatePerformanceChartData(metric as string);

      res.json({
        success: true,
        data
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get alerts
   */
  getAlerts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { status = 'active', severity } = req.query;
      const alerts = await this.fetchAlerts(status as string, severity as string);

      res.json({
        success: true,
        data: alerts
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get alert by ID
   */
  getAlertById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const alert = await this.fetchAlertById(id);

      if (!alert) {
        res.status(404).json({
          success: false,
          error: 'Alert not found'
        });
        return;
      }

      res.json({
        success: true,
        data: alert
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Dismiss alert
   */
  dismissAlert = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await this.updateAlertStatus(id, 'dismissed');

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Acknowledge alert
   */
  acknowledgeAlert = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await this.updateAlertStatus(id, 'acknowledged');

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get widgets
   */
  getWidgets = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const widgets = await this.fetchWidgets();

      res.json({
        success: true,
        data: widgets
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get widget data
   */
  getWidgetData = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { widgetId } = req.params;
      const data = await this.fetchWidgetData(widgetId);

      res.json({
        success: true,
        data
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Refresh widget
   */
  refreshWidget = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { widgetId } = req.params;
      const data = await this.refreshWidgetData(widgetId);

      res.json({
        success: true,
        data
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get dashboard configuration
   */
  getDashboardConfig = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req as any).user?.id;
      const config = await this.fetchDashboardConfig(userId);

      res.json({
        success: true,
        data: config
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Update dashboard configuration
   */
  updateDashboardConfig = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req as any).user?.id;
      const config = await this.saveDashboardConfig(userId, req.body);

      res.json({
        success: true,
        data: config
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Reset dashboard configuration
   */
  resetDashboardConfig = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req as any).user?.id;
      const config = await this.resetUserDashboardConfig(userId);

      res.json({
        success: true,
        data: config
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Export dashboard data
   */
  exportDashboardData = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { format = 'json', type = 'all' } = req.body;
      const exportId = await this.createExportJob(format, type);

      res.json({
        success: true,
        data: {
          exportId,
          status: 'processing'
        }
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get export status
   */
  getExportStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { exportId } = req.params;
      const status = await this.fetchExportStatus(exportId);

      res.json({
        success: true,
        data: status
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Download export
   */
  downloadExport = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { exportId } = req.params;
      const exportData = await this.fetchExportData(exportId);

      if (!exportData) {
        res.status(404).json({
          success: false,
          error: 'Export not found or not ready'
        });
        return;
      }

      res.setHeader('Content-Type', exportData.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${exportData.filename}"`);
      res.send(exportData.data);
    } catch (error) {
      next(error);
    }
  };

  // Private helper methods

  private async getInventoryDiscrepancies(): Promise<number> {
    try {
      const mappings = await ProductMapping.find({ isActive: true });
      let discrepancies = 0;

      for (const mapping of mappings) {
        const transactions = await InventoryTransaction.find({
          sku: mapping.sku,
          syncStatus: 'failed'
        }).limit(1);

        if (transactions.length > 0) {
          discrepancies++;
        }
      }

      return discrepancies;
    } catch (error) {
      logger.error('Error getting inventory discrepancies:', error);
      return 0;
    }
  }

  private async getLowStockCount(): Promise<number> {
    try {
      const cacheKey = 'dashboard:lowStockCount';
      
      if (this.redis) {
        try {
          const cached = await this.redis.get(cacheKey);
          if (cached) {
            return parseInt(cached);
          }
        } catch (redisError) {
          logger.warn('Redis error in getLowStockCount:', redisError);
        }
      }

      const mappings = await ProductMapping.find({ 
        isActive: true,
        'inventory.shopify': { $lt: 10 }
      }).countDocuments();

      if (this.redis) {
        try {
          await this.redis.setex(cacheKey, 300, mappings.toString());
        } catch (redisError) {
          logger.warn('Redis error setting cache:', redisError);
        }
      }

      return mappings;
    } catch (error) {
      logger.error('Error getting low stock count:', error);
      return 0;
    }
  }

  private async calculateSyncSuccessRate(): Promise<number> {
    try {
      const recentJobs = await PriceSyncJob.find({
        createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
      }).select('status');

      if (recentJobs.length === 0) return 100;

      const successCount = recentJobs.filter(job => job.status === 'completed').length;
      return Math.round((successCount / recentJobs.length) * 100);
    } catch (error) {
      logger.error('Error calculating sync success rate:', error);
      return 0;
    }
  }

  private async getProductStatistics(): Promise<any> {
    const [total, active, synced, outOfSync] = await Promise.all([
      ProductMapping.countDocuments(),
      ProductMapping.countDocuments({ isActive: true }),
      ProductMapping.countDocuments({ syncStatus: 'synced' }),
      ProductMapping.countDocuments({ syncStatus: 'error' })
    ]);

    return { total, active, synced, outOfSync };
  }

  private async getInventoryStatistics(): Promise<any> {
    const [totalProducts, lowStock, outOfStock] = await Promise.all([
      ProductMapping.countDocuments({ isActive: true }),
      ProductMapping.countDocuments({ 
        isActive: true,
        'inventory.shopify': { $gt: 0, $lt: 10 }
      }),
      ProductMapping.countDocuments({ 
        isActive: true,
        'inventory.shopify': 0
      })
    ]);

    return {
      totalProducts,
      lowStock,
      outOfStock,
      healthy: totalProducts - lowStock - outOfStock
    };
  }

  private async getSyncStatistics(): Promise<any> {
    const recentJobs = await PriceSyncJob.find({
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    }).sort({ createdAt: -1 });

    return {
      todayJobs: recentJobs.length,
      successRate: await this.calculateSyncSuccessRate(),
      lastSync: recentJobs[0]?.createdAt || null,
      status: recentJobs[0]?.status || 'idle'
    };
  }

  private async getPricingStatistics(): Promise<any> {
    const priceHistories = await PriceHistory.aggregate([
      {
        $match: {
          createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
        }
      },
      {
        $group: {
          _id: null,
          avgPriceChange: { $avg: '$priceChange' },
          totalChanges: { $sum: 1 }
        }
      }
    ]);

    return {
      avgPriceChange: priceHistories[0]?.avgPriceChange || 0,
      totalChanges: priceHistories[0]?.totalChanges || 0
    };
  }

  private async generatePriceChartData(period: string, sku?: string): Promise<any> {
    // Implement price chart data generation
    return {
      labels: [],
      datasets: []
    };
  }

  private async generateInventoryChartData(period: string, sku?: string): Promise<any> {
    // Implement inventory chart data generation
    return {
      labels: [],
      datasets: []
    };
  }

  private async generateSyncChartData(period: string): Promise<any> {
    // Implement sync chart data generation
    return {
      labels: [],
      datasets: []
    };
  }

  private async generateSalesChartData(period: string, platform?: string): Promise<any> {
    // Implement sales chart data generation
    return {
      labels: [],
      datasets: []
    };
  }

  private async generatePerformanceChartData(metric: string): Promise<any> {
    // Implement performance chart data generation
    return {
      labels: [],
      datasets: []
    };
  }

  private async fetchAlerts(status: string, severity?: string): Promise<any[]> {
    // Implement alert fetching logic
    return [];
  }

  private async fetchAlertById(id: string): Promise<any> {
    // Implement alert finding logic
    return null;
  }

  private async updateAlertStatus(id: string, status: string): Promise<any> {
    // Implement alert status update logic
    return { id, status };
  }

  private async fetchWidgets(): Promise<any[]> {
    // Implement widget fetching logic
    return [];
  }

  private async fetchWidgetData(widgetId: string): Promise<any> {
    // Implement widget data fetching logic
    return {};
  }

  private async refreshWidgetData(widgetId: string): Promise<any> {
    // Implement widget refresh logic
    return {};
  }

  private async fetchDashboardConfig(userId: string): Promise<any> {
    // Implement config fetching logic
    return {};
  }

  private async saveDashboardConfig(userId: string, config: any): Promise<any> {
    // Implement config saving logic
    return config;
  }

  private async resetUserDashboardConfig(userId: string): Promise<any> {
    // Implement config reset logic
    return {};
  }

  private async createExportJob(format: string, type: string): Promise<string> {
    // Implement export job creation logic
    return `export-${Date.now()}`;
  }

  private async fetchExportStatus(exportId: string): Promise<any> {
    // Implement export status fetching logic
    return {
      id: exportId,
      status: 'completed'
    };
  }

  private async fetchExportData(exportId: string): Promise<any> {
    // Implement export data fetching logic
    return null;
  }
}