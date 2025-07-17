// packages/backend/src/controllers/SyncController.ts
import { Request, Response, NextFunction } from 'express';
import { SyncService } from '../services/sync';
import { AppError } from '../middlewares/error.middleware';
import { getRedisClient } from '../config/redis';

export class SyncController {
  private syncService: SyncService;

  constructor(syncService: SyncService) {
    this.syncService = syncService;
  }

  /**
   * 전체 동기화 실행
   */
  performFullSync = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const result = await this.syncService.performFullSync();

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * 개별 SKU 동기화
   */
  syncSingleSku = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { sku } = req.params;

      await this.syncService.syncSingleSku(sku);

      res.json({
        success: true,
        message: `SKU ${sku} synced successfully`,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * 동기화 상태 조회
   */
  getSyncStatus = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const status = await this.syncService.getSyncStatus();

      res.json({
        success: true,
        data: status,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * 동기화 설정 조회
   */
  getSyncSettings = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const redis = getRedisClient();
      
      const settings = {
        syncInterval: await redis.get('sync:interval') || '30',
        autoSync: await redis.get('sync:autoSync') === 'true',
        priceMargin: await redis.get('sync:priceMargin') || '1.15',
        lastSync: await redis.get('sync:lastFullSync'),
      };

      res.json({
        success: true,
        data: settings,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * 동기화 설정 업데이트
   */
  updateSyncSettings = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { syncInterval, autoSync, priceMargin } = req.body;
      const redis = getRedisClient();

      if (syncInterval !== undefined) {
        await redis.set('sync:interval', syncInterval.toString());
      }
      
      if (autoSync !== undefined) {
        await redis.set('sync:autoSync', autoSync.toString());
      }
      
      if (priceMargin !== undefined) {
        await redis.set('sync:priceMargin', priceMargin.toString());
      }

      res.json({
        success: true,
        message: 'Sync settings updated',
      });
    } catch (error) {
      next(error);
    }
  };
}
