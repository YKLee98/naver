// packages/backend/src/utils/cronjobs.ts
import cron from 'node-cron';
import { logger } from './logger';
import { SyncService } from '../services/sync/SyncService';
import { ExchangeRateService } from '../services/exchangeRate/ExchangeRateService';
import { SystemLog } from '../models';

interface CronServices {
  syncService: SyncService;
  exchangeRateService: ExchangeRateService;
}

let services: CronServices | null = null;
const scheduledJobs: cron.ScheduledTask[] = [];

/**
 * 크론 서비스 설정
 */
export function setCronServices(cronServices: CronServices): void {
  services = cronServices;
}

/**
 * 크론 작업 설정
 */
export function setupCronJobs(): void {
  if (!services) {
    throw new Error('Cron services not initialized. Call setCronServices first.');
  }

  logger.info('Setting up cron jobs...');

  // 환율 업데이트 (매일 오전 9시)
  const exchangeRateJob = cron.schedule('0 9 * * *', async () => {
    logger.info('Starting scheduled exchange rate update...');
    
    try {
      await services!.exchangeRateService.updateExchangeRate();
      
      await SystemLog.create({
        level: 'info',
        category: 'cron',
        message: 'Exchange rate update completed successfully',
        context: {
          job: 'exchangeRateUpdate',
          executedAt: new Date(),
        },
        metadata: {},
      });
    } catch (error) {
      logger.error('Failed to update exchange rate:', error);
      
      await SystemLog.create({
        level: 'error',
        category: 'cron',
        message: 'Exchange rate update failed',
        context: {
          job: 'exchangeRateUpdate',
          executedAt: new Date(),
        },
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
        metadata: {},
      });
    }
  }, {
    scheduled: true,
    timezone: 'Asia/Seoul'
  });

  scheduledJobs.push(exchangeRateJob);

  // 네이버 주문 동기화 (30분마다)
  const orderSyncJob = cron.schedule('*/30 * * * *', async () => {
    logger.info('Starting scheduled Naver order sync...');
    
    try {
      await services!.syncService.syncNaverOrders();
      
      await SystemLog.create({
        level: 'info',
        category: 'cron',
        message: 'Naver order sync completed successfully',
        context: {
          job: 'naverOrderSync',
          executedAt: new Date(),
        },
        metadata: {},
      });
    } catch (error) {
      logger.error('Failed to sync Naver orders:', error);
      
      await SystemLog.create({
        level: 'error',
        category: 'cron',
        message: 'Naver order sync failed',
        context: {
          job: 'naverOrderSync',
          executedAt: new Date(),
        },
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
        metadata: {},
      });
    }
  }, {
    scheduled: true
  });

  scheduledJobs.push(orderSyncJob);

  // 전체 동기화 (매일 새벽 2시)
  const fullSyncJob = cron.schedule('0 2 * * *', async () => {
    logger.info('Starting scheduled full sync...');
    
    try {
      const result = await services!.syncService.performFullSync();
      
      await SystemLog.create({
        level: 'info',
        category: 'cron',
        message: 'Full sync completed successfully',
        context: {
          job: 'fullSync',
          executedAt: new Date(),
        },
        metadata: {
          result: {
            totalItems: result.totalItems,
            successCount: result.successCount,
            failureCount: result.failureCount,
            duration: result.duration,
          },
        },
      });
    } catch (error) {
      logger.error('Failed to perform full sync:', error);
      
      await SystemLog.create({
        level: 'error',
        category: 'cron',
        message: 'Full sync failed',
        context: {
          job: 'fullSync',
          executedAt: new Date(),
        },
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
        metadata: {},
      });
    }
  }, {
    scheduled: true,
    timezone: 'Asia/Seoul'
  });

  scheduledJobs.push(fullSyncJob);

  // 로그 정리 (매주 일요일 새벽 3시)
  const logCleanupJob = cron.schedule('0 3 * * 0', async () => {
    logger.info('Starting scheduled log cleanup...');
    
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // 오래된 시스템 로그 삭제
      const result = await SystemLog.deleteMany({
        createdAt: { $lt: thirtyDaysAgo },
        level: { $in: ['info', 'debug'] }
      });

      logger.info(`Cleaned up ${result.deletedCount} old log entries`);
      
      await SystemLog.create({
        level: 'info',
        category: 'cron',
        message: 'Log cleanup completed successfully',
        context: {
          job: 'logCleanup',
          executedAt: new Date(),
        },
        metadata: {
          deletedCount: result.deletedCount,
        },
      });
    } catch (error) {
      logger.error('Failed to clean up logs:', error);
      
      await SystemLog.create({
        level: 'error',
        category: 'cron',
        message: 'Log cleanup failed',
        context: {
          job: 'logCleanup',
          executedAt: new Date(),
        },
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
        metadata: {},
      });
    }
  }, {
    scheduled: true,
    timezone: 'Asia/Seoul'
  });

  scheduledJobs.push(logCleanupJob);

  logger.info(`${scheduledJobs.length} cron jobs scheduled successfully`);
}

/**
 * 크론 작업 중지
 */
export function stopCronJobs(): void {
  logger.info('Stopping cron jobs...');
  
  scheduledJobs.forEach((job, index) => {
    job.stop();
    logger.info(`Cron job ${index + 1} stopped`);
  });
  
  scheduledJobs.length = 0;
  logger.info('All cron jobs stopped');
}

/**
 * 크론 작업 재시작
 */
export function restartCronJobs(): void {
  logger.info('Restarting cron jobs...');
  
  stopCronJobs();
  setupCronJobs();
  
  logger.info('Cron jobs restarted successfully');
}

/**
 * 특정 크론 작업 수동 실행
 */
export async function runCronJobManually(jobName: string): Promise<void> {
  if (!services) {
    throw new Error('Cron services not initialized');
  }

  logger.info(`Manually running cron job: ${jobName}`);

  switch (jobName) {
    case 'exchangeRate':
      await services.exchangeRateService.updateExchangeRate();
      break;
    case 'naverOrderSync':
      await services.syncService.syncNaverOrders();
      break;
    case 'fullSync':
      await services.syncService.performFullSync();
      break;
    default:
      throw new Error(`Unknown cron job: ${jobName}`);
  }

  logger.info(`Cron job ${jobName} completed manually`);
}