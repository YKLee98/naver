// packages/backend/src/services/sync/PriceSyncService.ts
import { Redis } from 'ioredis';
import axios from 'axios';
import { ExchangeRate, PriceHistory } from '../../models';
import { logger } from '../../utils/logger';

export class PriceSyncService {
  private redis: Redis;
  private exchangeRateCacheKey = 'exchange:KRW:USD';
  private cacheTTL = 3600; // 1시간

  constructor(redis: Redis) {
    this.redis = redis;
  }

  /**
   * 현재 환율 조회
   */
  async getCurrentExchangeRate(): Promise<number> {
    // Redis 캐시 확인
    const cached = await this.redis.get(this.exchangeRateCacheKey);
    if (cached) {
      return parseFloat(cached);
    }

    // DB에서 유효한 환율 조회
    const dbRate = await ExchangeRate.getCurrentRate('KRW', 'USD');
    if (dbRate && !dbRate.isManual) {
      const rate = dbRate.rate;
      await this.redis.setex(this.exchangeRateCacheKey, this.cacheTTL, rate.toString());
      return rate;
    }

    // API에서 새 환율 조회
    const newRate = await this.fetchExchangeRate();
    await this.saveExchangeRate(newRate);
    await this.redis.setex(this.exchangeRateCacheKey, this.cacheTTL, newRate.toString());
    
    return newRate;
  }

  /**
   * 환율 API 호출
   */
  private async fetchExchangeRate(): Promise<number> {
    try {
      const response = await axios.get(process.env.EXCHANGE_RATE_API_URL!, {
        params: {
          access_key: process.env.EXCHANGE_RATE_API_KEY,
        },
        timeout: 5000,
      });

      const usdRate = response.data.rates.USD;
      if (!usdRate) {
        throw new Error('USD rate not found in API response');
      }

      return usdRate;
    } catch (error) {
      logger.error('Failed to fetch exchange rate', error);
      
      // 폴백: 마지막 환율 사용
      const lastRate = await ExchangeRate.findOne({
        baseCurrency: 'KRW',
        targetCurrency: 'USD',
      }).sort({ createdAt: -1 });

      if (lastRate) {
        logger.warn(`Using last known exchange rate: ${lastRate.rate}`);
        return lastRate.rate;
      }

      // 기본값 (수동 설정 필요)
      throw new Error('No exchange rate available');
    }
  }

  /**
   * 환율 저장
   */
  private async saveExchangeRate(rate: number): Promise<void> {
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
    });
  }

  /**
   * 수동 환율 설정
   */
  async setManualExchangeRate(rate: number, reason: string): Promise<void> {
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
      },
    });

    // 캐시 업데이트
    await this.redis.setex(this.exchangeRateCacheKey, this.cacheTTL, rate.toString());
    logger.info(`Manual exchange rate set: ${rate} (${reason})`);
  }

  /**
   * Shopify 가격 계산
   */
  async calculateShopifyPrice(naverPrice: number, margin: number = 1.15): Promise<number> {
    const exchangeRate = await this.getCurrentExchangeRate();
    const usdPrice = naverPrice * exchangeRate;
    const finalPrice = usdPrice * margin;
    
    // 소수점 2자리로 반올림
    return Math.round(finalPrice * 100) / 100;
  }

  /**
   * 가격 동기화 이력 조회
   */
  async getPriceHistory(sku: string, limit = 100): Promise<any[]> {
    return PriceHistory.find({ sku })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
  }
}
