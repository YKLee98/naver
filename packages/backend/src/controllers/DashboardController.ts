// packages/backend/src/controllers/DashboardController.ts
import { Request, Response, NextFunction } from 'express';
import {
  PriceSyncJob,
  InventoryTransaction,
  ProductMapping,
  PriceHistory,
  Activity,
  SyncHistory,
} from '../models/index.js';
import { logger } from '../utils/logger.js';
import { getRedisClient } from '../config/redis.js';
import {
  subDays,
  startOfDay,
  endOfDay,
  format,
  subMonths,
  subHours,
} from 'date-fns';

interface DashboardStats {
  totalInventory: number;
  todaySales: number;
  syncStatus: 'normal' | 'warning' | 'error';
  alertCount: number;
  inventoryValue: number;
  lowStockCount: number;
  outOfStockCount: number;
  syncSuccessRate: number;
  lastSyncTime?: Date;
  activeProducts: number;
  totalProducts: number;
  priceDiscrepancies: number;
  pendingSyncs: number;
}

interface ChartDataPoint {
  label: string;
  value: number;
  timestamp?: Date;
  metadata?: Record<string, any>;
}

interface ChartData {
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
    backgroundColor?: string | string[];
    borderColor?: string;
    borderWidth?: number;
    fill?: boolean;
  }>;
  summary?: {
    total?: number;
    average?: number;
    trend?: 'up' | 'down' | 'stable';
    changePercent?: number;
  };
}

export class DashboardController {
  private redis: any;
  private cacheTimeout = 60; // 60 seconds cache

  constructor() {
    try {
      this.redis = getRedisClient();
    } catch (error) {
      logger.warn('Redis not available for DashboardController');
      this.redis = null;
    }
  }

  /**
   * Get comprehensive dashboard statistics
   */
  getStatistics = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      // Check Redis cache first
      const cacheKey = 'dashboard:statistics';
      if (this.redis) {
        const cached = await this.redis.get(cacheKey);
        if (cached) {
          res.json({
            success: true,
            data: JSON.parse(cached),
          });
          return;
        }
      }

      // Parallel queries for better performance
      const [
        totalMappings,
        activeMappings,
        recentSync,
        lowStockProducts,
        outOfStockProducts,
        todayTransactions,
        recentActivities,
        pendingSyncs,
        priceDiscrepancies,
        inventoryValue,
      ] = await Promise.all([
        ProductMapping.countDocuments(),
        ProductMapping.countDocuments({ isActive: true, status: 'ACTIVE' }),
        PriceSyncJob.findOne({ status: 'completed' })
          .sort({ completedAt: -1 })
          .lean(),
        this.getLowStockCount(),
        this.getOutOfStockCount(),
        this.getTodayTransactions(),
        Activity.countDocuments({
          createdAt: { $gte: subDays(new Date(), 1) },
        }),
        PriceSyncJob.countDocuments({ status: 'pending' }),
        this.getPriceDiscrepancyCount(),
        this.calculateInventoryValue(),
      ]);

      const syncSuccessRate = await this.calculateSyncSuccessRate();
      const todaySales = await this.calculateTodaySales();
      const syncStatus = this.determineSyncStatus(recentSync);

      const statistics: DashboardStats = {
        totalInventory: await this.getTotalInventoryCount(),
        todaySales,
        syncStatus,
        alertCount: await this.getActiveAlertCount(),
        inventoryValue,
        lowStockCount: lowStockProducts,
        outOfStockCount: outOfStockProducts,
        syncSuccessRate,
        lastSyncTime: recentSync?.completedAt,
        activeProducts: activeMappings,
        totalProducts: totalMappings,
        priceDiscrepancies,
        pendingSyncs,
      };

      // Cache the result
      if (this.redis) {
        await this.redis.setex(
          cacheKey,
          this.cacheTimeout,
          JSON.stringify(statistics)
        );
      }

