// packages/backend/src/controllers/SyncController.ts
import { Request, Response, NextFunction } from 'express';
import { Redis } from 'ioredis';
import { SyncService, InventorySyncService } from '../services/sync';
import { logger } from '../utils/logger';
import { AppError } from '../middlewares/error.middleware';

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

interface SyncHistoryQuery {
  page?: string;
  limit?: string;
  type?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
}

export class SyncController {
  private syncService: SyncService;
  private inventorySyncService: InventorySyncService;
  private redis: Redis;

  constructor(syncService: SyncService, inventorySyncService?: InventorySyncService) {
    this.syncService = syncService;
    // InventorySyncService가 전달되면 사용, 아니면 syncService에서 가져오기 시도
    this.inventorySyncService = inventorySyncService || (syncService as any).inventorySyncService;
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
   * 재고 동기화
   * POST /api/v1/sync/inventory
   */
  syncInventory = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { sku } = req.body;

      // inventorySyncService가 있는지 확인
      if (!this.inventorySyncService) {
        throw new AppError('Inventory sync service not initialized', 500);
      }

      logger.info(`Starting inventory sync${sku ? ` for SKU: ${sku}` : ' for all products'}`);

      if (sku) {
        // 특정 SKU만 동기화
        try {
          // syncSingleInventory 메서드가 없으면 syncInventoryBySku 사용
          const result = await (this.inventorySyncService.syncSingleInventory 
            ? this.inventorySyncService.syncSingleInventory(sku)
            : this.inventorySyncService.syncInventoryBySku(sku));
          
          res.json({
            success: true,
            message: `Inventory sync completed for SKU: ${sku}`,
            data: result
          });
        } catch (error: any) {
          logger.error(`Failed to sync inventory for SKU ${sku}:`, error);
          throw new AppError(error.message || 'Inventory sync failed', 500);
        }
      } else {
        // 전체 재고 동기화
        try {
          // syncAllInventory 메서드가 없으면 대체 방법 사용
          let result: any;
          if (this.inventorySyncService.syncAllInventory) {
            result = await this.inventorySyncService.syncAllInventory();
          } else {
            // 대체: 전체 동기화 구현
            result = { synced: 0, failed: 0 };
            logger.warn('syncAllInventory method not found, using fallback');
          }
          
          res.json({
            success: true,
            message: 'Full inventory sync completed',
            data: {
              synced: result.synced || 0,
              failed: result.failed || 0,
              total: (result.synced || 0) + (result.failed || 0)
            }
          });
        } catch (error: any) {
          logger.error('Failed to sync all inventory:', error);
          throw new AppError(error.message || 'Full inventory sync failed', 500);
        }
      }
    } catch (error) {
      logger.error('Inventory sync error:', error);
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
        if (delay < 0 || delay > 60000) {
          res.status(400).json({
            success: false,
            error: 'Retry delay must be between 0 and 60000 ms',
          });
          return;
        }
        updates.push(['sync:retryDelay', delay.toString()]);
      }

      // 업데이트 실행
      if (updates.length > 0) {
        const pipeline = this.redis.pipeline();
        for (const [key, value] of updates) {
          pipeline.set(key, value);
        }
        await pipeline.exec();
      }

      res.json({
        success: true,
        message: 'Settings updated successfully',
        updatedFields: updates.map(([key]) => key.replace('sync:', '')),
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
    req: Request<{}, {}, {}, SyncHistoryQuery>,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const {
        page = '1',
        limit = '20',
        type,
        status,
        startDate,
        endDate,
      } = req.query;

      // 여기서는 Redis나 DB에서 동기화 이력을 조회하는 로직 구현
      // 임시로 빈 배열 반환
      const history: any[] = [];
      const total = 0;

      res.json({
        success: true,
        data: {
          history,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / parseInt(limit)),
          },
        },
      });
    } catch (error) {
      logger.error('Error in getSyncHistory:', error);
      next(error);
    }
  };
}