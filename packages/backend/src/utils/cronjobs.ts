import cron, { ScheduledTask } from 'node-cron';
import { logger } from './logger';
import { getRedisClient } from '../config/redis';
import { SystemLog } from '../models';
import { service } from 'aws-sdk/clients/health';

interface CronJob {
  name: string;
  schedule: string;
  task: () => Promise<void>;
  isRunning: boolean;
}

const cronJobs: Map<string, ScheduledTask> = new Map();
let syncServiceInstance: any = null;
let exchangeRateServiceInstance: any = null;

export function setCronServices(services:{
    syncService: any;
    exchangeRateService: any;
    }): void {
    syncServiceInstance = services.syncService;
    exchangeRateServiceInstance = services.exchangeRateService;
}

/**
 * 전체 동기화 작업
 */
async function fullSyncJob(): Promise<void> {
  const jobName = 'full-sync';
  const redis = getRedisClient();
  
  try {
    // 중복 실행 방지
    const isRunning = await redis.get(`cronjob:${jobName}:running`);
    if (isRunning === 'true') {
      logger.warn(`Cron job ${jobName} is already running, skipping`);
      return;
    }
    
    // 실행 상태 설정
    await redis.setex(`cronjob:${jobName}:running`, 3600, 'true'); // 1시간 TTL
    
    logger.info(`Starting cron job: ${jobName}`);
    
    // 자동 동기화 설정 확인
    const autoSync = await redis.get('sync:autoSync');
    if (autoSync !== 'true') {
      logger.info('Auto sync is disabled, skipping');
      return;
    }
    
    // 동기화 실행
    if (!syncServiceInstance) {
        throw new Error('SyncService not initialized');
    }
    await syncServiceInstance.performFullSync();
    logger.info(`Cron job completed: ${jobName}`);
    // 마지막 실행 시간 기록
    await redis.set(`cronjob:${jobName}:lastRun`, new Date().toISOString());
    
    logger.info(`Cron job completed: ${jobName}`);
  } catch (error) {
    logger.error(`Cron job failed: ${jobName}`, error);
    
    await SystemLog.create({
      level: 'error',
      category: 'cronjob',
      message: `Cron job failed: ${jobName}`,
      context: { service: 'cronJobs', method: jobName },
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
    });
  } finally {
    // 실행 상태 해제
    await redis.del(`cronjob:${jobName}:running`);
  }
}

/**
 * 환율 업데이트 작업
 */
async function updateExchangeRateJob(): Promise<void> {
  const jobName = 'update-exchange-rate';
  
  try {
    logger.info(`Starting cron job: ${jobName}`);
    
    if (!exchangeRateServiceInstance) {
      throw new Error('ExchangeRateService not initialized');
    }

    await exchangeRateServiceInstance.updateExchangeRate();
    logger.info(`Cron job completed: ${jobName}`);
  } catch (error) {
    logger.error(`Cron job failed: ${jobName}`, error);
  }
}

/**
 * 로그 정리 작업
 */
async function cleanupLogsJob(): Promise<void> {
  const jobName = 'cleanup-logs';
  
  try {
    logger.info(`Starting cron job: ${jobName}`);
    
    // 30일 이상 된 로그 삭제
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const result = await SystemLog.deleteMany({
      createdAt: { $lt: thirtyDaysAgo },
    });
    
    logger.info(`Deleted ${result.deletedCount} old log entries`);
    logger.info(`Cron job completed: ${jobName}`);
  } catch (error) {
    logger.error(`Cron job failed: ${jobName}`, error);
  }
}

/**
 * 크론 작업 설정
 */
export function setupCronJobs(): void {
  logger.info('Setting up cron jobs');
  
  // 전체 동기화 - 매 30분마다
  const fullSyncTask = cron.schedule('*/30 * * * *', fullSyncJob);
  cronJobs.set('full-sync', fullSyncTask);
  
  // 환율 업데이트 - 매일 오전 9시
  const exchangeRateTask = cron.schedule('0 9 * * *', updateExchangeRateJob);
  cronJobs.set('update-exchange-rate', exchangeRateTask);
  
  // 로그 정리 - 매일 새벽 3시
  const cleanupLogsTask = cron.schedule('0 3 * * *', cleanupLogsJob);
  cronJobs.set('cleanup-logs', cleanupLogsTask);
  // 모든 작업 시작
  cronJobs.forEach((task, name) => {
    task.start();
    logger.info(`Cron job started: ${name}`);
  });
}

/**
 * 크론 작업 중지
 */
export function stopCronJobs(): void {
  logger.info('Stopping cron jobs');
  
  cronJobs.forEach((task, name) => {
    task.stop();
    logger.info(`Cron job stopped: ${name}`);
  });
  
  cronJobs.clear();
}

/**
 * 특정 크론 작업 수동 실행
 */
export async function runCronJob(jobName: string): Promise<void> {
  switch (jobName) {
    case 'full-sync':
      await fullSyncJob();
      break;
    case 'update-exchange-rate':
      await updateExchangeRateJob();
      break;
    case 'cleanup-logs':
      await cleanupLogsJob();
      break;
    default:
      throw new Error(`Unknown cron job: ${jobName}`);
  }
}

/**
 * 크론 작업 상태 조회
 */
export interface CronJobStatus {
  name: string;
  isScheduled: boolean;
  isRunning: boolean;
  lastRun: string | null;
}

export async function getCronJobStatus(): Promise<CronJobStatus[]> {
  const redis = getRedisClient();
  const status: CronJobStatus[] = [];
  
  for (const [name, task] of cronJobs) {
    const lastRun = await redis.get(`cronjob:${name}:lastRun`);
    const isRunning = await redis.get(`cronjob:${name}:running`) === 'true';
    
    status.push({
      name,
      isScheduled: task !== null,
      isRunning,
      lastRun: lastRun || null,
    });
  }
  
  return status;
}


