// packages/backend/src/services/report/ReportService.ts
import { SyncService } from '../sync/SyncService.js';
import { InventorySyncService } from '../sync/InventorySyncService.js';
import { PriceSyncService } from '../sync/PriceSyncService.js';
import { ProductMapping, Activity, InventoryTransaction } from '../../models/index.js';
import { logger } from '../../utils/logger.js';
import * as XLSX from 'xlsx';
import { Parser } from 'json2csv';

export interface ReportOptions {
  type: 'daily' | 'weekly' | 'monthly' | 'custom';
  startDate: Date;
  endDate: Date;
  includeInventory?: boolean;
  includePrice?: boolean;
  includeSync?: boolean;
  includeActivity?: boolean;
  format?: 'json' | 'csv' | 'excel';
}

export interface ReportData {
  id: string;
  type: string;
  period: {
    start: Date;
    end: Date;
  };
  summary: {
    totalProducts: number;
    activeProducts: number;
    totalSyncs: number;
    successfulSyncs: number;
    failedSyncs: number;
    inventoryDiscrepancies: number;
    priceDiscrepancies: number;
  };
  inventory?: any;
  price?: any;
  sync?: any;
  activity?: any;
  generatedAt: Date;
}

export class ReportService {
  private syncService: SyncService;
  private inventorySyncService: InventorySyncService;
  private priceSyncService: PriceSyncService;

  constructor(
    syncService: SyncService,
    inventorySyncService: InventorySyncService,
    priceSyncService: PriceSyncService
  ) {
    this.syncService = syncService;
    this.inventorySyncService = inventorySyncService;
    this.priceSyncService = priceSyncService;
  }

