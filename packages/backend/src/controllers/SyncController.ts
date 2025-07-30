// packages/backend/src/controllers/SyncController.ts
import { Request, Response, NextFunction } from 'express';
import { SyncService } from '../services/sync';
import { getRedisClient } from '../config/redis';
import { logger } from '../utils/logger';

interface SyncSettings {
  syncInterval: number;
  autoSync: boolean;
  priceMargin: number;
  inventoryThreshold: number;
  syncBatchSize: number;
  retryAttempts: number;
  retryDelay: number;
}

interface SyncStatusResponse {
  isRunning: boolean;
  currentJob?: {
    type: string;
    startedAt: Date;
    progress: number;
    processedItems: number;
    totalItems: number;
  };
  lastSync?: {
    type: string;
    completedAt: Date;
    success: boolean;
    duration: number;
    stats: {
      processed: number;
      success: number;
      failed: number;
      skipped: number;
    };
  };
  nextScheduledSync?: {
    type: string;
    scheduledAt: Date;
  };
  queueStatus: {
    pending: number;
    active: number;
    completed: number;
    failed: number;
  };
}

export class SyncController {
  private syncService: SyncService;

  constructor(syncService: SyncService) {
    this.syncService = syncService;
  }

  /**
   * 전체 동기화 실행
   */
  performFullSync = async (
    _req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      logger.info('Starting full sync process');

      const result = await this.syncService.performFullSync();

      logger.info('Full sync completed', {
        success: result.success,
        processed: result.totalItems,
        succeeded: result.successCount,
        failed: result.failureCount,
        duration: result.duration,
      });

      res.json({
        success: true,
        data: result,
        message: result.success 
          ? 'Full sync completed successfully'
          : 'Full sync completed with errors',
      });
    } catch (error) {
      logger.error('Error in performFullSync:', error);
      next(error);
    }
  };

  /**
   * 개별 SKU 동기화
   */
  syncSingleSku = async (
    req: Request<{ sku: string }>,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { sku } = req.params;

      if (!sku) {
        res.status(400).json({
          success: false,
          error: 'SKU is required',
        });
        return;
      }

      logger.info(`Starting single SKU sync: ${sku}`);

      await this.syncService.syncSingleSku(sku);

      logger.info(`Single SKU sync completed: ${sku}`);

      res.json({
        success: true,
        message: `SKU ${sku} synced successfully`,
        data: {
          sku,
          syncedAt: new Date(),
        },
      });
    } catch (error) {
      logger.error(`Error in syncSingleSku for ${req.params.sku}:`, error);
      next(error);
    }
  };

  /**
   * 동기화 상태 조회
   */
  getSyncStatus = async (
    _req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const redis = getRedisClient();
      
      // Redis에서 동기화 상태 정보 조회
      const [
        isRunning,
        currentJobData,
        lastSyncData,
        queueStats,
      ] = await Promise.all([
        redis.get('sync:isRunning'),
        redis.get('sync:currentJob'),
        redis.get('sync:lastCompleted'),
        this.getQueueStats(),
      ]);

      const status: SyncStatusResponse = {
        isRunning: isRunning === 'true',
        queueStatus: queueStats,
      };

      if (currentJobData) {
        try {
          status.currentJob = JSON.parse(currentJobData);
        } catch (e) {
          logger.error('Failed to parse current job data:', e);
        }
      }

      if (lastSyncData) {
        try {
          status.lastSync = JSON.parse(lastSyncData);
        } catch (e) {
          logger.error('Failed to parse last sync data:', e);
        }
      }

      // 다음 예정된 동기화 확인
      const scheduledSync = await redis.get('sync:nextScheduled');
      if (scheduledSync) {
        try {
          status.nextScheduledSync = JSON.parse(scheduledSync);
        } catch (e) {
          logger.error('Failed to parse scheduled sync data:', e);
        }
      }

      res.json({
        success: true,
        data: status,
      });
    } catch (error) {
      logger.error('Error in getSyncStatus:', error);
      next(error);
    }
  };

  /**
   * 동기화 설정 조회
   */
  getSyncSettings = async (
    _req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const redis = getRedisClient();
      
      const settingsKeys = [
        'sync:interval',
        'sync:autoSync',
        'sync:priceMargin',
        'sync:inventoryThreshold',
        'sync:batchSize',
        'sync:retryAttempts',
        'sync:retryDelay',
      ];

      const values = await redis.mget(...settingsKeys);
      
      const settings: SyncSettings = {
        syncInterval: parseInt(values[0] || '30'),
        autoSync: values[1] === 'true',
        priceMargin: parseFloat(values[2] || '1.15'),
        inventoryThreshold: parseInt(values[3] || '10'),
        syncBatchSize: parseInt(values[4] || '100'),
        retryAttempts: parseInt(values[5] || '3'),
        retryDelay: parseInt(values[6] || '1000'),
      };

      // 추가 정보 조회
      const [lastSync, totalSyncs, failedSyncs] = await Promise.all([
        redis.get('sync:lastFullSync'),
        redis.get('sync:stats:total'),
        redis.get('sync:stats:failed'),
      ]);

      res.json({
        success: true,
        data: {
          settings,
          stats: {
            lastSync: lastSync ? new Date(lastSync) : null,
            totalSyncs: parseInt(totalSyncs || '0'),
            failedSyncs: parseInt(failedSyncs || '0'),
          },
        },
      });
    } catch (error) {
      logger.error('Error in getSyncSettings:', error);
      next(error);
    }
  };

  /**
   * 동기화 설정 업데이트
   */
  updateSyncSettings = async (
    req: Request<{}, {}, Partial<SyncSettings>>,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const redis = getRedisClient();
      const updates: Array<[string, string]> = [];

      // 유효성 검사 및 업데이트 준비
      if (req.body.syncInterval !== undefined) {
        const interval = req.body.syncInterval;
        if (interval < 1 || interval > 1440) {
          res.status(400).json({
            success: false,
            error: 'Sync interval must be between 1 and 1440 minutes',
          });
          return;
        }
        updates.push(['sync:interval', interval.toString()]);
      }
      
      if (req.body.autoSync !== undefined) {
        updates.push(['sync:autoSync', req.body.autoSync.toString()]);
      }
      
      if (req.body.priceMargin !== undefined) {
        const margin = req.body.priceMargin;
        if (margin < 1 || margin > 3) {
          res.status(400).json({
            success: false,
            error: 'Price margin must be between 1 and 3',
          });
          return;
        }
        updates.push(['sync:priceMargin', margin.toString()]);
      }

      if (req.body.inventoryThreshold !== undefined) {
        const threshold = req.body.inventoryThreshold;
        if (threshold < 0) {
          res.status(400).json({
            success: false,
            error: 'Inventory threshold must be non-negative',
          });
          return;
        }
        updates.push(['sync:inventoryThreshold', threshold.toString()]);
      }

      if (req.body.syncBatchSize !== undefined) {
        const batchSize = req.body.syncBatchSize;
        if (batchSize < 1 || batchSize > 1000) {
          res.status(400).json({
            success: false,
            error: 'Batch size must be between 1 and 1000',
          });
          return;
        }
        updates.push(['sync:batchSize', batchSize.toString()]);
      }

      if (req.body.retryAttempts !== undefined) {
        const attempts = req.body.retryAttempts;
        if (attempts < 0 || attempts > 10) {
          res.status(400).json({
            success: false,
            error: 'Retry attempts must be between 0 and 10',
          });
          return;
        }
        updates.push(['sync:retryAttempts', attempts.toString()]);
      }

      if (req.body.retryDelay !== undefined) {
        const delay = req.body.retryDelay;
        if (delay < 100 || delay > 30000) {
          res.status(400).json({
            success: false,
            error: 'Retry delay must be between 100 and 30000 ms',
          });
          return;
        }
        updates.push(['sync:retryDelay', delay.toString()]);
      }

      // Redis에 업데이트 적용
      if (updates.length > 0) {
        const pipeline = redis.pipeline();
        updates.forEach(([key, value]) => {
          pipeline.set(key, value);
        });
        await pipeline.exec();

        logger.info('Sync settings updated', { 
          updates: updates.map(([key]) => key),
        });
      }

      res.json({
        success: true,
        message: 'Sync settings updated successfully',
        data: {
          updatedFields: updates.map(([key]) => key.replace('sync:', '')),
        },
      });
    } catch (error) {
      logger.error('Error in updateSyncSettings:', error);
      next(error);
    }
  };

  /**
   * 동기화 이력 조회
   */
  getSyncHistory = async (
    req: Request<{}, {}, {}, { limit?: string; type?: string }>,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { limit = '100', type } = req.query;
      const redis = getRedisClient();

      // Redis에서 동기화 이력 조회
      const historyKey = type ? `sync:history:${type}` : 'sync:history:all';
      const history = await redis.lrange(historyKey, 0, parseInt(limit) - 1);

      const parsedHistory = history.map((item) => {
        try {
          return JSON.parse(item);
        } catch (e) {
          logger.error('Failed to parse history item:', e);
          return null;
        }
      }).filter(Boolean);

      res.json({
        success: true,
        data: {
          history: parsedHistory,
          total: parsedHistory.length,
          filters: { limit: parseInt(limit), type },
        },
      });
    } catch (error) {
      logger.error('Error in getSyncHistory:', error);
      next(error);
    }
  };

  /**
   * 동기화 큐 상태 조회 (헬퍼 메서드)
   */
  private async getQueueStats(): Promise<SyncStatusResponse['queueStatus']> {
    const redis = getRedisClient();
    
    const [pending, active, completed, failed] = await Promise.all([
      redis.get('sync:queue:pending'),
      redis.get('sync:queue:active'),
      redis.get('sync:queue:completed'),
      redis.get('sync:queue:failed'),
    ]);

    return {
      pending: parseInt(pending || '0'),
      active: parseInt(active || '0'),
      completed: parseInt(completed || '0'),
      failed: parseInt(failed || '0'),
    };
  }
}