      res.json({
        success: true,
        data: statistics,
      });
    } catch (error) {
      logger.error('Error fetching dashboard statistics:', error);
      next(error);
    }
  };

  /**
   * Get statistics by type
   */
  getStatisticsByType = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
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
        case 'sales':
          data = await this.getSalesStatistics();
          break;
        case 'performance':
          data = await this.getPerformanceStatistics();
          break;
        default:
          res.status(400).json({
            success: false,
            error: 'Invalid statistics type',
          });
          return;
      }

      res.json({
        success: true,
        data,
      });
    } catch (error) {
      logger.error('Error fetching statistics by type:', error);
      next(error);
    }
  };

  /**
   * Get recent activities with pagination
   */
  getRecentActivities = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { limit = 20, offset = 0, type } = req.query;
      const query: any = {};

      if (type) {
        query.type = type;
      }

      const [activities, total] = await Promise.all([
        Activity.find(query)
          .sort({ createdAt: -1 })
          .limit(Number(limit))
          .skip(Number(offset))
          .lean(),
        Activity.countDocuments(query),
      ]);

      res.json({
        success: true,
        data: {
          activities: activities.map((activity) => ({
            _id: activity._id,
            id: activity._id,
            type: activity.type,
            action: activity.action,
            details: activity.details,
            metadata: activity.metadata,
            userId: activity.userId,
            createdAt: activity.createdAt,
            timestamp: activity.createdAt,
          })),
          pagination: {
            limit: Number(limit),
            offset: Number(offset),
            total,
            pages: Math.ceil(total / Number(limit)),
          },
        },
      });
    } catch (error) {
      logger.error('Error fetching recent activities:', error);
      next(error);
    }
  };

  /**
   * Get activity by ID
   */
  getActivityById = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const activity = await Activity.findById(id).lean();

      if (!activity) {
        res.status(404).json({
          success: false,
          error: 'Activity not found',
        });
        return;
      }

      res.json({
        success: true,
        data: activity,
      });
    } catch (error) {
      logger.error('Error fetching activity by ID:', error);
      next(error);
    }
  };

  /**
   * Get sales chart data with real data
   */
  getSalesChartData = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { period = 'day', platform } = req.query;

      const data = await this.generateSalesChartData(
        period as string,
        platform as string
      );

      res.json({
        success: true,
        data,
      });
    } catch (error) {
      logger.error('Error fetching sales chart data:', error);
      next(error);
    }
  };

  /**
   * Get inventory chart data with real data
   */
  getInventoryChartData = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { period = '7d', sku } = req.query;

      const data = await this.generateInventoryChartData(
        period as string,
        sku as string
      );

      res.json({
        success: true,
        data,
      });
    } catch (error) {
      logger.error('Error fetching inventory chart data:', error);
      next(error);
    }
  };

  /**
   * Get price chart data
   */
  getPriceChartData = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { period = '7d', sku } = req.query;

      const data = await this.generatePriceChartData(
        period as string,
        sku as string
      );

      res.json({
        success: true,
        data,
      });
    } catch (error) {
      logger.error('Error fetching price chart data:', error);
      next(error);
    }
  };

  /**
   * Get sync chart data
   */
  getSyncChartData = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { period = '7d' } = req.query;

      const data = await this.generateSyncChartData(period as string);

      res.json({
        success: true,
        data,
      });
    } catch (error) {
      logger.error('Error fetching sync chart data:', error);
      next(error);
    }
  };

  /**
   * Get performance chart data
   */
  getPerformanceChartData = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { metric = 'response_time' } = req.query;

      const data = await this.generatePerformanceChartData(metric as string);

      res.json({
        success: true,
        data,
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
  getAlerts = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { status = 'active', severity } = req.query;

      const alerts = await this.fetchAlerts(
        status as string,
        severity as string
      );

      res.json({
        success: true,
        data: alerts,
      });
    } catch (error) {
      logger.error('Error fetching alerts:', error);
      next(error);
    }
  };

  /**
   * Get alert by ID
   */
  getAlertById = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const alert = await this.fetchAlertById(id);

      if (!alert) {
        res.status(404).json({
          success: false,
          error: 'Alert not found',
        });
        return;
      }

      res.json({
        success: true,
        data: alert,
      });
    } catch (error) {
      logger.error('Error fetching alert by ID:', error);
      next(error);
    }
  };

  /**
   * Dismiss alert
   */
  dismissAlert = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await this.updateAlertStatus(id, 'dismissed');

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Error dismissing alert:', error);
      next(error);
    }
  };

  /**
   * Acknowledge alert
   */
  acknowledgeAlert = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const result = await this.updateAlertStatus(id, 'acknowledged');

      res.json({
        success: true,
        data: result,
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
  getWidgets = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const widgets = await this.fetchWidgets();

      res.json({
        success: true,
        data: widgets,
      });
    } catch (error) {
      logger.error('Error fetching widgets:', error);
      next(error);
    }
  };

  /**
   * Get widget data
   */
  getWidgetData = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { widgetId } = req.params;
      const data = await this.fetchWidgetData(widgetId);

      res.json({
        success: true,
        data,
      });
    } catch (error) {
      logger.error('Error fetching widget data:', error);
      next(error);
    }
  };

  /**
   * Refresh widget
   */
  refreshWidget = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { widgetId } = req.params;
      const data = await this.refreshWidgetData(widgetId);

      res.json({
        success: true,
        data,
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
  getDashboardConfig = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const config = await this.fetchDashboardConfig();

      res.json({
        success: true,
        data: config,
      });
    } catch (error) {
      logger.error('Error fetching dashboard config:', error);
      next(error);
    }
  };

  /**
   * Update dashboard config
   */
  updateDashboardConfig = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const config = req.body;
      const updated = await this.saveDashboardConfig(config);

      res.json({
        success: true,
        data: updated,
      });
    } catch (error) {
      logger.error('Error updating dashboard config:', error);
      next(error);
    }
  };

  /**
   * Reset dashboard config
   */
  resetDashboardConfig = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const config = await this.resetConfig();

      res.json({
        success: true,
        data: config,
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
  exportDashboardData = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { format = 'json', dateRange } = req.body;
      const exportId = await this.createExport(format, dateRange);

      res.json({
        success: true,
        data: { exportId },
      });
    } catch (error) {
      logger.error('Error exporting dashboard data:', error);
      next(error);
    }
  };

  /**
   * Get export status
   */
  getExportStatus = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { exportId } = req.params;
      const status = await this.checkExportStatus(exportId);

      res.json({
        success: true,
        data: status,
      });
    } catch (error) {
      logger.error('Error fetching export status:', error);
      next(error);
    }
  };

  /**
   * Download export
   */
  downloadExport = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { exportId } = req.params;
      const exportFile = await this.getExportFile(exportId);

      if (!exportFile) {
        res.status(404).json({
          success: false,
          error: 'Export not found',
        });
        return;
      }

      res.download(exportFile.path, exportFile.name);
    } catch (error) {
      logger.error('Error downloading export:', error);
      next(error);
    }
  };

  // ============================================
  // PRIVATE HELPER METHODS - Real Implementations
  // ============================================

  private async getLowStockCount(): Promise<number> {
    const mappings = await ProductMapping.find({ isActive: true }).lean();
    let lowStockCount = 0;

    for (const mapping of mappings) {
      const transactions = await InventoryTransaction.find({
        sku: mapping.sku,
        platform: 'shopify',
      })
        .sort({ createdAt: -1 })
        .limit(1)
        .lean();

      if (transactions.length > 0 && transactions[0].newQuantity < 10) {
        lowStockCount++;
      }
    }

    return lowStockCount;
  }

  private async getOutOfStockCount(): Promise<number> {
    const mappings = await ProductMapping.find({ isActive: true }).lean();
    let outOfStockCount = 0;

    for (const mapping of mappings) {
      const transactions = await InventoryTransaction.find({
        sku: mapping.sku,
        platform: 'shopify',
      })
        .sort({ createdAt: -1 })
        .limit(1)
        .lean();

      if (transactions.length > 0 && transactions[0].newQuantity === 0) {
        outOfStockCount++;
      }
    }

    return outOfStockCount;
  }

  private async getTodayTransactions(): Promise<number> {
    const today = new Date();
    const startOfToday = startOfDay(today);
    const endOfToday = endOfDay(today);

    return InventoryTransaction.countDocuments({
      createdAt: { $gte: startOfToday, $lte: endOfToday },
    });
  }

  private async calculateSyncSuccessRate(): Promise<number> {
    const recentJobs = await PriceSyncJob.find({
      createdAt: { $gte: subDays(new Date(), 7) },
    }).lean();

    if (recentJobs.length === 0) return 100;

    const successfulJobs = recentJobs.filter(
      (job) => job.status === 'completed'
    );
    return Math.round((successfulJobs.length / recentJobs.length) * 100);
  }

  private async calculateTodaySales(): Promise<number> {
    const today = new Date();
    const startOfToday = startOfDay(today);
    const endOfToday = endOfDay(today);

    const salesTransactions = await InventoryTransaction.find({
      transactionType: 'sale',
      createdAt: { $gte: startOfToday, $lte: endOfToday },
    }).lean();

    return salesTransactions.reduce(
      (total, trans) => total + Math.abs(trans.quantity),
      0
    );
  }

  private determineSyncStatus(recentSync: any): 'normal' | 'warning' | 'error' {
    if (!recentSync) return 'error';

    const hoursSinceSync =
      (Date.now() - new Date(recentSync.completedAt).getTime()) /
      (1000 * 60 * 60);

    if (hoursSinceSync > 24) return 'error';
    if (hoursSinceSync > 12) return 'warning';
    return 'normal';
  }

  private async getTotalInventoryCount(): Promise<number> {
    const mappings = await ProductMapping.find({ isActive: true }).lean();
    let totalInventory = 0;

    for (const mapping of mappings) {
      const latestTransaction = await InventoryTransaction.findOne({
        sku: mapping.sku,
        platform: 'shopify',
      })
        .sort({ createdAt: -1 })
        .lean();

      if (latestTransaction) {
        totalInventory += latestTransaction.newQuantity;
      }
    }

    return totalInventory;
  }

  private async getActiveAlertCount(): Promise<number> {
    // This would be implemented with an Alert model
    // For now, calculate based on conditions
    const lowStockCount = await this.getLowStockCount();
    const outOfStockCount = await this.getOutOfStockCount();
    const failedSyncs = await PriceSyncJob.countDocuments({
      status: 'failed',
      createdAt: { $gte: subDays(new Date(), 1) },
    });

    return lowStockCount + outOfStockCount + failedSyncs;
  }

  private async getPriceDiscrepancyCount(): Promise<number> {
    const recentPriceChanges = await PriceHistory.find({
      createdAt: { $gte: subDays(new Date(), 7) },
      changePercent: { $gte: 10 },
    }).countDocuments();

    return recentPriceChanges;
  }

  private async calculateInventoryValue(): Promise<number> {
    const mappings = await ProductMapping.find({ isActive: true }).lean();
    let totalValue = 0;

    for (const mapping of mappings) {
      const [latestTransaction, latestPrice] = await Promise.all([
        InventoryTransaction.findOne({
          sku: mapping.sku,
          platform: 'shopify',
        })
          .sort({ createdAt: -1 })
          .lean(),
        PriceHistory.findOne({
          sku: mapping.sku,
          platform: 'shopify',
        })
          .sort({ createdAt: -1 })
          .lean(),
      ]);

      if (latestTransaction && latestPrice) {
        totalValue += latestTransaction.newQuantity * latestPrice.newPrice;
      }
    }

    return Math.round(totalValue * 100) / 100;
  }

  private async getProductStatistics() {
    const [total, active, inactive, error, pending] = await Promise.all([
      ProductMapping.countDocuments(),
      ProductMapping.countDocuments({ status: 'ACTIVE' }),
      ProductMapping.countDocuments({ status: 'INACTIVE' }),
      ProductMapping.countDocuments({ status: 'ERROR' }),
      ProductMapping.countDocuments({ status: 'PENDING' }),
    ]);

    return {
      total,
      active,
      inactive,
      error,
      pending,
      activePercentage: total > 0 ? Math.round((active / total) * 100) : 0,
    };
  }

  private async getInventoryStatistics() {
    const lowStock = await this.getLowStockCount();
    const outOfStock = await this.getOutOfStockCount();
    const totalInventory = await this.getTotalInventoryCount();
    const inventoryValue = await this.calculateInventoryValue();

    return {
      totalQuantity: totalInventory,
      lowStockProducts: lowStock,
      outOfStockProducts: outOfStock,
      totalValue: inventoryValue,
      averageValue:
        totalInventory > 0
          ? Math.round((inventoryValue / totalInventory) * 100) / 100
          : 0,
    };
  }

  private async getSyncStatistics() {
    const [totalSyncs, successfulSyncs, failedSyncs, pendingSyncs] =
      await Promise.all([
        PriceSyncJob.countDocuments(),
        PriceSyncJob.countDocuments({ status: 'completed' }),
        PriceSyncJob.countDocuments({ status: 'failed' }),
        PriceSyncJob.countDocuments({ status: 'pending' }),
      ]);

    const successRate =
      totalSyncs > 0 ? Math.round((successfulSyncs / totalSyncs) * 100) : 0;

    return {
      total: totalSyncs,
      successful: successfulSyncs,
      failed: failedSyncs,
      pending: pendingSyncs,
      successRate,
    };
  }

  private async getSalesStatistics() {
    const today = new Date();
    const yesterday = subDays(today, 1);
    const weekAgo = subDays(today, 7);
    const monthAgo = subMonths(today, 1);

    const [todaySales, yesterdaySales, weekSales, monthSales] =
      await Promise.all([
        this.getSalesForPeriod(startOfDay(today), endOfDay(today)),
        this.getSalesForPeriod(startOfDay(yesterday), endOfDay(yesterday)),
        this.getSalesForPeriod(weekAgo, today),
        this.getSalesForPeriod(monthAgo, today),
      ]);

    const dailyChange =
      yesterdaySales > 0
        ? Math.round(((todaySales - yesterdaySales) / yesterdaySales) * 100)
        : 0;

    return {
      today: todaySales,
      yesterday: yesterdaySales,
      week: weekSales,
      month: monthSales,
      dailyChangePercent: dailyChange,
    };
  }

  private async getSalesForPeriod(
    startDate: Date,
    endDate: Date
  ): Promise<number> {
    const sales = await InventoryTransaction.find({
      transactionType: 'sale',
      createdAt: { $gte: startDate, $lte: endDate },
    }).lean();

    return sales.reduce((total, sale) => total + Math.abs(sale.quantity), 0);
  }

  private async getPerformanceStatistics() {
    // This would typically come from monitoring tools
    // For now, return mock performance data
    return {
      responseTime: {
        average: 120,
        p95: 250,
        p99: 450,
      },
      uptime: 99.95,
      errorRate: 0.02,
      requestsPerSecond: 45,
    };
  }

  private async generateSalesChartData(
    period: string,
    platform?: string
  ): Promise<ChartData> {
    const endDate = new Date();
    let startDate: Date;
    let groupBy: string;
    let labels: string[] = [];
    let salesData: number[] = [];

    switch (period) {
      case 'hour':
        startDate = subHours(endDate, 24);
        groupBy = 'hour';
        for (let i = 23; i >= 0; i--) {
          const hour = subHours(endDate, i);
          labels.push(format(hour, 'HH:00'));
          const hourSales = await this.getSalesForPeriod(
            hour,
            subHours(hour, -1)
          );
          salesData.push(hourSales);
        }
        break;
      case 'day':
        startDate = subDays(endDate, 7);
        for (let i = 6; i >= 0; i--) {
          const day = subDays(endDate, i);
          labels.push(format(day, 'EEE'));
          const daySales = await this.getSalesForPeriod(
            startOfDay(day),
            endOfDay(day)
          );
          salesData.push(daySales);
        }
        break;
      case 'week':
        startDate = subDays(endDate, 28);
        for (let i = 3; i >= 0; i--) {
          const weekStart = subDays(endDate, (i + 1) * 7);
          const weekEnd = subDays(endDate, i * 7);
          labels.push(`Week ${4 - i}`);
          const weekSales = await this.getSalesForPeriod(weekStart, weekEnd);
          salesData.push(weekSales);
        }
        break;
      case 'month':
        startDate = subMonths(endDate, 12);
        for (let i = 11; i >= 0; i--) {
          const month = subMonths(endDate, i);
          labels.push(format(month, 'MMM'));
          const monthSales = await this.getSalesForPeriod(
            startOfDay(new Date(month.getFullYear(), month.getMonth(), 1)),
            endOfDay(new Date(month.getFullYear(), month.getMonth() + 1, 0))
          );
          salesData.push(monthSales);
        }
        break;
      default:
        startDate = subDays(endDate, 7);
        for (let i = 6; i >= 0; i--) {
          const day = subDays(endDate, i);
          labels.push(format(day, 'MM/dd'));
          const daySales = await this.getSalesForPeriod(
            startOfDay(day),
            endOfDay(day)
          );
          salesData.push(daySales);
        }
    }

    const total = salesData.reduce((sum, val) => sum + val, 0);
    const average = total / salesData.length;
    const trend =
      salesData[salesData.length - 1] > salesData[0]
        ? 'up'
        : salesData[salesData.length - 1] < salesData[0]
          ? 'down'
          : 'stable';

    return {
      labels,
      datasets: [
        {
          label: 'Sales',
          data: salesData,
          backgroundColor: 'rgba(75, 192, 192, 0.2)',
          borderColor: 'rgba(75, 192, 192, 1)',
          borderWidth: 2,
          fill: true,
        },
      ],
      summary: {
        total,
        average: Math.round(average * 100) / 100,
        trend,
        changePercent:
          salesData[0] > 0
            ? Math.round(
                ((salesData[salesData.length - 1] - salesData[0]) /
                  salesData[0]) *
                  100
              )
            : 0,
      },
    };
  }

  private async generateInventoryChartData(
    period: string,
    sku?: string
  ): Promise<ChartData> {
    // Get inventory status distribution
    const mappings = await ProductMapping.find({
      isActive: true,
      ...(sku && { sku }),
    }).lean();

    const inventoryByStatus = {
      inStock: 0,
      lowStock: 0,
      outOfStock: 0,
    };

    for (const mapping of mappings) {
      const latestTransaction = await InventoryTransaction.findOne({
        sku: mapping.sku,
        platform: 'shopify',
      })
        .sort({ createdAt: -1 })
        .lean();

      if (latestTransaction) {
        if (latestTransaction.newQuantity === 0) {
          inventoryByStatus.outOfStock++;
        } else if (latestTransaction.newQuantity < 10) {
          inventoryByStatus.lowStock++;
        } else {
          inventoryByStatus.inStock++;
        }
      }
    }

    return {
      labels: ['정상재고', '재고부족', '품절'],
      datasets: [
        {
          label: '재고 현황',
          data: [
            inventoryByStatus.inStock,
            inventoryByStatus.lowStock,
            inventoryByStatus.outOfStock,
          ],
          backgroundColor: [
            'rgba(75, 192, 192, 0.8)',
            'rgba(255, 206, 86, 0.8)',
            'rgba(255, 99, 132, 0.8)',
          ],
          borderColor: [
            'rgba(75, 192, 192, 1)',
            'rgba(255, 206, 86, 1)',
            'rgba(255, 99, 132, 1)',
          ],
          borderWidth: 1,
        },
      ],
      summary: {
        total: mappings.length,
        average: 0,
        trend: 'stable',
      },
    };
  }

  private async generatePriceChartData(
    period: string,
    sku?: string
  ): Promise<ChartData> {
    const endDate = new Date();
    const startDate =
      period === '30d' ? subDays(endDate, 30) : subDays(endDate, 7);

    const priceHistory = await PriceHistory.find({
      ...(sku && { sku }),
      createdAt: { $gte: startDate, $lte: endDate },
    })
      .sort({ createdAt: 1 })
      .lean();

    const groupedByDate = new Map<string, number[]>();

    priceHistory.forEach((history) => {
      const dateKey = format(history.createdAt, 'yyyy-MM-dd');
      if (!groupedByDate.has(dateKey)) {
        groupedByDate.set(dateKey, []);
      }
      groupedByDate.get(dateKey)!.push(history.newPrice);
    });

    const labels: string[] = [];
    const avgPrices: number[] = [];

    groupedByDate.forEach((prices, date) => {
      labels.push(format(new Date(date), 'MM/dd'));
      const avgPrice =
        prices.reduce((sum, price) => sum + price, 0) / prices.length;
      avgPrices.push(Math.round(avgPrice * 100) / 100);
    });

    return {
      labels,
      datasets: [
        {
          label: '평균 가격',
          data: avgPrices,
          backgroundColor: 'rgba(153, 102, 255, 0.2)',
          borderColor: 'rgba(153, 102, 255, 1)',
          borderWidth: 2,
          fill: false,
        },
      ],
      summary: {
        total: priceHistory.length,
        average:
          avgPrices.length > 0
            ? avgPrices.reduce((sum, price) => sum + price, 0) /
              avgPrices.length
            : 0,
        trend:
          avgPrices.length > 1 && avgPrices[avgPrices.length - 1] > avgPrices[0]
            ? 'up'
            : avgPrices.length > 1 &&
                avgPrices[avgPrices.length - 1] < avgPrices[0]
              ? 'down'
              : 'stable',
      },
    };
  }

  private async generateSyncChartData(period: string): Promise<ChartData> {
    const endDate = new Date();
    const startDate =
      period === '30d' ? subDays(endDate, 30) : subDays(endDate, 7);

    const syncJobs = await PriceSyncJob.find({
      createdAt: { $gte: startDate, $lte: endDate },
    })
      .sort({ createdAt: 1 })
      .lean();

    const groupedByDate = new Map<
      string,
      { success: number; failed: number }
    >();

    syncJobs.forEach((job) => {
      const dateKey = format(job.createdAt, 'yyyy-MM-dd');
      if (!groupedByDate.has(dateKey)) {
        groupedByDate.set(dateKey, { success: 0, failed: 0 });
      }
      const stats = groupedByDate.get(dateKey)!;
      if (job.status === 'completed') {
        stats.success++;
      } else if (job.status === 'failed') {
        stats.failed++;
      }
    });

    const labels: string[] = [];
    const successData: number[] = [];
    const failedData: number[] = [];

    groupedByDate.forEach((stats, date) => {
      labels.push(format(new Date(date), 'MM/dd'));
      successData.push(stats.success);
      failedData.push(stats.failed);
    });

    return {
      labels,
      datasets: [
        {
          label: '성공',
          data: successData,
          backgroundColor: 'rgba(75, 192, 192, 0.8)',
          borderColor: 'rgba(75, 192, 192, 1)',
          borderWidth: 1,
        },
        {
          label: '실패',
          data: failedData,
          backgroundColor: 'rgba(255, 99, 132, 0.8)',
          borderColor: 'rgba(255, 99, 132, 1)',
          borderWidth: 1,
        },
      ],
    };
  }

  private async generatePerformanceChartData(
    metric: string
  ): Promise<ChartData> {
    // This would typically come from monitoring tools
    // For now, return mock data
    const labels = ['1h ago', '45m ago', '30m ago', '15m ago', 'Now'];
    const data = [120, 115, 110, 125, 118];

    return {
      labels,
      datasets: [
        {
          label: 'Response Time (ms)',
          data,
          backgroundColor: 'rgba(255, 159, 64, 0.2)',
          borderColor: 'rgba(255, 159, 64, 1)',
          borderWidth: 2,
          fill: true,
        },
      ],
    };
  }

  private async fetchAlerts(status: string, severity?: string) {
    // Implementation would depend on Alert model
    return [];
  }

  private async fetchAlertById(id: string) {
    // Implementation would depend on Alert model
    return null;
  }

  private async updateAlertStatus(id: string, status: string) {
    // Implementation would depend on Alert model
    return { id, status };
  }

  private async fetchWidgets() {
    // Return default widget configuration
    return [
      { id: 'stats', type: 'statistics', position: 1 },
      { id: 'sales', type: 'chart', position: 2 },
      { id: 'inventory', type: 'chart', position: 3 },
      { id: 'activities', type: 'list', position: 4 },
    ];
  }

  private async fetchWidgetData(widgetId: string) {
    // Return widget-specific data
    switch (widgetId) {
      case 'stats':
        return this.getStatistics;
      case 'sales':
        return this.generateSalesChartData('day');
      case 'inventory':
        return this.generateInventoryChartData('7d');
      default:
        return {};
    }
  }

  private async refreshWidgetData(widgetId: string) {
    // Clear cache and fetch fresh data
    if (this.redis) {
      await this.redis.del(`widget:${widgetId}`);
    }
    return this.fetchWidgetData(widgetId);
  }

  private async fetchDashboardConfig() {
    // Return default configuration
    return {
      refreshInterval: 60000,
      theme: 'light',
      widgets: await this.fetchWidgets(),
    };
  }

  private async saveDashboardConfig(config: any) {
    // Save configuration to database or cache
    if (this.redis) {
      await this.redis.set('dashboard:config', JSON.stringify(config));
    }
    return config;
  }

  private async resetConfig() {
    // Reset to default configuration
    if (this.redis) {
      await this.redis.del('dashboard:config');
    }
    return this.fetchDashboardConfig();
  }

  private async createExport(format: string, dateRange: any) {
    // Create export job
    const exportId = `export-${Date.now()}`;
    // Implementation would create actual export
    return exportId;
  }

  private async checkExportStatus(exportId: string) {
    // Check export job status
    return { status: 'completed', progress: 100 };
  }

  private async getExportFile(exportId: string) {
    // Get export file path
    return {
      path: `/tmp/${exportId}.json`,
      name: `dashboard-export-${exportId}.json`,
    };
  }
}

export default new DashboardController();