  /**
   * Generate report
   */
  async generateReport(options: ReportOptions): Promise<ReportData> {
    try {
      logger.info('Generating report:', options);
      
      const reportId = `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const report: ReportData = {
        id: reportId,
        type: options.type,
        period: {
          start: options.startDate,
          end: options.endDate
        },
        summary: await this.generateSummary(options),
        generatedAt: new Date()
      };
      
      // Add detailed sections based on options
      if (options.includeInventory) {
        report.inventory = await this.generateInventoryReport(options);
      }
      
      if (options.includePrice) {
        report.price = await this.generatePriceReport(options);
      }
      
      if (options.includeSync) {
        report.sync = await this.generateSyncReport(options);
      }
      
      if (options.includeActivity) {
        report.activity = await this.generateActivityReport(options);
      }
      
      logger.info('Report generated successfully:', reportId);
      return report;
    } catch (error) {
      logger.error('Failed to generate report:', error);
      throw error;
    }
  }

  /**
   * Generate summary statistics
   */
  private async generateSummary(options: ReportOptions): Promise<ReportData['summary']> {
    const { startDate, endDate } = options;
    
    const [
      totalProducts,
      activeProducts,
      activities,
      inventoryTransactions
    ] = await Promise.all([
      ProductMapping.countDocuments(),
      ProductMapping.countDocuments({ isActive: true }),
      Activity.find({
        createdAt: { $gte: startDate, $lte: endDate }
      }).lean(),
      InventoryTransaction.find({
        createdAt: { $gte: startDate, $lte: endDate }
      }).lean()
    ]);
    
    const syncActivities = activities.filter(a => a.type === 'sync');
    const successfulSyncs = syncActivities.filter(a => a.success).length;
    const failedSyncs = syncActivities.filter(a => !a.success).length;
    
    // Count discrepancies
    const mappings = await ProductMapping.find({ isActive: true }).lean();
    let inventoryDiscrepancies = 0;
    let priceDiscrepancies = 0;
    
    mappings.forEach(mapping => {
      const naverStock = mapping.inventory?.naver?.available || 0;
      const shopifyStock = mapping.inventory?.shopify?.available || 0;
      
      if (Math.abs(naverStock - shopifyStock) > 0) {
        inventoryDiscrepancies++;
      }
      
      const naverPrice = mapping.pricing?.naver?.sellingPrice || 0;
      const shopifyPrice = mapping.pricing?.shopify?.price || 0;
      
      if (Math.abs(naverPrice - shopifyPrice) > 0.01) {
        priceDiscrepancies++;
      }
    });
    
    return {
      totalProducts,
      activeProducts,
      totalSyncs: syncActivities.length,
      successfulSyncs,
      failedSyncs,
      inventoryDiscrepancies,
      priceDiscrepancies
    };
  }

  /**
   * Generate inventory report
   */
  private async generateInventoryReport(options: ReportOptions): Promise<any> {
    const { startDate, endDate } = options;
    
    const transactions = await InventoryTransaction.find({
      createdAt: { $gte: startDate, $lte: endDate }
    }).lean();
    
    const mappings = await ProductMapping.find({ isActive: true }).lean();
    
    const inventoryStatus = mappings.map(mapping => ({
      sku: mapping.sku,
      productName: mapping.productName,
      naverStock: mapping.inventory?.naver?.available || 0,
      shopifyStock: mapping.inventory?.shopify?.available || 0,
      difference: Math.abs((mapping.inventory?.naver?.available || 0) - (mapping.inventory?.shopify?.available || 0)),
      status: this.getInventoryStatus(mapping),
      lastSynced: mapping.lastSyncedAt
    }));
    
    return {
      totalTransactions: transactions.length,
      byType: this.groupByField(transactions, 'type'),
      byPlatform: this.groupByField(transactions, 'platform'),
      inventoryStatus,
      lowStockItems: inventoryStatus.filter(item => 
        item.naverStock < 10 || item.shopifyStock < 10
      ),
      outOfStockItems: inventoryStatus.filter(item => 
        item.naverStock === 0 || item.shopifyStock === 0
      )
    };
  }

  /**
   * Generate price report
   */
  private async generatePriceReport(options: ReportOptions): Promise<any> {
    const mappings = await ProductMapping.find({ isActive: true }).lean();
    
    const priceComparison = mappings.map(mapping => {
      const naverPrice = mapping.pricing?.naver?.sellingPrice || 0;
      const shopifyPrice = mapping.pricing?.shopify?.price || 0;
      const exchangeRate = mapping.pricing?.exchangeRate || 1300;
      
      return {
        sku: mapping.sku,
        productName: mapping.productName,
        naverPrice,
        shopifyPrice,
        shopifyPriceKRW: shopifyPrice * exchangeRate,
        difference: Math.abs(naverPrice - (shopifyPrice * exchangeRate)),
        differencePercent: naverPrice > 0 
          ? ((Math.abs(naverPrice - (shopifyPrice * exchangeRate)) / naverPrice) * 100).toFixed(2)
          : 0,
        margin: mapping.pricing?.margin || 0,
        lastUpdated: mapping.pricing?.lastUpdated
      };
    });
    
    return {
      totalProducts: priceComparison.length,
      averageNaverPrice: this.calculateAverage(priceComparison, 'naverPrice'),
      averageShopifyPrice: this.calculateAverage(priceComparison, 'shopifyPrice'),
      priceComparison,
      discrepancies: priceComparison.filter(item => item.difference > 100),
      exchangeRate: mappings[0]?.pricing?.exchangeRate || 1300
    };
  }

  /**
   * Generate sync report
   */
  private async generateSyncReport(options: ReportOptions): Promise<any> {
    const { startDate, endDate } = options;
    
    const syncHistory = await this.syncService.getSyncHistory({
      startDate,
      endDate,
      page: 1,
      limit: 1000
    });
    
    return {
      totalSyncs: syncHistory.total,
      byType: this.groupSyncsByType(syncHistory.data),
      byStatus: this.groupSyncsByStatus(syncHistory.data),
      averageDuration: this.calculateAverageDuration(syncHistory.data),
      failureReasons: this.extractFailureReasons(syncHistory.data),
      recentSyncs: syncHistory.data.slice(0, 10)
    };
  }

  /**
   * Generate activity report
   */
  private async generateActivityReport(options: ReportOptions): Promise<any> {
    const { startDate, endDate } = options;
    
    const activities = await Activity.find({
      createdAt: { $gte: startDate, $lte: endDate }
    }).lean();
    
    return {
      totalActivities: activities.length,
      byType: this.groupByField(activities, 'type'),
      byUser: this.groupByField(activities, 'userId'),
      successRate: activities.length > 0 
        ? ((activities.filter(a => a.success).length / activities.length) * 100).toFixed(2)
        : 0,
      mostCommonActions: this.getMostCommonActions(activities),
      failures: activities.filter(a => !a.success).map(a => ({
        action: a.action,
        details: a.details,
        error: a.errorMessage,
        timestamp: a.createdAt
      }))
    };
  }

  /**
   * Generate daily report
   */
  async generateDailyReport(): Promise<ReportData> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 1);
    
    return this.generateReport({
      type: 'daily',
      startDate,
      endDate,
      includeInventory: true,
      includePrice: true,
      includeSync: true,
      includeActivity: true
    });
  }

  /**
   * Generate weekly report
   */
  async generateWeeklyReport(): Promise<ReportData> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);
    
    return this.generateReport({
      type: 'weekly',
      startDate,
      endDate,
      includeInventory: true,
      includePrice: true,
      includeSync: true,
      includeActivity: true
    });
  }

  /**
   * Export report to file
   */
  async exportReport(report: ReportData, format: 'csv' | 'excel' = 'excel'): Promise<Buffer> {
    try {
      if (format === 'csv') {
        return this.exportToCSV(report);
      } else {
        return this.exportToExcel(report);
      }
    } catch (error) {
      logger.error('Failed to export report:', error);
      throw error;
    }
  }

  /**
   * Export to CSV
   */
  private exportToCSV(report: ReportData): Buffer {
    const fields = ['sku', 'productName', 'naverStock', 'shopifyStock', 'naverPrice', 'shopifyPrice'];
    const parser = new Parser({ fields });
    
    const data = report.inventory?.inventoryStatus || [];
    const csv = parser.parse(data);
    
    return Buffer.from(csv);
  }

  /**
   * Export to Excel
   */
  private exportToExcel(report: ReportData): Buffer {
    const workbook = XLSX.utils.book_new();
    
    // Summary sheet
    const summaryData = [
      ['Report Type', report.type],
      ['Generated At', report.generatedAt],
      ['Period Start', report.period.start],
      ['Period End', report.period.end],
      [''],
      ['Summary'],
      ['Total Products', report.summary.totalProducts],
      ['Active Products', report.summary.activeProducts],
      ['Total Syncs', report.summary.totalSyncs],
      ['Successful Syncs', report.summary.successfulSyncs],
      ['Failed Syncs', report.summary.failedSyncs],
      ['Inventory Discrepancies', report.summary.inventoryDiscrepancies],
      ['Price Discrepancies', report.summary.priceDiscrepancies]
    ];
    
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');
    
    // Inventory sheet
    if (report.inventory?.inventoryStatus) {
      const inventorySheet = XLSX.utils.json_to_sheet(report.inventory.inventoryStatus);
      XLSX.utils.book_append_sheet(workbook, inventorySheet, 'Inventory');
    }
    
    // Price sheet
    if (report.price?.priceComparison) {
      const priceSheet = XLSX.utils.json_to_sheet(report.price.priceComparison);
      XLSX.utils.book_append_sheet(workbook, priceSheet, 'Prices');
    }
    
    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }

  // Helper methods
  private getInventoryStatus(mapping: any): string {
    const naverStock = mapping.inventory?.naver?.available || 0;
    const shopifyStock = mapping.inventory?.shopify?.available || 0;
    const difference = Math.abs(naverStock - shopifyStock);
    
    if (naverStock === 0 && shopifyStock === 0) return 'out_of_stock';
    if (difference > 5) return 'mismatch';
    if (naverStock < 10 || shopifyStock < 10) return 'low_stock';
    return 'normal';
  }

  private groupByField(items: any[], field: string): Record<string, number> {
    return items.reduce((acc, item) => {
      const key = item[field] || 'unknown';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
  }

  private calculateAverage(items: any[], field: string): number {
    if (items.length === 0) return 0;
    const sum = items.reduce((acc, item) => acc + (item[field] || 0), 0);
    return sum / items.length;
  }

  private groupSyncsByType(syncs: any[]): Record<string, number> {
    return this.groupByField(syncs, 'type');
  }

  private groupSyncsByStatus(syncs: any[]): Record<string, number> {
    return this.groupByField(syncs, 'status');
  }

  private calculateAverageDuration(syncs: any[]): number {
    const withDuration = syncs.filter(s => s.duration);
    if (withDuration.length === 0) return 0;
    return this.calculateAverage(withDuration, 'duration');
  }

  private extractFailureReasons(syncs: any[]): string[] {
    const failed = syncs.filter(s => s.status === 'failed' && s.error);
    return [...new Set(failed.map(s => s.error))];
  }

  private getMostCommonActions(activities: any[]): Record<string, number> {
    const actions = this.groupByField(activities, 'action');
    return Object.entries(actions)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .reduce((acc, [key, value]) => {
        acc[key] = value;
        return acc;
      }, {} as Record<string, number>);
  }
}

export default ReportService;