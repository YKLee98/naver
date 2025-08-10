// packages/backend/src/controllers/DashboardController.ts
import { Request, Response, NextFunction } from 'express';
import { 
  PriceSyncJob,
  InventoryTransaction,
  ProductMapping,
  PriceHistory,
  Activity,
  SyncHistory
} from '../models/index.js';
import { logger } from '../utils/logger.js';
import { getRedisClient } from '../config/redis.js';
import { subDays, startOfDay, endOfDay } from 'date-fns';

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
      // Parallel queries for better performance
      const [
        totalMappings,
        activeMappings,
        recentSync,
        inventoryDiscrepancies,
        lowStockCount,
        todayActivities,
        weekActivities,
        monthActivities
      ] = await Promise.all([
        ProductMapping.countDocuments(),
        ProductMapping.countDocuments({ isActive: true }),
        PriceSyncJob.findOne().sort({ createdAt: -1 }).lean(),
        this.getInventoryDiscrepancies(),
        this.getLowStockCount(),
        this.getActivityCount('day'),
        this.getActivityCount('week'),
        this.getActivityCount('month')
      ]);

      const statistics = {
        success: true,
        data: {
          products: {
            total: totalMappings,
            active: activeMappings,
            inactive: totalMappings - activeMappings,
            percentage: totalMappings > 0 ? Math.round((activeMappings / totalMappings) * 100) : 0
          },
          inventory: {
            discrepancies: inventoryDiscrepancies,
            lowStock: lowStockCount,
            lastSync: recentSync?.completedAt || null,
            syncStatus: recentSync?.status || 'idle'
          },
          sync: {
            lastRun: recentSync?.createdAt || null,
            status: recentSync?.status || 'idle',
            successRate: await this.calculateSyncSuccessRate(),
            nextScheduled: await this.getNextScheduledSync()
          },
          activities: {
            today: todayActivities,
            week: weekActivities,
            month: monthActivities
          },
          systemHealth: {
            status: 'operational',
            uptime: process.uptime(),
            memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024,
            cpuUsage: process.cpuUsage()
          }
        }
      };

      res.json(statistics);
    } catch (error) {
      logger.error('Error fetching dashboard statistics:', error);
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
            error: 'Invalid statistics type',
            validTypes: ['products', 'inventory', 'sync', 'pricing']
          });
          return;
      }

      res.json({
        success: true,
        data
      });
    } catch (error) {
      logger.error(`Error fetching ${req.params.type} statistics:`, error);
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
          activities: activities.map(activity => ({
            _id: activity._id,
            id: activity._id,
            type: activity.type,
            action: activity.action,
            details: activity.details,
            metadata: activity.metadata,
            userId: activity.userId,
            createdAt: activity.createdAt,
            timestamp: activity.createdAt
          })),
          pagination: {
            limit: Number(limit),
            offset: Number(offset),
            total,
            pages: Math.ceil(total / Number(limit))
          }
        }
      });
    } catch (error) {
      logger.error('Error fetching recent activities:', error);
      next(error);
    }
  };

  /**
   * Get activity by ID
   */
  getActivityById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const activity = await Activity.findById(id).lean();

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
      logger.error('Error fetching activity by ID:', error);
      next(error);
    }
  };

  /**
   * Get sales chart data
   */
  getSalesChartData = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { period = 'day', platform } = req.query;
      
      const data = await this.generateSalesChartData(
        period as string, 
        platform as string
      );

      res.json({
        success: true,
        data
      });
    } catch (error) {
      logger.error('Error fetching sales chart data:', error);
      next(error);
    }
  };

  /**
   * Get inventory chart data
   */
  getInventoryChartData = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { period = '7d', sku } = req.query;
      
      const data = await this.generateInventoryChartData(
        period as string, 
        sku as string
      );

      res.json({
        success: true,
        data
      });
    } catch (error) {
      logger.error('Error fetching inventory chart data:', error);
      next(error);
    }
  };

  /**
   * Get price chart data
   */
  getPriceChartData = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { period = '7d', sku } = req.query;
      
      const data = await this.generatePriceChartData(
        period as string, 
        sku as string
      );

      res.json({
        success: true,
        data
      });
    } catch (error) {
      logger.error('Error fetching price chart data:', error);
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
      logger.error('Error fetching sync chart data:', error);
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
      logger.error('Error fetching performance chart data:', error);
      next(error);
    }
  };

  // ============================================
  // ALERT METHODS
  // ============================================

  /**
   * Get alerts
   */
  getAlerts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { status = 'active', severity } = req.query;
      
      const alerts = await this.fetchAlerts(
        status as string, 
        severity as string
      );

      res.json({
        success: true,
        data: alerts
      });
    } catch (error) {
      logger.error('Error fetching alerts:', error);
      next(error);
    }
  };

  /**
   * Get alert by ID
   */
  getAlertById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      
      // Mock implementation - replace with actual logic
      const alert = {
        id,
        type: 'low_stock',
        severity: 'warning',
        message: 'Low stock alert',
        createdAt: new Date()
      };

      res.json({
        success: true,
        data: alert
      });
    } catch (error) {
      logger.error('Error fetching alert by ID:', error);
      next(error);
    }
  };

  /**
   * Dismiss alert
   */
  dismissAlert = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      
      // Mock implementation - replace with actual logic
      logger.info(`Dismissing alert: ${id}`);
      
      res.json({
        success: true,
        message: 'Alert dismissed successfully'
      });
    } catch (error) {
      logger.error('Error dismissing alert:', error);
      next(error);
    }
  };

  /**
   * Acknowledge alert
   */
  acknowledgeAlert = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      
      // Mock implementation - replace with actual logic
      logger.info(`Acknowledging alert: ${id}`);
      
      res.json({
        success: true,
        message: 'Alert acknowledged successfully'
      });
    } catch (error) {
      logger.error('Error acknowledging alert:', error);
      next(error);
    }
  };

  // ============================================
  // WIDGET METHODS
  // ============================================

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
      logger.error('Error fetching widgets:', error);
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
      logger.error('Error fetching widget data:', error);
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
      logger.error('Error refreshing widget:', error);
      next(error);
    }
  };

  // ============================================
  // CONFIG METHODS
  // ============================================

  /**
   * Get dashboard config
   */
  getDashboardConfig = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const config = await this.fetchDashboardConfig();
      
      res.json({
        success: true,
        data: config
      });
    } catch (error) {
      logger.error('Error fetching dashboard config:', error);
      next(error);
    }
  };

  /**
   * Update dashboard config
   */
  updateDashboardConfig = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const config = req.body;
      
      const updated = await this.saveDashboardConfig(config);
      
      res.json({
        success: true,
        data: updated
      });
    } catch (error) {
      logger.error('Error updating dashboard config:', error);
      next(error);
    }
  };

  /**
   * Reset dashboard config
   */
  resetDashboardConfig = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const config = await this.resetConfig();
      
      res.json({
        success: true,
        data: config
      });
    } catch (error) {
      logger.error('Error resetting dashboard config:', error);
      next(error);
    }
  };

  // ============================================
  // EXPORT METHODS
  // ============================================

  /**
   * Export dashboard data
   */
  exportDashboardData = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { format = 'json', dateRange } = req.body;
      
      const exportId = await this.createExport(format, dateRange);
      
      res.json({
        success: true,
        data: { exportId }
      });
    } catch (error) {
      logger.error('Error exporting dashboard data:', error);
      next(error);
    }
  };

  /**
   * Get export status
   */
  getExportStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { exportId } = req.params;
      
      const status = await this.checkExportStatus(exportId);
      
      res.json({
        success: true,
        data: status
      });
    } catch (error) {
      logger.error('Error fetching export status:', error);
      next(error);
    }
  };

  /**
   * Download export
   */
  downloadExport = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { exportId } = req.params;
      
      const file = await this.getExportFile(exportId);
      
      res.download(file.path, file.name);
    } catch (error) {
      logger.error('Error downloading export:', error);
      next(error);
    }
  };

  // ============================================
  // HELPER METHODS
  // ============================================

  private async getInventoryDiscrepancies(): Promise<number> {
    try {
      const mappings = await ProductMapping.find({ isActive: true }).lean();
      let discrepancies = 0;
      
      for (const mapping of mappings) {
        const naverStock = mapping.inventory?.naver?.available || 0;
        const shopifyStock = mapping.inventory?.shopify?.available || 0;
        
        if (Math.abs(naverStock - shopifyStock) > 0) {
          discrepancies++;
        }
      }
      
      return discrepancies;
    } catch (error) {
      logger.error('Error calculating inventory discrepancies:', error);
      return 0;
    }
  }

  private async getLowStockCount(): Promise<number> {
    try {
      const threshold = 10; // configurable
      const mappings = await ProductMapping.find({ isActive: true }).lean();
      let count = 0;
      
      for (const mapping of mappings) {
        const naverStock = mapping.inventory?.naver?.available || 0;
        const shopifyStock = mapping.inventory?.shopify?.available || 0;
        
        if (naverStock < threshold || shopifyStock < threshold) {
          count++;
        }
      }
      
      return count;
    } catch (error) {
      logger.error('Error calculating low stock count:', error);
      return 0;
    }
  }

  private async calculateSyncSuccessRate(): Promise<number> {
    try {
      const recentJobs = await PriceSyncJob.find()
        .sort({ createdAt: -1 })
        .limit(100)
        .lean();
      
      if (recentJobs.length === 0) return 100;
      
      const successCount = recentJobs.filter(job => job.status === 'completed').length;
      return Math.round((successCount / recentJobs.length) * 100);
    } catch (error) {
      logger.error('Error calculating sync success rate:', error);
      return 0;
    }
  }

  private async getActivityCount(period: string): Promise<number> {
    try {
      let startDate: Date;
      const now = new Date();
      
      switch (period) {
        case 'day':
          startDate = startOfDay(now);
          break;
        case 'week':
          startDate = subDays(now, 7);
          break;
        case 'month':
          startDate = subDays(now, 30);
          break;
        default:
          startDate = startOfDay(now);
      }
      
      return await Activity.countDocuments({
        createdAt: { $gte: startDate }
      });
    } catch (error) {
      logger.error('Error counting activities:', error);
      return 0;
    }
  }

  private async getNextScheduledSync(): Promise<Date | null> {
    // Implement based on your sync schedule logic
    return null;
  }

  private async getProductStatistics() {
    const [total, active, synced, needsSync] = await Promise.all([
      ProductMapping.countDocuments(),
      ProductMapping.countDocuments({ isActive: true }),
      ProductMapping.countDocuments({ syncStatus: 'synced' }),
      ProductMapping.countDocuments({ syncStatus: { $ne: 'synced' } })
    ]);
    
    return { total, active, synced, needsSync };
  }

  private async getInventoryStatistics() {
    // Implement inventory statistics logic
    return { 
      totalSkus: 0, 
      inStock: 0, 
      lowStock: 0, 
      outOfStock: 0 
    };
  }

  private async getSyncStatistics() {
    // Implement sync statistics logic
    return { 
      totalSyncs: 0, 
      successful: 0, 
      failed: 0, 
      pending: 0 
    };
  }

  private async getPricingStatistics() {
    // Implement pricing statistics logic
    return { 
      totalProducts: 0, 
      synced: 0, 
      needsUpdate: 0, 
      errors: 0 
    };
  }

  private async generateSalesChartData(period: string, platform?: string) {
    // Mock implementation - replace with actual logic
    return {
      labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      datasets: [{
        label: 'Sales',
        data: [12, 19, 3, 5, 2, 3, 15]
      }]
    };
  }

  private async generateInventoryChartData(period: string, sku?: string) {
    // Mock implementation - replace with actual logic
    return {
      labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
      datasets: [{
        label: 'Inventory Level',
        data: [65, 59, 80, 81]
      }]
    };
  }

  private async generatePriceChartData(period: string, sku?: string) {
    // Mock implementation - replace with actual logic
    return {
      labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May'],
      datasets: [{
        label: 'Price',
        data: [100, 105, 110, 108, 115]
      }]
    };
  }

  private async generateSyncChartData(period: string) {
    // Mock implementation - replace with actual logic
    return {
      labels: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00'],
      datasets: [{
        label: 'Sync Jobs',
        data: [2, 4, 3, 5, 4, 3]
      }]
    };
  }

  private async generatePerformanceChartData(metric: string) {
    // Mock implementation - replace with actual logic
    return {
      labels: ['1h ago', '45m ago', '30m ago', '15m ago', 'Now'],
      datasets: [{
        label: 'Response Time (ms)',
        data: [120, 115, 110, 125, 118]
      }]
    };
  }

  private async fetchAlerts(status: string, severity?: string) {
    // Mock implementation - replace with actual logic
    return [];
  }

  private async fetchWidgets() {
    // Mock implementation - replace with actual logic
    return [];
  }

  private async fetchWidgetData(widgetId: string) {
    // Mock implementation - replace with actual logic
    return {};
  }

  private async refreshWidgetData(widgetId: string) {
    // Mock implementation - replace with actual logic
    return {};
  }

  private async fetchDashboardConfig() {
    // Mock implementation - replace with actual logic
    return {};
  }

  private async saveDashboardConfig(config: any) {
    // Mock implementation - replace with actual logic
    return config;
  }

  private async resetConfig() {
    // Mock implementation - replace with actual logic
    return {};
  }

  private async createExport(format: string, dateRange: any) {
    // Mock implementation - replace with actual logic
    return 'export-' + Date.now();
  }

  private async checkExportStatus(exportId: string) {
    // Mock implementation - replace with actual logic
    return { status: 'completed', progress: 100 };
  }

  private async getExportFile(exportId: string) {
    // Mock implementation - replace with actual logic
    return { path: '/tmp/export.json', name: 'export.json' };
  }
}
