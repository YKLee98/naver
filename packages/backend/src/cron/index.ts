// packages/backend/src/cron/index.ts
import cron from 'node-cron';
import { ServiceContainer } from '../services/ServiceContainer.js';
import { logger } from '../utils/logger.js';

export interface CronJob {
  name: string;
  schedule: string;
  task: () => Promise<void>;
  enabled: boolean;
}

class CronManager {
  private jobs: Map<string, cron.ScheduledTask> = new Map();
  private services: ServiceContainer;

  constructor(services: ServiceContainer) {
    this.services = services;
  }

  /**
   * Register a cron job
   */
  registerJob(job: CronJob): void {
    if (!job.enabled) {
      logger.info(`Cron job '${job.name}' is disabled`);
      return;
    }

    if (!cron.validate(job.schedule)) {
      logger.error(`Invalid cron schedule for job '${job.name}': ${job.schedule}`);
      return;
    }

    const task = cron.schedule(job.schedule, async () => {
      logger.info(`Starting cron job: ${job.name}`);
      const startTime = Date.now();

      try {
        await job.task();
        const duration = Date.now() - startTime;
        logger.info(`Cron job '${job.name}' completed in ${duration}ms`);
      } catch (error) {
        logger.error(`Cron job '${job.name}' failed:`, error);
      }
    }, {
      scheduled: false
    });

    this.jobs.set(job.name, task);
    logger.info(`Registered cron job: ${job.name} (${job.schedule})`);
  }

  /**
   * Start all registered jobs
   */
  startAll(): void {
    this.jobs.forEach((task, name) => {
      task.start();
      logger.info(`Started cron job: ${name}`);
    });
  }

  /**
   * Stop all jobs
   */
  stopAll(): void {
    this.jobs.forEach((task, name) => {
      task.stop();
      logger.info(`Stopped cron job: ${name}`);
    });
  }

  /**
   * Get job status
   */
  getStatus(): Record<string, boolean> {
    const status: Record<string, boolean> = {};
    
    this.jobs.forEach((task, name) => {
      status[name] = task.getStatus() === 'running';
    });
    
    return status;
  }
}

/**
 * Setup and start cron jobs
 */
