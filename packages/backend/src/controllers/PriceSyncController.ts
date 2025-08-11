// ===== 1. packages/backend/src/controllers/PriceSyncController.ts =====
// 누락된 메서드들 추가
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { PriceSyncService } from '../services/sync';
import {
  PriceSyncJob,
  PriceSyncRule,
  ExchangeRate,
  PriceHistory,
  ProductMapping,
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
  getInitialPrices = asyncHandler(
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      const { skus, limit = 100, offset = 0 } = req.query;

      let targetSkus: string[] = [];

      if (skus && typeof skus === 'string') {
        targetSkus = skus.split(',');
      } else {
        // SKU 지정이 없으면 활성 상품 전체 조회
        const mappings = await ProductMapping.find({ isActive: true })
          .select('sku')
          .limit(Number(limit))
          .skip(Number(offset))
          .lean();

        targetSkus = mappings.map((m) => m.sku);
      }

      if (targetSkus.length === 0) {
        res.json({ data: [], total: 0 });
        return;
      }

      // 초기 가격 데이터 조회
      const priceData =
        await this.priceSyncService.getBulkInitialPriceData(targetSkus);

      res.json({
        data: priceData,
        total: priceData.length,
        timestamp: new Date().toISOString(),
      });
    }
  );

  /**
   * 가격 동기화 실행
   * POST /api/price-sync/sync
   */
  syncPrices = asyncHandler(
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      const {
        mode = 'manual',
        skus,
        margin,
        exchangeRateSource = 'api',
        customExchangeRate,
        roundingStrategy = 'nearest',
        applyRules = true,
      } = req.body;

      // 동기화 작업 생성
      const jobId = uuidv4();
      const syncJob = await PriceSyncJob.create({
        jobId,
        type: skus ? 'partial' : 'full',
        status: 'pending',
        options: {
          skus,
          margin,
          exchangeRateSource,
          customExchangeRate,
          roundingStrategy,
          applyRules,
        },
        createdBy: (req as any).user?.id || 'system',
      });

      // 비동기로 동기화 작업 실행
      this.executeSyncJob(jobId, applyRules).catch((error) => {
        logger.error('Error in sync job execution:', error);
      });

      res.json({
        message: 'Price sync job created',
        jobId,
        status: 'pending',
      });
    }
  );

  /**
   * 마진 일괄 적용
   * POST /api/price-sync/apply-margins
   */
  applyMargins = asyncHandler(
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      const { updates } = req.body;

      const results = [];
      const errors = [];

      for (const update of updates) {
        try {
          const result = await this.priceSyncService.updateProductMargin(
            update.sku,
            update.margin
          );
          results.push(result);
        } catch (error: any) {
          errors.push({
            sku: update.sku,
            error: error.message,
          });
        }
      }

      res.json({
        message: 'Margins applied',
        results,
        errors,
        total: updates.length,
        successful: results.length,
        failed: errors.length,
      });
    }
  );

  /**
   * 가격 이력 조회
   * GET /api/price-sync/history
   */
  getPriceHistory = asyncHandler(
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      const {
        sku,
        platform,
        startDate,
        endDate,
        limit = 100,
        offset = 0,
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
        PriceHistory.countDocuments(query),
      ]);

      res.json({
        data: history,
        total,
        page: Math.floor(Number(offset) / Number(limit)) + 1,
        totalPages: Math.ceil(total / Number(limit)),
      });
    }
  );

  /**
   * 동기화 작업 상태 조회
   * GET /api/price-sync/jobs/:jobId
   */
  getJobStatus = asyncHandler(
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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
          percentage:
            job.totalItems > 0
              ? Math.round((job.processedItems / job.totalItems) * 100)
              : 0,
        },
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        executionTime: job.executionTime,
        errors: job.errors,
      });
    }
  );

  /**
   * 가격 규칙 생성
   * POST /api/price-sync/rules
   */
  createPriceRule = asyncHandler(
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      const rule = await PriceSyncRule.create({
        ...req.body,
        createdBy: (req as any).user?.id || 'system',
        updatedBy: (req as any).user?.id || 'system',
      });

      res.status(201).json({
        message: 'Price rule created successfully',
        rule,
      });
    }
  );

  /**
   * 가격 규칙 수정
   * PUT /api/price-sync/rules/:id
   */
  updatePriceRule = asyncHandler(
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      const { id } = req.params;

      const rule = await PriceSyncRule.findByIdAndUpdate(
        id,
        {
          ...req.body,
          updatedBy: (req as any).user?.id || 'system',
        },
        { new: true, runValidators: true }
      );

      if (!rule) {
        throw new AppError('Price rule not found', 404);
      }

      res.json({
        message: 'Price rule updated successfully',
        rule,
      });
    }
  );

  /**
   * 가격 규칙 삭제
   * DELETE /api/price-sync/rules/:id
   */
  deletePriceRule = asyncHandler(
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      const { id } = req.params;

      const rule = await PriceSyncRule.findByIdAndDelete(id);

      if (!rule) {
        throw new AppError('Price rule not found', 404);
      }

      res.json({
        message: 'Price rule deleted successfully',
      });
    }
  );

  /**
   * 현재 환율 조회
   * GET /api/exchange-rate/current
   */
  getCurrentExchangeRate = asyncHandler(
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      // 가장 최근 환율 정보 조회
      const currentRate = await ExchangeRate.findOne({
        isActive: true,
      })
        .sort({ createdAt: -1 })
        .lean();

      if (!currentRate) {
        // 환율 정보가 없으면 서비스에서 가져오기
        const rate = await this.priceSyncService.getCurrentExchangeRate();
        res.json({
          rate,
          source: 'api',
          updatedAt: new Date(),
        });
        return;
      }

      res.json({
        rate: currentRate.rate,
        source: currentRate.source,
        updatedAt: currentRate.createdAt,
        validUntil: currentRate.validUntil,
      });
    }
  );

  /**
   * 수동 환율 설정
   * POST /api/exchange-rate/manual
   */
  setManualExchangeRate = asyncHandler(
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      const { rate, reason, validDays = 7 } = req.body;

      // 기존 활성 환율 비활성화
      await ExchangeRate.updateMany({ isActive: true }, { isActive: false });

      // 새 환율 생성
      const validUntil = new Date();
      validUntil.setDate(validUntil.getDate() + validDays);

      const newRate = await ExchangeRate.create({
        rate,
        source: 'manual',
        isActive: true,
        validUntil,
        createdBy: (req as any).user?.id || 'system',
        reason,
      });

      // Redis 캐시 업데이트
      const redis = getRedisClient();
      await redis.set(
        'exchange_rate:current',
        JSON.stringify({
          rate,
          source: 'manual',
          updatedAt: newRate.createdAt,
          validUntil,
        }),
        'EX',
        3600 // 1시간 캐시
      );

      res.json({
        message: 'Exchange rate updated successfully',
        rate: newRate,
      });
    }
  );

  /**
   * 비동기 동기화 작업 실행
   */
  private async executeSyncJob(
    jobId: string,
    applyRules: boolean
  ): Promise<void> {
    try {
      const job = await PriceSyncJob.findOne({ jobId });
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
        const mappings = await ProductMapping.find({ isActive: true })
          .select('sku')
          .lean();
        targetSkus = mappings.map((m) => m.sku);
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
      const results = await this.priceSyncService.syncPricesWithRules(
        targetSkus,
        priceRules,
        job.options
      );

      // 작업 완료
      job.status = 'completed';
      job.completedAt = new Date();
      job.processedItems = results.successful.length;
      job.executionTime = job.completedAt.getTime() - job.startedAt.getTime();
      job.errors = results.errors;
      await job.save();
    } catch (error: any) {
      logger.error('Error in executeSyncJob:', error);

      // 작업 실패 처리
      const job = await PriceSyncJob.findOne({ jobId });
      if (job) {
        job.status = 'failed';
        job.completedAt = new Date();
        job.errors = [
          {
            message: error.message,
            stack: error.stack,
          },
        ];
        await job.save();
      }
    }
  }
}
