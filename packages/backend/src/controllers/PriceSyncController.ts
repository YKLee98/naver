// packages/backend/src/controllers/PriceSyncController.ts
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { PriceSyncService } from '../services/sync';
import { 
  PriceSyncJob, 
  PriceSyncRule, 
  ExchangeRate,
  PriceHistory,
  ProductMapping 
} from '../models';
import { logger } from '../utils/logger';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/errors';
import { getRedisClient } from '../config/redis';

export class PriceSyncController {
  private priceSyncService: PriceSyncService;

  constructor(priceSyncService: PriceSyncService) {
    this.priceSyncService = priceSyncService;
  }

  /**
   * 초기 가격 데이터 조회
   * GET /api/price-sync/initial-prices
   */
  getInitialPrices = asyncHandler(async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const { skus, limit = 100, offset = 0 } = req.query;

    let targetSkus: string[] = [];

    if (skus && typeof skus === 'string') {
      targetSkus = skus.split(',');
    } else {
      // SKU 지정이 없으면 활성 상품 전체 조회
      const mappings = await ProductMapping.find({ status: 'ACTIVE' })
        .select('sku')
        .limit(Number(limit))
        .skip(Number(offset))
        .lean();
      
      targetSkus = mappings.map(m => m.sku);
    }

    if (targetSkus.length === 0) {
      res.json({ data: [], total: 0 });
      return;
    }

    // 초기 가격 데이터 조회
    const priceData = await this.priceSyncService.getBulkInitialPriceData(targetSkus);

    res.json({
      data: priceData,
      total: priceData.length,
      timestamp: new Date().toISOString()
    });
  });

  /**
   * 가격 동기화 실행
   * POST /api/price-sync/sync
   */
  syncPrices = asyncHandler(async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const {
      mode = 'manual',
      skus,
      margin,
      exchangeRateSource = 'api',
      customExchangeRate,
      roundingStrategy = 'nearest',
      applyRules = true
    } = req.body;

    // 동기화 작업 생성
    const jobId = uuidv4();
    const syncJob = await PriceSyncJob.create({
      jobId,
      type: skus ? 'partial' : 'full',
      status: 'pending',
      options: {
        mode,
        margin,
        exchangeRateSource,
        customExchangeRate,
        roundingStrategy,
        skus
      },
      createdBy: req.user?.id || 'system'
    });

    // 비동기로 동기화 작업 실행
    this.executeSyncJob(syncJob._id, applyRules);

    res.status(202).json({
      jobId,
      message: 'Price sync job created',
      status: 'pending',
      trackingUrl: `/api/price-sync/jobs/${jobId}`
    });
  });

  /**
   * 마진 일괄 적용
   * POST /api/price-sync/apply-margins
   */
  applyMargins = asyncHandler(async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const { updates } = req.body;

    if (!Array.isArray(updates) || updates.length === 0) {
      throw new AppError('No margin updates provided', 400);
    }

    const results = [];
    const errors = [];

    for (const update of updates) {
      try {
        const { sku, margin } = update;
        
        if (!sku || typeof margin !== 'number') {
          errors.push({ sku, error: 'Invalid data' });
          continue;
        }

        // 가격 계산 및 적용
        const result = await this.priceSyncService.applyPriceSyncRules(sku, {
          mode: 'manual',
          margin: 1 + (margin / 100)
        });

        results.push({
          sku,
          success: true,
          data: result
        });

      } catch (error) {
        errors.push({
          sku: update.sku,
          error: error.message
        });
      }
    }

    res.json({
      success: results.length,
      failed: errors.length,
      results,
      errors
    });
  });

  /**
   * 현재 환율 조회
   * GET /api/exchange-rate/current
   */
  getCurrentExchangeRate = asyncHandler(async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const rate = await this.priceSyncService.getCurrentExchangeRate();
    const rateRecord = await ExchangeRate.getCurrentRate('KRW', 'USD');

    res.json({
      rate,
      baseCurrency: 'KRW',
      targetCurrency: 'USD',
      source: rateRecord?.source || 'cache',
      isManual: rateRecord?.isManual || false,
      validUntil: rateRecord?.validUntil || null,
      lastUpdated: rateRecord?.updatedAt || new Date()
    });
  });

  /**
   * 수동 환율 설정
   * POST /api/exchange-rate/manual
   */
  setManualExchangeRate = asyncHandler(async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const { rate, reason, validDays = 7 } = req.body;

    if (!rate || !reason) {
      throw new AppError('Rate and reason are required', 400);
    }

    if (rate <= 0 || rate > 1) {
      throw new AppError('Invalid exchange rate', 400);
    }

    await this.priceSyncService.setManualExchangeRate(
      rate,
      reason,
      validDays
    );

    res.json({
      message: 'Manual exchange rate set successfully',
      rate,
      validDays
    });
  });

  /**
   * 가격 동기화 설정 조회
   * GET /api/settings/price-sync
   */
  getSettings = asyncHandler(async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const redis = getRedisClient();
    
    // Redis에서 설정 조회
    const settings = await redis.hgetall('settings:price-sync');
    
    // 가격 규칙 조회
    const priceRules = await PriceSyncRule.find({ enabled: true })
      .sort({ priority: -1 })
      .lean();

    res.json({
      mode: settings.mode || 'manual',
      autoSync: settings.autoSync === 'true',
      defaultMargin: parseFloat(settings.defaultMargin) || 15,
      exchangeRateSource: settings.exchangeRateSource || 'api',
      customExchangeRate: settings.customExchangeRate ? parseFloat(settings.customExchangeRate) : null,
      roundingStrategy: settings.roundingStrategy || 'nearest',
      syncSchedule: settings.syncSchedule || '0 */6 * * *',
      priceRules: priceRules.map(rule => ({
        id: rule._id,
        name: rule.name,
        type: rule.type,
        value: rule.value,
        marginRate: rule.marginRate,
        enabled: rule.enabled
      }))
    });
  });

  /**
   * 가격 동기화 설정 저장
   * PUT /api/settings/price-sync
   */
  updateSettings = asyncHandler(async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const redis = getRedisClient();
    const settings = req.body;

    // Redis에 설정 저장
    const settingsToSave = {
      mode: settings.mode,
      autoSync: settings.autoSync.toString(),
      defaultMargin: settings.defaultMargin.toString(),
      exchangeRateSource: settings.exchangeRateSource,
      roundingStrategy: settings.roundingStrategy,
      syncSchedule: settings.syncSchedule
    };

    if (settings.customExchangeRate) {
      settingsToSave['customExchangeRate'] = settings.customExchangeRate.toString();
    }

    await redis.hmset('settings:price-sync', settingsToSave);

    // 자동 동기화 스케줄 업데이트
    if (settings.autoSync) {
      // Cron job 업데이트 로직
      await redis.set('sync:autoSync', 'true');
      await redis.set('sync:schedule', settings.syncSchedule);
    } else {
      await redis.set('sync:autoSync', 'false');
    }

    res.json({
      message: 'Settings updated successfully',
      settings: settingsToSave
    });
  });

  /**
   * 가격 이력 조회
   * GET /api/price-sync/history
   */
  getPriceHistory = asyncHandler(async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const {
      sku,
      platform,
      startDate,
      endDate,
      limit = 100,
      offset = 0
    } = req.query;

    const query: any = {};
    
    if (sku) query.sku = sku;
    if (platform) query.platform = platform;
    
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate as string);
      if (endDate) query.createdAt.$lte = new Date(endDate as string);
    }

    const [history, total] = await Promise.all([
      PriceHistory.find(query)
        .sort({ createdAt: -1 })
        .limit(Number(limit))
        .skip(Number(offset))
        .lean(),
      PriceHistory.countDocuments(query)
    ]);

    res.json({
      data: history,
      total,
      limit: Number(limit),
      offset: Number(offset)
    });
  });

  /**
   * 동기화 작업 상태 조회
   * GET /api/price-sync/jobs/:jobId
   */
  getJobStatus = asyncHandler(async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const { jobId } = req.params;

    const job = await PriceSyncJob.findOne({ jobId }).lean();

    if (!job) {
      throw new AppError('Job not found', 404);
    }

    res.json({
      jobId: job.jobId,
      type: job.type,
      status: job.status,
      progress: {
        total: job.totalItems,
        processed: job.processedItems,
        success: job.successCount,
        failed: job.failedCount,
        skipped: job.skippedCount,
        percentage: job.totalItems > 0 
          ? Math.round((job.processedItems / job.totalItems) * 100) 
          : 0
      },
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      executionTime: job.executionTime,
      errors: job.errors
    });
  });

  /**
   * 가격 규칙 생성
   * POST /api/price-sync/rules
   */
  createPriceRule = asyncHandler(async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const rule = await PriceSyncRule.create({
      ...req.body,
      createdBy: req.user?.id || 'system',
      updatedBy: req.user?.id || 'system'
    });

    res.status(201).json({
      message: 'Price rule created successfully',
      rule
    });
  });

  /**
   * 가격 규칙 수정
   * PUT /api/price-sync/rules/:id
   */
  updatePriceRule = asyncHandler(async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const { id } = req.params;

    const rule = await PriceSyncRule.findByIdAndUpdate(
      id,
      {
        ...req.body,
        updatedBy: req.user?.id || 'system'
      },
      { new: true, runValidators: true }
    );

    if (!rule) {
      throw new AppError('Price rule not found', 404);
    }

    res.json({
      message: 'Price rule updated successfully',
      rule
    });
  });

  /**
   * 가격 규칙 삭제
   * DELETE /api/price-sync/rules/:id
   */
  deletePriceRule = asyncHandler(async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const { id } = req.params;

    const rule = await PriceSyncRule.findByIdAndDelete(id);

    if (!rule) {
      throw new AppError('Price rule not found', 404);
    }

    res.json({
      message: 'Price rule deleted successfully'
    });
  });

  /**
   * 비동기 동기화 작업 실행
   */
  private async executeSyncJob(jobId: string, applyRules: boolean): Promise<void> {
    try {
      const job = await PriceSyncJob.findById(jobId);
      if (!job) return;

      // 작업 시작
      job.status = 'running';
      job.startedAt = new Date();
      await job.save();

      // SKU 목록 준비
      let targetSkus: string[] = [];
      
      if (job.options.skus && job.options.skus.length > 0) {
        targetSkus = job.options.skus;
      } else {
        const mappings = await ProductMapping.find({ status: 'ACTIVE' })
          .select('sku')
          .lean();
        targetSkus = mappings.map(m => m.sku);
      }

      job.totalItems = targetSkus.length;
      await job.save();

      // 가격 규칙 로드
      let priceRules = [];
      if (applyRules) {
        priceRules = await PriceSyncRule.find({ enabled: true })
          .sort({ priority: -1 })
          .lean();
      }

      // 동기화 실행
      const result = await this.priceSyncService.syncPrices(targetSkus, {
        ...job.options,
        priceRules
      });

      // 작업 완료
      job.status = 'completed';
      job.completedAt = new Date();
      job.processedItems = targetSkus.length;
      job.successCount = result.success;
      job.failedCount = result.failed;
      job.executionTime = job.completedAt.getTime() - job.startedAt.getTime();

      // 실패 항목 기록
      if (result.results) {
        job.errors = result.results
          .filter(r => !r.success)
          .map(r => ({
            sku: r.sku,
            error: r.error || 'Unknown error',
            timestamp: new Date()
          }));
      }

      await job.save();

      logger.info(`Price sync job ${job.jobId} completed`, {
        success: result.success,
        failed: result.failed,
        executionTime: job.executionTime
      });

    } catch (error) {
      logger.error(`Price sync job ${jobId} failed:`, error);
      
      await PriceSyncJob.findByIdAndUpdate(jobId, {
        status: 'failed',
        completedAt: new Date(),
        errors: [{
          sku: 'system',
          error: error.message,
          timestamp: new Date()
        }]
      });
    }
  }
}