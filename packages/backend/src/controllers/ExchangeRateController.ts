// ===== 2. packages/backend/src/controllers/ExchangeRateController.ts =====
import { Request, Response, NextFunction } from 'express';
import { ExchangeRateService } from '../services/exchangeRate/ExchangeRateService';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';

export class ExchangeRateController {
  private exchangeRateService: ExchangeRateService;

  constructor(exchangeRateService: ExchangeRateService) {
    this.exchangeRateService = exchangeRateService;
  }

  /**
   * 현재 환율 조회
   * GET /api/v1/exchange-rates/current
   */
  getCurrentRate = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const rate = await this.exchangeRateService.getCurrentRate();

      // KRW to USD 변환 (프론트엔드 기대값)
      const krwToUsd = 1 / rate;

      res.json({
        rate: krwToUsd,
        source: 'api',
        baseCurrency: 'KRW',
        targetCurrency: 'USD',
        krwPerUsd: rate,
        updatedAt: new Date(),
      });
    }
  );

  /**
   * 환율 이력 조회
   * GET /api/v1/exchange-rates
   */
  getRateHistory = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const { days = 30 } = req.query;

      const history = await this.exchangeRateService.getRateHistory(
        Number(days)
      );

      res.json({
        data: history.map((h) => ({
          ...h,
          krwToUsd: 1 / h.rate,
        })),
      });
    }
  );

  /**
   * 수동 환율 설정
   * POST /api/v1/exchange-rates/manual
   */
  setManualRate = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const { rate, reason, validHours = 24 } = req.body;

      if (!rate || rate <= 0) {
        throw new AppError('Invalid exchange rate', 400);
      }

      // 입력받은 rate는 KRW to USD (예: 0.00075)
      // 저장할 때는 USD to KRW로 변환 (예: 1333.33)
      const usdToKrw = 1 / rate;

      await this.exchangeRateService.setManualRate(usdToKrw, validHours);

      logger.info(
        `Manual exchange rate set: ${rate} KRW/USD (${usdToKrw} USD/KRW)`,
        {
          userId: (req as any).user?.id,
          reason,
        }
      );

      res.json({
        message: 'Exchange rate updated successfully',
        rate,
        krwPerUsd: usdToKrw,
        validHours,
      });
    }
  );

  /**
   * 환율 업데이트
   * POST /api/v1/exchange-rates/update
   */
  updateRate = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const { rate, isManual } = req.body;

      if (isManual && rate) {
        const usdToKrw = 1 / rate;
        await this.exchangeRateService.setManualRate(usdToKrw);
      } else {
        await this.exchangeRateService.updateExchangeRate();
      }

      const currentRate = await this.exchangeRateService.getCurrentRate();
      const krwToUsd = 1 / currentRate;

      res.json({
        message: 'Exchange rate updated successfully',
        rate: krwToUsd,
        krwPerUsd: currentRate,
      });
    }
  );

  /**
   * 환율 갱신
   * POST /api/v1/exchange-rates/refresh
   */
  refreshRate = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const newRate = await this.exchangeRateService.updateExchangeRate();
      const krwToUsd = 1 / newRate;

      res.json({
        message: 'Exchange rate refreshed',
        rate: krwToUsd,
        krwPerUsd: newRate,
        timestamp: new Date(),
      });
    }
  );
}
