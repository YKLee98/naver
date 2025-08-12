// packages/backend/src/cron/index.ts
import * as cron from 'node-cron';
import { logger } from '../utils/logger.js';
import { ServiceContainer } from '../services/ServiceContainer.js';

interface CronJob {
  name: string;
  schedule: string;
  handler: () => Promise<void>;
  enabled?: boolean;
}

/**
 * Cron Manager for scheduled tasks
 */
export class CronManager {
  private jobs: Map<string, cron.ScheduledTask> = new Map();
  private services: ServiceContainer;
  private isRunning: boolean = false;

  constructor(services: ServiceContainer) {
    this.services = services;
  }

  /**
   * Start all cron jobs
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Cron manager already running');
      return;
    }

    logger.info('Starting cron manager...');

    const jobs: CronJob[] = [
      {
        name: 'Inventory Sync',
        schedule: process.env.CRON_INVENTORY_SYNC || '*/5 * * * *', // Every 5 minutes
        handler: () => this.syncInventory(),
        enabled: process.env.ENABLE_INVENTORY_SYNC !== 'false', // 기본적으로 활성화
      },
      {
        name: 'Price Sync',
        schedule: process.env.CRON_PRICE_SYNC || '0 0 */6 * * *', // Every 6 hours
        handler: () => this.syncPrices(),
        enabled: process.env.ENABLE_PRICE_SYNC === 'true',
      },
      {
        name: 'Exchange Rate Update',
        schedule: process.env.CRON_EXCHANGE_RATE || '0 0 2 * * *', // Daily at 2 AM
        handler: () => this.updateExchangeRate(),
        enabled: process.env.ENABLE_EXCHANGE_RATE_UPDATE === 'true',
      },
      {
        name: 'Cleanup Old Logs',
        schedule: process.env.CRON_CLEANUP_LOGS || '0 0 3 * * *', // Daily at 3 AM
        handler: () => this.cleanupOldLogs(),
        enabled: process.env.ENABLE_LOG_CLEANUP === 'true',
      },
      {
        name: 'Health Report',
        schedule: process.env.CRON_HEALTH_REPORT || '0 0 9 * * *', // Daily at 9 AM
        handler: () => this.sendHealthReport(),
        enabled: process.env.ENABLE_HEALTH_REPORT === 'true',
      },
    ];

    for (const job of jobs) {
      if (job.enabled !== false) {
        this.scheduleJob(job);
      } else {
        logger.info(`Cron job ${job.name} is disabled`);
      }
    }

    this.isRunning = true;
    logger.info(`✅ Cron manager started with ${this.jobs.size} jobs`);
  }

  /**
   * Stop all cron jobs
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    logger.info('Stopping cron manager...');

    for (const [name, task] of this.jobs) {
      task.stop();
      logger.info(`Stopped cron job: ${name}`);
    }

    this.jobs.clear();
    this.isRunning = false;

    logger.info('✅ Cron manager stopped');
  }

  /**
   * Schedule a cron job
   */
  private scheduleJob(job: CronJob): void {
    if (this.jobs.has(job.name)) {
      logger.warn(`Cron job ${job.name} already scheduled`);
      return;
    }

    const task = cron.schedule(
      job.schedule,
      async () => {
        logger.info(`🕐 Starting cron job: ${job.name}`);
        const startTime = Date.now();

        try {
          await job.handler();

          const duration = Date.now() - startTime;
          logger.info(`✅ Cron job ${job.name} completed in ${duration}ms`);
        } catch (error) {
          logger.error(`❌ Cron job ${job.name} failed:`, error);
        }
      },
      {
        scheduled: false,
      }
    );

    task.start();
    this.jobs.set(job.name, task);

    logger.info(`Scheduled cron job: ${job.name} (${job.schedule})`);
  }

  /**
   * Sync inventory
   */
  private async syncInventory(): Promise<void> {
    try {
      // InventorySyncJob 사용
      const { InventorySyncJob } = await import('../jobs/InventorySyncJob.js');
      const inventorySyncJob = new InventorySyncJob(this.services);
      
      logger.info('🔄 Running inventory sync from cron...');
      const result = await inventorySyncJob.triggerManualSync();
      logger.info('✅ Inventory sync completed from cron:', result);
    } catch (error) {
      logger.error('Inventory sync cron failed:', error);
      throw error;
    }
  }

  /**
   * Sync prices
   */
  private async syncPrices(): Promise<void> {
    if (!this.services?.hasService('syncService')) {
      logger.warn('Sync service not available');
      return;
    }

    try {
      const syncService = this.services.getService('syncService');
      await syncService.startSync({
        type: 'price',
        priority: 'normal',
        metadata: {
          source: 'cron',
          scheduled: true,
        },
      });
    } catch (error) {
      logger.error('Price sync cron failed:', error);
      throw error;
    }
  }

  /**
   * Update exchange rate
   */
  private async updateExchangeRate(): Promise<void> {
    if (!this.services?.hasService('exchangeRateService')) {
      logger.warn('Exchange rate service not available');
      return;
    }

    try {
      const exchangeRateService = this.services.getService(
        'exchangeRateService'
      );
      await exchangeRateService.updateRates();
      logger.info('Exchange rates updated successfully');
    } catch (error) {
      logger.error('Exchange rate update cron failed:', error);
      throw error;
    }
  }

  /**
   * Cleanup old logs
   */
  private async cleanupOldLogs(): Promise<void> {
    try {
      logger.info('Cleaning up old logs...');

      // Import models dynamically
      const { SystemLog, ActivityLog, SyncLog } = await import(
        '../models/index.js'
      );

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 30); // 30 days retention

      // Clean system logs
      const systemResult = await SystemLog.deleteMany({
        timestamp: { $lt: cutoffDate },
      });
      logger.info(`Deleted ${systemResult.deletedCount} old system logs`);

      // Clean activity logs
      const activityResult = await ActivityLog.deleteMany({
        timestamp: { $lt: cutoffDate },
      });
      logger.info(`Deleted ${activityResult.deletedCount} old activity logs`);

      // Clean sync logs
      const syncResult = await SyncLog.deleteMany({
        startTime: { $lt: cutoffDate },
      });
      logger.info(`Deleted ${syncResult.deletedCount} old sync logs`);

      logger.info('✅ Log cleanup completed');
    } catch (error) {
      logger.error('Log cleanup cron failed:', error);
      throw error;
    }
  }

  /**
   * Send health report
   */
  private async sendHealthReport(): Promise<void> {
    try {
      logger.info('Generating health report...');

      // Collect metrics
      const metrics = {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        timestamp: new Date().toISOString(),
        services: {},
      };

      // Check service health
      if (this.services) {
        const status = this.services.getInitializationStatus();
        metrics.services = {
          total: status.summary.total,
          healthy: status.summary.success,
          failed: status.summary.failed,
        };
      }

      // Send notification if notification service is available
      if (this.services?.hasService('notificationService')) {
        const notificationService = this.services.getService(
          'notificationService'
        );
        await notificationService.send({
          type: 'health_report',
          title: 'Daily Health Report',
          message: 'System health check completed',
          data: metrics,
          priority: 'low',
        });
      }

      logger.info('✅ Health report sent', metrics);
    } catch (error) {
      logger.error('Health report cron failed:', error);
      throw error;
    }
  }

  /**
   * Get job status
   */
  getStatus(): { name: string; running: boolean }[] {
    const status: { name: string; running: boolean }[] = [];

    for (const [name, task] of this.jobs) {
      status.push({
        name,
        running: task.getStatus() === 'scheduled',
      });
    }

    return status;
  }
}
