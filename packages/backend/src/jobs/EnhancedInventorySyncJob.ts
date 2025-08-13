// packages/backend/src/jobs/EnhancedInventorySyncJob.ts
import cron from 'node-cron';
import { ServiceContainer } from '../services/ServiceContainer.js';
import { EnhancedInventorySyncService } from '../services/sync/EnhancedInventorySyncService.js';
import { logger } from '../utils/logger.js';
import { getRedisClient } from '../config/redis.js';
import { ProductMapping } from '../models/index.js';

export class EnhancedInventorySyncJob {
  private job: cron.ScheduledTask | null = null;
  private container: ServiceContainer;
  private syncService: EnhancedInventorySyncService | null = null;
  private redis: any;
  private isRunning: boolean = false;
  private syncInterval: string = '*/5 * * * *'; // 5분마다
  private lastSyncTime: Date | null = null;
  private syncCount: number = 0;

  constructor(container: ServiceContainer) {
    this.container = container;
    this.redis = getRedisClient();
    this.initializeSyncService();
  }

  /**
   * 동기화 서비스 초기화
   */
  private initializeSyncService(): void {
    try {
      const naverProductService = this.container.getService('naverProductService');
      const shopifyInventoryService = this.container.getService('shopifyInventoryService');
      
      if (naverProductService && shopifyInventoryService) {
        this.syncService = new EnhancedInventorySyncService(
          naverProductService,
          shopifyInventoryService
        );
        logger.info('✅ Enhanced inventory sync service initialized');
      } else {
        logger.error('Failed to initialize sync service: required services not available');
      }
    } catch (error) {
      logger.error('Error initializing sync service:', error);
    }
  }

  /**
   * 크론 작업 시작
   */
  start(): void {
    if (this.job) {
      logger.warn('Inventory sync job already started');
      return;
    }

    // 환경 변수에서 스케줄 읽기
    const schedule = process.env.INVENTORY_SYNC_SCHEDULE || this.syncInterval;
    
    this.job = cron.schedule(schedule, async () => {
      await this.executeSync();
    }, {
      scheduled: true,
      timezone: "Asia/Seoul"
    });

    logger.info(`✅ Enhanced Inventory sync job started (schedule: ${schedule})`);
    
    // 시작 시 즉시 한 번 실행
    this.executeSync().catch(error => {
      logger.error('Initial inventory sync failed:', error);
    });
  }

  /**
   * 크론 작업 중지
   */
  stop(): void {
    if (this.job) {
      this.job.stop();
      this.job = null;
      logger.info('Enhanced Inventory sync job stopped');
    }
  }

