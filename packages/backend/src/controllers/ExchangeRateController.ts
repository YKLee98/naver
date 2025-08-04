// ===== 3. packages/backend/src/controllers/ExchangeRateController.ts =====
import { Request, Response, NextFunction } from 'express';
import { ExchangeRateService } from '../services/exchangeRate';
import { ExchangeRate } from '../models';
import { logger } from '../utils/logger';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/errors';

export class ExchangeRateController {
  private exchangeRateService: ExchangeRateService;

  constructor(exchangeRateService: ExchangeRateService) {
    this.exchangeRateService = exchangeRateService;
  }

  /**
   * 현재 환율 조회
   */
  getCurrentRate = asyncHandler(async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const rate = await this.exchangeRateService.getCurrentRate();
    
    res.json({
      success: true,
      data: {
        rate,
        currency: 'CAD/KRW',
        source: 'Bank of Canada',
        timestamp: new Date()
      }
    });
  });

  /**
   * 환율 이력 조회
   */
  getRateHistory = asyncHandler(async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const { days = 30 } = req.query;
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - Number(days));
    
    const history = await ExchangeRate.find({
      createdAt: { $gte: startDate }
    })
    .sort({ createdAt: -1 })
    .lean();
    
    res.json({
      success: true,
      data: history,
      total: history.length
    });
  });

  /**
   * 수동 환율 설정
   */
  setManualRate = asyncHandler(async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const { rate, reason, validHours = 24 } = req.body;
    
    // 유효 기간 설정
    const validUntil = new Date();
    validUntil.setHours(validUntil.getHours() + validHours);
    
    // 기존 활성 환율 비활성화
    await ExchangeRate.updateMany(
      { isActive: true },
      { isActive: false }
    );
    
    // 새 환율 생성
    const newRate = await ExchangeRate.create({
      rate,
      source: 'manual',
      isActive: true,
      validUntil,
      reason,
      createdBy: (req as any).user?.id || 'system'
    });
    
    // 캐시 업데이트
    await this.exchangeRateService.setManualRate(rate, validHours);
    
    logger.info(`Manual exchange rate set: ${rate} CAD/KRW`, {
      userId: (req as any).user?.id,
      reason,
      validHours
    });
    
    res.json({
      success: true,
      message: 'Exchange rate updated successfully',
      data: newRate
    });
  });

  /**
   * 환율 갱신
   */
  refreshRate = asyncHandler(async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const rate = await this.exchangeRateService.updateExchangeRate();
    
    res.json({
      success: true,
      message: 'Exchange rate refreshed',
      data: {
        rate,
        currency: 'CAD/KRW',
        source: 'Bank of Canada',
        timestamp: new Date()
      }
    });
  });
}
