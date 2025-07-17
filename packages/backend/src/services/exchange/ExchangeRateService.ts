
import axios from 'axios';
import { Redis } from 'ioredis';
import { ExchangeRate } from '../../models';
import { logger } from '../../utils/logger';
import { retry } from '../../utils/retry';

export class ExchangeRateService {
  private redis: Redis;
  private apiKey: string;
  private apiUrl: string;
  private cacheKey = 'exchange:rate:KRW:USD';
  private cacheTTL = 3600; // 1시간

  constructor(redis: Redis) {
    this.redis = redis;
    this.apiKey = process.env.EXCHANGE_RATE_API_KEY!;
    this.apiUrl = process.env.EXCHANGE_RATE_API_URL!;
  }

  /**
   * 현재 환율 조회 (캐시 우선)
   */
  async getCurrentRate(): Promise<number> {
    // 1. Redis 캐시 확인
    const cached = await this.redis.get(this.cacheKey);
    if (cached) {
      return parseFloat(cached);
    }

    // 2. DB에서 유효한 환율 확인
    const dbRate = await ExchangeRate.getCurrentRate('KRW', 'USD');
    if (dbRate) {
      // 캐시 갱신
      await this.redis.setex(
        this.cacheKey,
        this.cacheTTL,
        dbRate.rate.toString()
      );
      return dbRate.rate;
    }

    // 3. API에서 새 환율 가져오기
    const newRate = await this.fetchLatestRate();
    await this.saveRate(newRate);
    
    return newRate;
  }

  /**
   * API에서 최신 환율 가져오기
   */
  private async fetchLatestRate(): Promise<number> {
    try {
      const response = await retry(
        () => axios.get(this.apiUrl, {
          params: {
            access_key: this.apiKey,
            base: 'KRW',
            symbols: 'USD',
          },
          timeout: 5000,
        }),
        {
          retries: 3,
          minTimeout: 1000,
        }
      );

      const usdRate = response.data.rates?.USD;
      
      if (!usdRate || typeof usdRate !== 'number') {
        throw new Error('Invalid exchange rate response');
      }

      logger.info(`Fetched exchange rate: 1 KRW = ${usdRate} USD`);
      
      return usdRate;
    } catch (error) {
      logger.error('Failed to fetch exchange rate:', error);
      
      // 폴백: 마지막 알려진 환율 사용
      const lastRate = await this.getLastKnownRate();
      if (lastRate) {
        logger.warn(`Using last known exchange rate: ${lastRate}`);
        return lastRate;
      }

      throw new Error('No exchange rate available');
    }
  }

  /**
   * 환율 저장
   */
  private async saveRate(rate: number): Promise<void> {
    const now = new Date();
    const validUntil = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24시간

    await ExchangeRate.create({
      baseCurrency: 'KRW',
      targetCurrency: 'USD',
      rate,
      source: 'api',
      isManual: false,
      validFrom: now,
      validUntil,
      metadata: {
        apiResponse: {
          fetchedAt: now,
          provider: 'exchangerate-api',
        },
      },
    });

    // Redis 캐시 업데이트
    await this.redis.setex(this.cacheKey, this.cacheTTL, rate.toString());
    
    logger.info(`Exchange rate saved: ${rate}`);
  }

  /**
   * 마지막 알려진 환율 조회
   */
  private async getLastKnownRate(): Promise<number | null> {
    const lastRate = await ExchangeRate.findOne({
      baseCurrency: 'KRW',
      targetCurrency: 'USD',
    })
      .sort({ createdAt: -1 })
      .lean();

    return lastRate?.rate || null;
  }

  /**
   * 수동 환율 설정
   */
  async setManualRate(rate: number, reason: string): Promise<void> {
    const now = new Date();
    const validUntil = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7일

    await ExchangeRate.create({
      baseCurrency: 'KRW',
      targetCurrency: 'USD',
      rate,
      source: 'manual',
      isManual: true,
      validFrom: now,
      validUntil,
      metadata: {
        manualReason: reason,
        setBy: 'admin', // TODO: 실제 사용자 정보
      },
    });

    // Redis 캐시 업데이트
    await this.redis.setex(this.cacheKey, this.cacheTTL, rate.toString());
    
    logger.info(`Manual exchange rate set: ${rate} (${reason})`);
  }

  /**
   * 환율 업데이트 (크론 작업용)
   */
  async updateExchangeRate(): Promise<void> {
    try {
      const newRate = await this.fetchLatestRate();
      const currentRate = await this.getCurrentRate();

      // 환율 변동이 있는 경우에만 저장
      const changePercentage = Math.abs((newRate - currentRate) / currentRate) * 100;
      
      if (changePercentage > 0.1) { // 0.1% 이상 변동
        await this.saveRate(newRate);
        logger.info(`Exchange rate updated: ${currentRate} → ${newRate} (${changePercentage.toFixed(2)}% change)`);
      } else {
        logger.info('Exchange rate unchanged, skipping update');
      }
    } catch (error) {
      logger.error('Failed to update exchange rate:', error);
      throw error;
    }
  }

  /**
   * 환율 이력 조회
   */
  async getRateHistory(days: number = 30): Promise<any[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return ExchangeRate.find({
      baseCurrency: 'KRW',
      targetCurrency: 'USD',
      createdAt: { $gte: startDate },
    })
      .sort({ createdAt: -1 })
      .select('rate source isManual createdAt validFrom validUntil')
      .lean();
  }
}
