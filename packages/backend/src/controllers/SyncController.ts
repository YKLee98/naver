// packages/backend/src/controllers/SyncController.ts
import { Request, Response, NextFunction } from 'express';
import { SyncService } from '../services/sync/SyncService.js';
import { logger } from '../utils/logger.js';
import { Activity } from '../models/Activity.js';

export class SyncController {
  private syncService: SyncService;

  constructor(syncService: SyncService) {
    this.syncService = syncService;
  }

  /**
   * Perform full sync
   * POST /api/v1/sync/full
   */
  async performFullSync(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const {
        includeInventory = true,
        includePrice = true,
        vendor,
        batchSize = 50,
      } = req.body;

      logger.info('Starting full sync', {
        includeInventory,
        includePrice,
        vendor,
        batchSize,
      });

      // Start sync process
      const jobId = `sync-full-${Date.now()}`;

      // Run sync in background
      this.syncService
        .performFullSync({
          includeInventory,
          includePrice,
          vendor,
          batchSize,
          jobId,
        })
        .then(async (result) => {
          // Log activity
          await Activity.create({
            type: 'sync',
            action: 'Full sync completed',
            details: `Synced ${result.successCount}/${result.totalItems} items`,
            metadata: result,
            success: result.success,
            userId: (req as any).user?.id,
          });
        })
        .catch(async (error) => {
          logger.error('Full sync failed:', error);
          await Activity.create({
            type: 'sync',
            action: 'Full sync failed',
            details: error.message,
            success: false,
            errorMessage: error.message,
            userId: (req as any).user?.id,
          });
        });

      res.json({
        success: true,
        message: '전체 동기화가 시작되었습니다.',
        data: {
          jobId,
          status: 'processing',
          includeInventory,
          includePrice,
        },
      });
    } catch (error) {
      logger.error('Perform full sync error:', error);
      next(error);
    }
  }

  /**
   * Sync single SKU
   * POST /api/v1/sync/sku/:sku
   */
  async syncSingleSku(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { sku } = req.params;
      const { syncInventory = true, syncPrice = true } = req.body;

      logger.info(`Syncing single SKU: ${sku}`, { syncInventory, syncPrice });

      const result = await this.syncService.syncSingleProduct(sku, {
        syncInventory,
        syncPrice,
      });

      // Log activity
      await Activity.create({
        type: 'sync',
        action: 'Single SKU sync',
        details: `Synced SKU: ${sku}`,
        metadata: result,
        success: result.success,
        userId: (req as any).user?.id,
      });

      res.json({
        success: true,
        message: `SKU ${sku} 동기화가 완료되었습니다.`,
        data: result,
      });
    } catch (error) {
      logger.error('Sync single SKU error:', error);
      next(error);
    }
  }

  /**
   * Get sync status
   * GET /api/v1/sync/status
   */
  async getSyncStatus(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const status = await this.syncService.getCurrentSyncStatus();

      res.json({
        success: true,
        data: status,
      });
    } catch (error) {
      logger.error('Get sync status error:', error);
      next(error);
    }
  }

  /**
   * Get sync job status
   * GET /api/v1/sync/status/:jobId
   */
  async getSyncJobStatus(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { jobId } = req.params;

      const status = await this.syncService.getSyncJobStatus(jobId);

      if (!status) {
        res.status(404).json({
          success: false,
          error: 'Sync job not found',
        });
        return;
      }

      res.json({
        success: true,
        data: status,
      });
    } catch (error) {
      logger.error('Get sync job status error:', error);
      next(error);
    }
  }

  /**
   * Get sync settings
   * GET /api/v1/sync/settings
   */
  async getSyncSettings(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const settings = await this.syncService.getSyncSettings();

      res.json({
        success: true,
        data: settings,
      });
    } catch (error) {
      logger.error('Get sync settings error:', error);
      next(error);
    }
  }

  /**
   * Update sync settings
   * PUT /api/v1/sync/settings
   */
  async updateSyncSettings(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const updates = req.body;

      const settings = await this.syncService.updateSyncSettings(updates);

      // Log activity
      await Activity.create({
        type: 'system',
        action: 'Sync settings updated',
        details: `Updated sync settings`,
        metadata: updates,
        success: true,
        userId: (req as any).user?.id,
      });

      res.json({
        success: true,
        message: '동기화 설정이 업데이트되었습니다.',
        data: settings,
      });
    } catch (error) {
      logger.error('Update sync settings error:', error);
      next(error);
    }
  }

  /**
   * Get sync history
   * GET /api/v1/sync/history
   */
  async getSyncHistory(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const {
        page = 1,
        limit = 20,
        status,
        type,
        startDate,
        endDate,
      } = req.query;

      const history = await this.syncService.getSyncHistory({
        page: Number(page),
        limit: Number(limit),
        status: status as string,
        type: type as string,
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
      });

      res.json({
        success: true,
        data: history,
      });
    } catch (error) {
      logger.error('Get sync history error:', error);
      next(error);
    }
  }

  /**
   * Retry sync job
   * POST /api/v1/sync/retry/:jobId
   */
  async retrySyncJob(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { jobId } = req.params;

      const result = await this.syncService.retrySyncJob(jobId);

      // Log activity
      await Activity.create({
        type: 'sync',
        action: 'Sync job retry',
        details: `Retried sync job: ${jobId}`,
        metadata: { jobId, newJobId: result.newJobId },
        success: true,
        userId: (req as any).user?.id,
      });

      res.json({
        success: true,
        message: `동기화 작업 ${jobId}가 재시도됩니다.`,
        data: result,
      });
    } catch (error) {
      logger.error('Retry sync job error:', error);
      next(error);
    }
  }

  /**
   * Cancel sync job
   * POST /api/v1/sync/cancel/:jobId
   */
  async cancelSyncJob(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { jobId } = req.params;

      await this.syncService.cancelSyncJob(jobId);

      // Log activity
      await Activity.create({
        type: 'sync',
        action: 'Sync job cancelled',
        details: `Cancelled sync job: ${jobId}`,
        metadata: { jobId },
        success: true,
        userId: (req as any).user?.id,
      });

      res.json({
        success: true,
        message: `동기화 작업 ${jobId}가 취소되었습니다.`,
        data: {
          jobId,
          status: 'cancelled',
        },
      });
    } catch (error) {
      logger.error('Cancel sync job error:', error);
      next(error);
    }
  }

  /**
   * Sync prices
   * POST /api/v1/sync/prices
   */
  async syncPrices(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { vendor, skus } = req.body;

      const result = await this.syncService.syncPrices({
        vendor,
        skus,
      });

      // Log activity
      await Activity.create({
        type: 'sync',
        action: 'Price sync',
        details: `Synced prices for ${result.successCount} products`,
        metadata: result,
        success: result.success,
        userId: (req as any).user?.id,
      });

      res.json({
        success: true,
        message: '가격 동기화가 완료되었습니다.',
        data: result,
      });
    } catch (error) {
      logger.error('Sync prices error:', error);
      next(error);
    }
  }

  /**
   * Sync inventory
   * POST /api/v1/sync/inventory
   */
  async syncInventory(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { vendor, skus } = req.body;

      const result = await this.syncService.syncInventory({
        vendor,
        skus,
      });

      // Log activity
      await Activity.create({
        type: 'sync',
        action: 'Inventory sync',
        details: `Synced inventory for ${result.successCount} products`,
        metadata: result,
        success: result.success,
        userId: (req as any).user?.id,
      });

      res.json({
        success: true,
        message: '재고 동기화가 완료되었습니다.',
        data: result,
      });
    } catch (error) {
      logger.error('Sync inventory error:', error);
      next(error);
    }
  }
}

// Export default for backwards compatibility
export default SyncController;
