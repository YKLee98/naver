// packages/backend/src/controllers/SyncController.ts
import { Request, Response, NextFunction } from 'express';
import { Redis } from 'ioredis';
import { SyncService } from '../services/sync';
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
  private redis: Redis;

  constructor(syncService: SyncService) {
    this.syncService = syncService;
    // Redis는 syncService에서 가져오거나 별도로 주입받아야 함
    this.redis = (syncService as any).redis;
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
          ? `Full sync completed successfully. Processed ${result.totalItems} items.`
          : `Full sync completed with errors. Processed ${result.totalItems} items, ${result.failureCount} failed.`,
      });
    } catch (error) {
      logger.error('Error in performFullSync:', error);
      next(error);
    }
  };

  /**
   * 단일 SKU 동기화
   */
  syncSingleSku = async (
    req: Request<{ sku: string }>,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { sku } = req.params;
      logger.info(`Starting single SKU sync for: ${sku}`);

      const result = await this.syncService.syncSingleProduct(sku);

      res.json({
        success: true,
        data: result,
        message: result.success
          ? `SKU ${sku} synced successfully`
          : `Failed to sync SKU ${sku}`,
      });
    } catch (error) {
      logger.error('Error in syncSingleSku:', error);
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
      const syncStatus = await this.syncService.getSyncStatus();

      const response: SyncStatusResponse = {
        isRunning: syncStatus.isRunning,
        queueStatus: {
          pending: syncStatus.queueStatus?.pending || 0,
          active: syncStatus.queueStatus?.active || 0,
          completed: syncStatus.queueStatus?.completed || 0,
          failed: syncStatus.queueStatus?.failed || 0,
        },
      };

      if (syncStatus.currentJob) {
        response.currentJob = syncStatus.currentJob;
      }

      if (syncStatus.lastSync) {
        response.lastSync = syncStatus.lastSync;
      }

      if (syncStatus.nextScheduledSync) {
        response.nextScheduledSync = syncStatus.nextScheduledSync;
      }

      res.json({
        success: true,
        data: response,
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
      const settingsKeys = [
        'sync:interval',
        'sync:autoSync',
        'sync:priceMargin',
        'sync:inventoryThreshold',
        'sync:batchSize',
        'sync:retryAttempts',
        'sync:retryDelay',
      ];

      const values = await this.redis.mget(...settingsKeys);
      
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
        this.redis.get('sync:lastFullSync'),
        this.redis.get('sync:stats:total'),
        this.redis.get('sync:stats:failed'),
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
        const pipeline = this.redis.pipeline();
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

      // Redis에서 동기화 이력 조회
      const historyKey = type ? `sync:history:${type}` : 'sync:history:all';
      const history = await this.redis.lrange(historyKey, 0, parseInt(limit) - 1);

      const parsedHistory = history.map((item) => {
        try {
          return JSON.parse(item);
        } catch {
          return item;
        }
      });

      res.json({
        success: true,
        data: {
          history: parsedHistory,
          total: parsedHistory.length,
          type: type || 'all',
        },
      });
    } catch (error) {
      logger.error('Error in getSyncHistory:', error);
      next(error);
    }
  };
}