  /**
   * 동기화 실행
   */
  private async executeSync(): Promise<void> {
    // 이미 실행 중이면 스킵
    if (this.isRunning) {
      logger.info('Inventory sync already running, skipping...');
      await this.recordSkippedSync();
      return;
    }

    if (!this.syncService) {
      logger.error('Sync service not initialized, skipping sync');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();
    this.syncCount++;
    
    logger.info(`🔄 Starting scheduled inventory sync #${this.syncCount}...`);
    
    try {
      // 동기화 실행
      const result = await this.syncService.syncAllInventory();
      
      const duration = Date.now() - startTime;
      this.lastSyncTime = new Date();
      
      // 성능 메트릭 저장
      await this.saveMetrics({
        syncNumber: this.syncCount,
        startTime: new Date(startTime),
        duration,
        result,
      });

      // 알림 처리 (중요한 불일치가 있을 경우)
      if (result.failed > 0 || result.synced > 10) {
        await this.sendNotification({
          type: 'inventory_sync',
          level: result.failed > 0 ? 'warning' : 'info',
          message: `Inventory sync completed: ${result.successful} succeeded, ${result.failed} failed, ${result.synced} synced`,
          details: result,
        });
      }

      logger.info(`✅ Scheduled inventory sync #${this.syncCount} completed in ${duration}ms`, {
        total: result.total,
        successful: result.successful,
        failed: result.failed,
        synced: result.synced,
      });
      
    } catch (error: any) {
      const duration = Date.now() - startTime;
      logger.error(`Inventory sync job #${this.syncCount} failed after ${duration}ms:`, error);
      
      // 에러 알림
      await this.sendNotification({
        type: 'inventory_sync_error',
        level: 'error',
        message: `Inventory sync failed: ${error.message}`,
        error: error.stack,
      });
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * 수동 동기화 트리거
   */
  async triggerManualSync(): Promise<any> {
    if (this.isRunning) {
      return {
        success: false,
        message: 'Sync already in progress',
        isRunning: true,
      };
    }

    if (!this.syncService) {
      return {
        success: false,
        message: 'Sync service not initialized',
        error: 'Service unavailable',
      };
    }

    logger.info('Manual inventory sync triggered');
    
    try {
      const result = await this.syncService.syncAllInventory();
      
      return {
        success: true,
        message: 'Manual sync completed',
        result,
      };
    } catch (error: any) {
      logger.error('Manual sync failed:', error);
      return {
        success: false,
        message: 'Manual sync failed',
        error: error.message,
      };
    }
  }

  /**
   * 특정 SKU 동기화
   */
  async syncSpecificSku(sku: string): Promise<any> {
    if (!this.syncService) {
      return {
        success: false,
        message: 'Sync service not initialized',
      };
    }

    try {
      const mapping = await ProductMapping.findOne({ sku, isActive: true }).lean();
      
      if (!mapping) {
        return {
          success: false,
          message: `No active mapping found for SKU: ${sku}`,
        };
      }

      const result = await this.syncService.syncSingleProductInventory(mapping);
      
      return {
        success: result.success,
        message: result.success ? 'SKU sync completed' : 'SKU sync failed',
        result,
      };
    } catch (error: any) {
      logger.error(`Failed to sync SKU ${sku}:`, error);
      return {
        success: false,
        message: 'SKU sync failed',
        error: error.message,
      };
    }
  }

  /**
   * 불일치 리포트 생성
   */
  async getDiscrepancyReport(): Promise<any> {
    if (!this.syncService) {
      return {
        success: false,
        message: 'Sync service not initialized',
      };
    }

    try {
      const report = await this.syncService.generateDiscrepancyReport();
      return {
        success: true,
        report,
      };
    } catch (error: any) {
      logger.error('Failed to generate discrepancy report:', error);
      return {
        success: false,
        message: 'Report generation failed',
        error: error.message,
      };
    }
  }

  /**
   * 동기화 상태 조회
   */
  async getStatus(): Promise<any> {
    const syncStatus = this.syncService ? 
      await this.syncService.getSyncStatus() : 
      { message: 'Service not initialized' };
    
    // 메트릭 조회
    const metrics = await this.redis.get('inventory:sync:metrics');
    const recentSyncs = await this.redis.lrange('inventory:sync:history', 0, 9);
    
    return {
      isRunning: this.isRunning,
      cronStatus: this.job ? 'active' : 'inactive',
      schedule: process.env.INVENTORY_SYNC_SCHEDULE || this.syncInterval,
      lastSyncTime: this.lastSyncTime,
      syncCount: this.syncCount,
      nextRun: this.job ? this.getNextRunTime() : null,
      syncServiceStatus: syncStatus,
      metrics: metrics ? JSON.parse(metrics) : null,
      recentSyncs: recentSyncs.map(s => JSON.parse(s)),
    };
  }

  /**
   * 다음 실행 시간 계산
   */
  private getNextRunTime(): string {
    if (!this.lastSyncTime) {
      return new Date(Date.now() + 5 * 60 * 1000).toISOString();
    }
    
    const nextTime = new Date(this.lastSyncTime.getTime() + 5 * 60 * 1000);
    return nextTime.toISOString();
  }

  /**
   * 메트릭 저장
   */
  private async saveMetrics(data: any): Promise<void> {
    try {
      // 현재 메트릭
      await this.redis.setex(
        'inventory:sync:metrics',
        86400, // 24시간
        JSON.stringify({
          lastSync: data.startTime,
          duration: data.duration,
          total: data.result.total,
          successful: data.result.successful,
          failed: data.result.failed,
          synced: data.result.synced,
        })
      );

      // 히스토리
      await this.redis.lpush(
        'inventory:sync:history',
        JSON.stringify({
          syncNumber: data.syncNumber,
          timestamp: data.startTime,
          duration: data.duration,
          success: data.result.failed === 0,
          summary: {
            total: data.result.total,
            successful: data.result.successful,
            failed: data.result.failed,
            synced: data.result.synced,
          },
        })
      );

      // 최대 100개 히스토리 유지
      await this.redis.ltrim('inventory:sync:history', 0, 99);
    } catch (error) {
      logger.error('Failed to save sync metrics:', error);
    }
  }

  /**
   * 스킵된 동기화 기록
   */
  private async recordSkippedSync(): Promise<void> {
    try {
      await this.redis.incr('inventory:sync:skipped');
      await this.redis.expire('inventory:sync:skipped', 86400);
    } catch (error) {
      logger.error('Failed to record skipped sync:', error);
    }
  }

  /**
   * 알림 전송
   */
  private async sendNotification(notification: any): Promise<void> {
    try {
      // NotificationService가 있으면 사용
      if (this.container.hasService('notificationService')) {
        const notificationService = this.container.getService('notificationService');
        await notificationService.send({
          type: notification.type,
          title: 'Inventory Sync',
          message: notification.message,
          priority: notification.level === 'error' ? 'high' : 'normal',
          data: notification.details || notification.error,
        });
      }

      // Redis pub/sub으로도 전송
      await this.redis.publish(
        'inventory:notifications',
        JSON.stringify(notification)
      );
    } catch (error) {
      logger.error('Failed to send notification:', error);
    }
  }

  /**
   * 리소스 정리
   */
  async cleanup(): Promise<void> {
    this.stop();
    this.syncService = null;
    logger.info('Enhanced inventory sync job cleaned up');
  }
}

export default EnhancedInventorySyncJob;