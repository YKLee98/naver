// packages/backend/src/cron/index.ts
import cron from 'node-cron';
import { logger } from '../utils/logger.js';
import { ServiceContainer } from '../services/ServiceContainer.js';

interface CronJob {
  name: string;
  schedule: string;
  handler: () => Promise<void>;
  enabled: boolean;
}

class CronManager {
  private jobs: Map<string, cron.ScheduledTask> = new Map();
  private services?: ServiceContainer;

  /**
   * Setup all cron jobs
   */
  async setup(services: ServiceContainer): Promise<void> {
    this.services = services;
    
    const jobs: CronJob[] = [
      {
        name: 'Inventory Sync',
        schedule: '0 */30 * * * *', // Every 30 minutes
        handler: () => this.syncInventory(),
        enabled: true
      },
      {
        name: 'Price Sync',
        schedule: '0 0 */6 * * *', // Every 6 hours
        handler: () => this.syncPrices(),
        enabled: true
      },
      {
        name: 'Exchange Rate Update',
        schedule: '0 0 */1 * * *', // Every hour
        handler: () => this.updateExchangeRate(),
        enabled: true
      },
      {
        name: 'Cleanup Old Logs',
        schedule: '0 0 3 * * *', // Daily at 3 AM
        handler: () => this.cleanupOldLogs(),
        enabled: true
      },
      {
        name: 'Health Check Report',
        schedule: '0 0 */1 * * *', // Every hour
        handler: () => this.sendHealthReport(),
        enabled: false // Disabled by default
      }
    ];

    for (const job of jobs) {
      if (job.enabled) {
        this.scheduleJob(job);
      }
    }

    logger.info(`✅ Scheduled ${this.jobs.size} cron jobs`);
  }

  /**
   * Schedule a single job
   */
  private scheduleJob(job: CronJob): void {
    if (this.jobs.has(job.name)) {
      logger.warn(`Cron job ${job.name} already scheduled`);
      return;
    }

    const task = cron.schedule(job.schedule, async () => {
      logger.info(`🕐 Starting cron job: ${job.name}`);
      const startTime = Date.now();
      
      try {
        await job.handler();
        
        const duration = Date.now() - startTime;
        logger.info(`✅ Cron job ${job.name} completed in ${duration}ms`);
      } catch (error) {
        logger.error(`❌ Cron job ${job.name} failed:`, error);
      }
    }, {
      scheduled: false
    });

    task.start();
    this.jobs.set(job.name, task);
    
    logger.info(`Scheduled cron job: ${job.name} (${job.schedule})`);
  }

  /**
   * Sync inventory
   */
  private async syncInventory(): Promise<void> {
    if (!this.services?.hasService('syncService')) {
      logger.warn('Sync service not available');
      return;
    }

    try {
      const syncService = this.services.getService('syncService');
      await syncService.startSync({
        type: 'inventory',
        priority: 'normal',
        metadata: {
          source: 'cron',
          scheduled: true
        }
      });
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
          scheduled: true
        }
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
      const exchangeRateService = this.services.getService('exchangeRateService');
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
    // Implementation would go here
    logger.info('Cleaning up old logs...');
    
    // This would typically:
    // 1. Delete old log files
    // 2. Clean up old database records
    // 3. Clear old cache entries
  }

  /**
   * Send health report
   */
  private async sendHealthReport(): Promise<void> {
    // Implementation would go here
    logger.info('Sending health report...');
    
    // This would typically:
    // 1. Collect health metrics
    // 2. Send email or notification
    // 3. Log to monitoring system
  }

  /**
   * Stop all cron jobs
   */
  stopAll(): void {
    for (const [name, task] of this.jobs) {
      task.stop();
      logger.info(`Stopped cron job: ${name}`);
    }
    
    this.jobs.clear();
    logger.info('All cron jobs stopped');
  }

  /**
   * Start specific job
   */
  startJob(name: string): void {
    const task = this.jobs.get(name);
    if (task) {
      task.start();
      logger.info(`Started cron job: ${name}`);
    } else {
      logger.warn(`Cron job not found: ${name}`);
    }
  }

  /**
   * Stop specific job
   */
  stopJob(name: string): void {
    const task = this.jobs.get(name);
    if (task) {
      task.stop();
      logger.info(`Stopped cron job: ${name}`);
    } else {
      logger.warn(`Cron job not found: ${name}`);
    }
  }

  /**
   * Get job status
   */
  getJobStatus(): Array<{ name: string; running: boolean }> {
    const status: Array<{ name: string; running: boolean }> = [];
    
    for (const [name, task] of this.jobs) {
      status.push({
        name,
        running: true // node-cron doesn't provide running status directly
      });
    }
    
    return status;
  }
}

// Create singleton instance
const cronManager = new CronManager();

/**
 * Setup cron jobs
 */
export async function setupCronJobs(services: ServiceContainer): Promise<void> {
  await cronManager.setup(services);
}

/**
 * Stop all cron jobs
 */
export function stopCronJobs(): void {
  cronManager.stopAll();
}

export { cronManager };