export function setupCronJobs(services: ServiceContainer): void {
  const cronManager = new CronManager(services);
  
  // ============================================
  // Sync Jobs
  // ============================================
  
  // Auto sync inventory (every hour)
  cronManager.registerJob({
    name: 'Auto Sync Inventory',
    schedule: process.env.CRON_SYNC_INVENTORY || '0 * * * *',
    enabled: process.env.AUTO_SYNC_ENABLED === 'true',
    task: async () => {
      try {
        if (services.syncService) {
          await services.syncService.syncInventory({});
        }
      } catch (error) {
        logger.error('Auto sync inventory failed:', error);
      }
    }
  });

  // Auto sync prices (every 6 hours)
  cronManager.registerJob({
    name: 'Auto Sync Prices',
    schedule: process.env.CRON_SYNC_PRICES || '0 */6 * * *',
    enabled: process.env.AUTO_SYNC_ENABLED === 'true',
    task: async () => {
      try {
        if (services.syncService) {
          await services.syncService.syncPrices({});
        }
      } catch (error) {
        logger.error('Auto sync prices failed:', error);
      }
    }
  });

  // ============================================
  // Exchange Rate Jobs
  // ============================================
  
  // Update exchange rates (daily at 9 AM)
  cronManager.registerJob({
    name: 'Update Exchange Rates',
    schedule: process.env.CRON_EXCHANGE_RATE || '0 9 * * *',
    enabled: true,
    task: async () => {
      try {
        if (services.exchangeRateService) {
          await services.exchangeRateService.updateRates();
        }
      } catch (error) {
        logger.error('Update exchange rates failed:', error);
      }
    }
  });

  // ============================================
  // Cleanup Jobs
  // ============================================
  
  // Clean old logs (daily at 2 AM)
  cronManager.registerJob({
    name: 'Clean Old Logs',
    schedule: process.env.CRON_CLEAN_LOGS || '0 2 * * *',
    enabled: true,
    task: async () => {
      try {
        const { Activity, SystemLog, WebhookLog } = await import('../models/index.js');
        
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        // Clean old activities
        const activityResult = await Activity.deleteMany({
          createdAt: { $lt: thirtyDaysAgo }
        });
        
        logger.info(`Cleaned ${activityResult.deletedCount} old activity records`);
        
        // Clean old system logs
        const systemLogResult = await SystemLog.deleteMany({
          createdAt: { $lt: thirtyDaysAgo }
        });
        
        logger.info(`Cleaned ${systemLogResult.deletedCount} old system log records`);
        
        // Clean old webhook logs
        const webhookLogResult = await WebhookLog.deleteMany({
          createdAt: { $lt: thirtyDaysAgo }
        });
        
        logger.info(`Cleaned ${webhookLogResult.deletedCount} old webhook log records`);
      } catch (error) {
        logger.error('Clean old logs failed:', error);
      }
    }
  });

  // Clean expired sessions (every hour)
  cronManager.registerJob({
    name: 'Clean Expired Sessions',
    schedule: process.env.CRON_CLEAN_SESSIONS || '0 * * * *',
    enabled: true,
    task: async () => {
      try {
        const { Session } = await import('../models/index.js');
        
        const result = await Session.deleteMany({
          expiresAt: { $lt: new Date() }
        });
        
        logger.info(`Cleaned ${result.deletedCount} expired sessions`);
      } catch (error) {
        logger.error('Clean expired sessions failed:', error);
      }
    }
  });

  // ============================================
  // Health Check Jobs
  // ============================================
  
  // Health check (every 5 minutes)
  cronManager.registerJob({
    name: 'Health Check',
    schedule: process.env.CRON_HEALTH_CHECK || '*/5 * * * *',
    enabled: process.env.HEALTH_CHECK_ENABLED === 'true',
    task: async () => {
      try {
        const mongoose = await import('mongoose');
        const redis = services.redis;
        
        // Check MongoDB
        const mongoStatus = mongoose.connection.readyState === 1;
        
        // Check Redis
        const redisStatus = await redis.ping() === 'PONG';
        
        if (!mongoStatus || !redisStatus) {
          logger.error('Health check failed:', {
            mongodb: mongoStatus,
            redis: redisStatus
          });
          
          // Send alert notification
          if (services.notificationService) {
            await services.notificationService.sendSystemNotification(
              'error',
              'Health Check Failed',
              'One or more services are not responding',
              { mongodb: mongoStatus, redis: redisStatus }
            );
          }
        }
      } catch (error) {
        logger.error('Health check error:', error);
      }
    }
  });

  // ============================================
  // Report Generation Jobs
  // ============================================
  
  // Generate daily report (daily at 11 PM)
  cronManager.registerJob({
    name: 'Generate Daily Report',
    schedule: process.env.CRON_DAILY_REPORT || '0 23 * * *',
    enabled: process.env.DAILY_REPORT_ENABLED === 'true',
    task: async () => {
      try {
        if (services.reportService) {
          await services.reportService.generateDailyReport();
        }
      } catch (error) {
        logger.error('Generate daily report failed:', error);
      }
    }
  });

  // Generate weekly report (Sunday at 11 PM)
  cronManager.registerJob({
    name: 'Generate Weekly Report',
    schedule: process.env.CRON_WEEKLY_REPORT || '0 23 * * 0',
    enabled: process.env.WEEKLY_REPORT_ENABLED === 'true',
    task: async () => {
      try {
        if (services.reportService) {
          await services.reportService.generateWeeklyReport();
        }
      } catch (error) {
        logger.error('Generate weekly report failed:', error);
      }
    }
  });

  // ============================================
  // Inventory Check Jobs
  // ============================================
  
  // Check low stock (every 2 hours)
  cronManager.registerJob({
    name: 'Check Low Stock',
    schedule: process.env.CRON_LOW_STOCK_CHECK || '0 */2 * * *',
    enabled: true,
    task: async () => {
      try {
        const { ProductMapping } = await import('../models/index.js');
        
        const lowStockProducts = await ProductMapping.find({
          $or: [
            { 'inventory.naver.available': { $lt: 10 } },
            { 'inventory.shopify.available': { $lt: 10 } }
          ],
          isActive: true
        });
        
        if (lowStockProducts.length > 0 && services.notificationService) {
          for (const product of lowStockProducts) {
            const naverStock = product.inventory?.naver?.available || 0;
            const shopifyStock = product.inventory?.shopify?.available || 0;
            const minStock = Math.min(naverStock, shopifyStock);
            
            await services.notificationService.sendInventoryAlert(
              product.sku,
              minStock,
              10
            );
          }
        }
        
        logger.info(`Low stock check completed: ${lowStockProducts.length} products with low stock`);
      } catch (error) {
        logger.error('Check low stock failed:', error);
      }
    }
  });

  // Start all jobs
  cronManager.startAll();
  
  logger.info('✅ Cron jobs initialized and started');
  
  // Register shutdown handler
  process.on('SIGTERM', () => {
    logger.info('Stopping cron jobs...');
    cronManager.stopAll();
  });
}

export default setupCronJobs;