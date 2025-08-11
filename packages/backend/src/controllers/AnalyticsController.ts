// ===== 1. packages/backend/src/controllers/AnalyticsController.ts =====
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';
import {
  ProductMapping,
  SyncHistory,
  InventoryTransaction,
  PriceHistory,
} from '../models/index.js';

export class AnalyticsController {
  /**
   * Get analytics overview
   */
  async getOverview(req: Request, res: Response, next: NextFunction) {
    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfLastMonth = new Date(
        now.getFullYear(),
        now.getMonth() - 1,
        1
      );

      // Get various metrics
      const [
        totalMappings,
        activeMappings,
        totalSyncs,
        successfulSyncs,
        totalTransactions,
        recentErrors,
      ] = await Promise.all([
        ProductMapping.countDocuments(),
        ProductMapping.countDocuments({ status: 'ACTIVE' }),
        SyncHistory.countDocuments({ createdAt: { $gte: startOfMonth } }),
        SyncHistory.countDocuments({
          createdAt: { $gte: startOfMonth },
          status: 'completed',
        }),
        InventoryTransaction.countDocuments({
          createdAt: { $gte: startOfMonth },
        }),
        SyncHistory.countDocuments({
          createdAt: { $gte: startOfMonth },
          status: 'failed',
        }),
      ]);

      const successRate =
        totalSyncs > 0 ? ((successfulSyncs / totalSyncs) * 100).toFixed(2) : 0;

      res.json({
        success: true,
        data: {
          overview: {
            totalMappings,
            activeMappings,
            inactiveMappings: totalMappings - activeMappings,
            monthlyStats: {
              totalSyncs,
              successfulSyncs,
              failedSyncs: totalSyncs - successfulSyncs,
              successRate: `${successRate}%`,
              totalTransactions,
            },
            recentErrors,
            lastUpdated: new Date(),
          },
        },
      });
    } catch (error) {
      logger.error('Analytics overview error:', error);
      next(error);
    }
  }

  /**
   * Get performance metrics
   */
  async getPerformanceMetrics(req: Request, res: Response, next: NextFunction) {
    try {
      const { period = '7d' } = req.query;

      let startDate = new Date();
      switch (period) {
        case '24h':
          startDate.setDate(startDate.getDate() - 1);
          break;
        case '7d':
          startDate.setDate(startDate.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(startDate.getDate() - 30);
          break;
        case '90d':
          startDate.setDate(startDate.getDate() - 90);
          break;
        default:
          startDate.setDate(startDate.getDate() - 7);
      }

      // Get sync performance metrics
      const syncMetrics = await SyncHistory.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate },
          },
        },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            avgDuration: { $avg: '$duration' },
            minDuration: { $min: '$duration' },
            maxDuration: { $max: '$duration' },
          },
        },
      ]);

      // Get inventory sync metrics
      const inventoryMetrics = await InventoryTransaction.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate },
          },
        },
        {
          $group: {
            _id: '$type',
            count: { $sum: 1 },
            totalQuantity: { $sum: '$quantity' },
          },
        },
      ]);

      res.json({
        success: true,
        data: {
          period,
          syncMetrics,
          inventoryMetrics,
          startDate,
          endDate: new Date(),
        },
      });
    } catch (error) {
      logger.error('Performance metrics error:', error);
      next(error);
    }
  }

  /**
   * Get trends data
   */
  async getTrends(req: Request, res: Response, next: NextFunction) {
    try {
      const { metric = 'syncs', period = '7d' } = req.query;

      let startDate = new Date();
      let groupBy = '$hour';

      switch (period) {
        case '24h':
          startDate.setDate(startDate.getDate() - 1);
          groupBy = { $hour: '$createdAt' };
          break;
        case '7d':
          startDate.setDate(startDate.getDate() - 7);
          groupBy = { $dayOfMonth: '$createdAt' };
          break;
        case '30d':
          startDate.setDate(startDate.getDate() - 30);
          groupBy = { $dayOfMonth: '$createdAt' };
          break;
        default:
          startDate.setDate(startDate.getDate() - 7);
          groupBy = { $dayOfMonth: '$createdAt' };
      }

      let collection;
      switch (metric) {
        case 'syncs':
          collection = SyncHistory;
          break;
        case 'inventory':
          collection = InventoryTransaction;
          break;
        case 'prices':
          collection = PriceHistory;
          break;
        default:
          collection = SyncHistory;
      }

      const trends = await collection.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate },
          },
        },
        {
          $group: {
            _id: groupBy,
            count: { $sum: 1 },
            date: { $first: '$createdAt' },
          },
        },
        {
          $sort: { date: 1 },
        },
      ]);

      res.json({
        success: true,
        data: {
          metric,
          period,
          trends,
          startDate,
          endDate: new Date(),
        },
      });
    } catch (error) {
      logger.error('Trends error:', error);
      next(error);
    }
  }

  /**
   * Get analytics reports
   */
  async getReports(req: Request, res: Response, next: NextFunction) {
    try {
      const { type = 'summary' } = req.query;

      let report;
      switch (type) {
        case 'summary':
          report = await this.generateSummaryReport();
          break;
        case 'detailed':
          report = await this.generateDetailedReport();
          break;
        case 'inventory':
          report = await this.generateInventoryReport();
          break;
        case 'sync':
          report = await this.generateSyncReport();
          break;
        default:
          report = await this.generateSummaryReport();
      }

      res.json({
        success: true,
        data: report,
      });
    } catch (error) {
      logger.error('Reports error:', error);
      next(error);
    }
  }

  /**
   * Export analytics data
   */
  async exportData(req: Request, res: Response, next: NextFunction) {
    try {
      const { format = 'json', type = 'overview' } = req.body;

      // Get data based on type
      let data;
      switch (type) {
        case 'overview':
          data = await this.getOverviewData();
          break;
        case 'performance':
          data = await this.getPerformanceData();
          break;
        case 'trends':
          data = await this.getTrendsData();
          break;
        default:
          data = await this.getOverviewData();
      }

      // Format data based on requested format
      if (format === 'csv') {
        // Convert to CSV format
        const csv = this.convertToCSV(data);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename=analytics-${type}-${Date.now()}.csv`
        );
        res.send(csv);
      } else {
        res.json({
          success: true,
          data,
          exportedAt: new Date(),
        });
      }
    } catch (error) {
      logger.error('Export data error:', error);
      next(error);
    }
  }

  // Helper methods
  private async generateSummaryReport() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [mappings, syncs, transactions] = await Promise.all([
      ProductMapping.countDocuments(),
      SyncHistory.countDocuments({ createdAt: { $gte: startOfMonth } }),
      InventoryTransaction.countDocuments({
        createdAt: { $gte: startOfMonth },
      }),
    ]);

    return {
      type: 'summary',
      generatedAt: now,
      period: {
        start: startOfMonth,
        end: now,
      },
      metrics: {
        totalMappings: mappings,
        monthlySyncs: syncs,
        monthlyTransactions: transactions,
      },
    };
  }

  private async generateDetailedReport() {
    // Implementation for detailed report
    return {
      type: 'detailed',
      generatedAt: new Date(),
      data: 'Detailed report data',
    };
  }

  private async generateInventoryReport() {
    // Implementation for inventory report
    return {
      type: 'inventory',
      generatedAt: new Date(),
      data: 'Inventory report data',
    };
  }

  private async generateSyncReport() {
    // Implementation for sync report
    return {
      type: 'sync',
      generatedAt: new Date(),
      data: 'Sync report data',
    };
  }

  private async getOverviewData() {
    // Implementation
    return {};
  }

  private async getPerformanceData() {
    // Implementation
    return {};
  }

  private async getTrendsData() {
    // Implementation
    return {};
  }

  private convertToCSV(data: any): string {
    // Simple CSV conversion
    if (Array.isArray(data)) {
      const headers = Object.keys(data[0] || {}).join(',');
      const rows = data.map((item) => Object.values(item).join(',')).join('\n');
      return `${headers}\n${rows}`;
    }
    return '';
  }
}
