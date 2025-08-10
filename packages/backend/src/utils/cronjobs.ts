// packages/backend/src/utils/cronjobs.ts
import cron from 'node-cron';
import { logger } from './logger.js';
import { ServiceContainer } from '../services/ServiceContainer.js';

const scheduledJobs: cron.ScheduledTask[] = [];

export function setupCronJobs(services: ServiceContainer): void {
  if (process.env.ENABLE_CRON_JOBS !== 'true') {
    logger.info('Cron jobs are disabled');
    return;
  }

  logger.info('Setting up cron jobs...');

  // 재고 동기화 작업 (30분마다)
  const syncPattern = process.env.SYNC_CRON_PATTERN || '*/30 * * * *';
  const syncJob = cron.schedule(syncPattern, async () => {
    logger.info('Running inventory sync job...');
    try {
      // 실제 동기화 로직 구현
      logger.info('Inventory sync completed');
    } catch (error) {
      logger.error('Inventory sync failed:', error);
    }
  });
  scheduledJobs.push(syncJob);

  // 환율 업데이트 작업 (6시간마다)
  const exchangeRatePattern = process.env.EXCHANGE_RATE_CRON_PATTERN || '0 */6 * * *';
  const exchangeRateJob = cron.schedule(exchangeRatePattern, async () => {
    logger.info('Updating exchange rates...');
    try {
      // 실제 환율 업데이트 로직 구현
      logger.info('Exchange rates updated');
    } catch (error) {
      logger.error('Exchange rate update failed:', error);
    }
  });
  scheduledJobs.push(exchangeRateJob);

  // 정리 작업 (매일 새벽 2시)
  const cleanupPattern = process.env.CLEANUP_CRON_PATTERN || '0 2 * * *';
  const cleanupJob = cron.schedule(cleanupPattern, async () => {
    logger.info('Running cleanup job...');
    try {
      // 실제 정리 로직 구현
      logger.info('Cleanup completed');
    } catch (error) {
      logger.error('Cleanup failed:', error);
    }
  });
  scheduledJobs.push(cleanupJob);

  logger.info(`✅ ${scheduledJobs.length} cron jobs scheduled`);
}

export async function stopCronJobs(): Promise<void> {
  logger.info('Stopping cron jobs...');
  for (const job of scheduledJobs) {
    job.stop();
  }
  scheduledJobs.length = 0;
  logger.info('All cron jobs stopped');
}