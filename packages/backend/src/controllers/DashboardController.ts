// packages/backend/src/controllers/DashboardController.ts
import { Request, Response, NextFunction } from 'express';
import { PriceSyncJob } from '../models/PriceSyncJob';
import { InventoryTransaction } from '../models/InventoryTransaction';
import { ProductMapping } from '../models/ProductMapping';
import { PriceHistory } from '../models/PriceHistory';
import { Activity } from '../models/Activity';
import { logger } from '../utils/logger';
import { getRedisClient } from '../config/redis';

class DashboardControllerClass {
  private redis: any;

  constructor() {
    this.redis = getRedisClient();
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
        case 'price':
          data = await this.getPriceStatistics();
          break;
        default:
          res.status(400).json({
            success: false,
            error: `Invalid statistics type: ${type}`
          });
          return;
      }

      res.json({
        success: true,
        type,
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
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = parseInt(req.query.offset as string) || 0;

      const activities = await this.fetchRecentActivities(limit, offset);

      res.json({
        success: true,
        data: activities,
        pagination: {
          limit,
          offset,
          total: await this.getActivityCount()
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
      
      // Try to find in different collections
      const activity = await this.findActivityById(id);
      
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
      const { metric = 'all' } = req.query;
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
      const config = req.body;
      const updated = await this.saveDashboardConfig(userId, config);

      res.json({
        success: true,
        data: updated
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
      const threshold = 10;
      const transactions = await InventoryTransaction.aggregate([
        {
          $sort: { createdAt: -1 }
        },
        {
          $group: {
            _id: '$sku',
            latestQuantity: { $first: '$newQuantity' }
          }
        },
        {
          $match: {
            latestQuantity: { $lt: threshold }
          }
        }
      ]);

      return transactions.length;
    } catch (error) {
      logger.error('Error getting low stock count:', error);
      return 0;
    }
  }

  private async calculateSyncSuccessRate(): Promise<number> {
    try {
      const recentJobs = await PriceSyncJob.find()
        .sort({ createdAt: -1 })
        .limit(100);

      if (recentJobs.length === 0) return 0;

      const successfulJobs = recentJobs.filter(job => job.status === 'completed').length;
      return Math.round((successfulJobs / recentJobs.length) * 100);
    } catch (error) {
      logger.error('Error calculating sync success rate:', error);
      return 0;
    }
  }

  private async getProductStatistics(): Promise<any> {
    // Implement product statistics logic
    return {
      total: 0,
      active: 0,
      inactive: 0,
      byCategory: []
    };
  }

  private async getInventoryStatistics(): Promise<any> {
    // Implement inventory statistics logic
    return {
      totalValue: 0,
      averageStock: 0,
      turnoverRate: 0
    };
  }

  private async getSyncStatistics(): Promise<any> {
    // Implement sync statistics logic
    return {
      totalSyncs: 0,
      successRate: 0,
      averageDuration: 0
    };
  }

  private async getPriceStatistics(): Promise<any> {
    // Implement price statistics logic
    return {
      averageMargin: 0,
      priceChanges: 0,
      discounts: 0
    };
  }

  private async fetchRecentActivities(limit: number, offset: number): Promise<any[]> {
    // Implement activity fetching logic
    return [];
  }

  private async getActivityCount(): Promise<number> {
    // Implement activity count logic
    return 0;
  }

  private async findActivityById(id: string): Promise<any> {
    // Implement activity finding logic
    return null;
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

// CommonJS export
export const DashboardController = DashboardControllerClass;
module.exports = { DashboardController: DashboardControllerClass };