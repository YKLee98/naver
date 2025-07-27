// packages/backend/src/services/exchangeRate/ExchangeRateService.ts
import { Redis } from 'ioredis';
import axios from 'axios';
import { logger } from '@/utils/logger';
import { ExchangeRate, SystemLog } from '@/models';
import { config } from '@/config';
import { retry } from '@/utils/retry';

interface ExchangeRateApiResponse {
  success: boolean;
  timestamp: number;
  base: string;
  date: string;
  rates: Record<string, number>;
}

export class ExchangeRateService {
  private redis: Redis;
  private readonly cacheKey = 'exchange_rate:KRW:USD';
  private readonly cacheTTL = 3600; // 1시간
  private readonly exchangeRateApis = [
    {
      name: 'ExchangeRate-API',
      url: 'https://api.exchangerate-api.com/v4/latest/KRW',
      parser: (data: any) => 1 / data.rates.USD,
      requiresApiKey: false,
    },
    {
      name: 'Fixer.io',
      url: `https://api.fixer.io/latest?base=KRW&symbols=USD&access_key=${config.exchangeRate.apiKey}`,
      parser: (data: any) => data.rates.USD,
      requiresApiKey: true,
    },
    {
      name: 'CurrencyAPI',
      url: `https://api.currencyapi.com/v3/latest?apikey=${config.exchangeRate.apiKey}&base_currency=KRW&currencies=USD`,
      parser: (data: any) => 1 / data.data.USD.value,
      requiresApiKey: true,
    }
  ];

  constructor(redis: Redis) {
    this.redis = redis;
  }

  /**
   * 현재 환율 조회 (캐시 우선)
   */
  async getCurrentExchangeRate(): Promise<number> {
    try {
      // 캐시에서 조회
      const cached = await this.redis.get(this.cacheKey);
      
      if (cached) {
        const rate = parseFloat(cached);
        logger.debug(`Using cached exchange rate: ${rate}`);
        return rate;
      }

      // 캐시가 없으면 API 호출
      const rate = await this.fetchExchangeRate();
      
      // 캐시 저장
      await this.redis.setex(this.cacheKey, this.cacheTTL, rate.toString());
      
      return rate;
    } catch (error) {
      logger.error('Failed to get exchange rate:', error);
      
      // 데이터베이스에서 마지막 환율 조회
      const lastRate = await this.getLastSavedRate();
      
      if (lastRate) {
        logger.warn(`Using last saved exchange rate: ${lastRate}`);
        return lastRate;
      }
      
      throw new Error('Unable to get exchange rate');
    }
  }

  /**
   * API에서 환율 조회
   */
  private async fetchExchangeRate(): Promise<number> {
    let lastError: Error | null = null;

    // 여러 API 순차적으로 시도
    for (const api of this.exchangeRateApis) {
      try {
        logger.debug(`Fetching exchange rate from ${api.name}`);
        
        // API 키가 필요한데 없으면 스킵
        if (api.requiresApiKey && !config.exchangeRate.apiKey) {
          logger.debug(`Skipping ${api.name} - API key required`);
          continue;
        }

        const response = await retry(
          () => axios.get(api.url, { timeout: 5000 }),
          {
            retries: 2,
            minTimeout: 1000,
            maxTimeout: 3000,
          }
        );

        const rate = api.parser(response.data);
        
        if (rate && rate > 0) {
          logger.info(`Exchange rate fetched successfully from ${api.name}: ${rate}`);
          
          // 데이터베이스에 저장
          await this.saveExchangeRate(rate, api.name);
          
          return rate;
        }
      } catch (error) {
        logger.error(`Failed to fetch from ${api.name}:`, error);
        lastError = error as Error;
      }
    }

    throw lastError || new Error('All exchange rate APIs failed');
  }

  /**
   * 환율 정보 데이터베이스 저장
   */
  private async saveExchangeRate(rate: number, source: string): Promise<void> {
    try {
      const now = new Date();
      const validUntil = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24시간

      await ExchangeRate.create({
        baseCurrency: 'KRW',
        targetCurrency: 'USD',
        rate,
        source,
        isManual: false,
        validFrom: now,
        validUntil,
        metadata: {
          fetchedAt: now,
          apiSource: source,
        },
      });

      logger.debug('Exchange rate saved to database');
    } catch (error) {
      logger.error('Failed to save exchange rate:', error);
    }
  }

  /**
   * 마지막으로 저장된 환율 조회
   */
  private async getLastSavedRate(): Promise<number | null> {
    try {
      const lastRate = await ExchangeRate.findOne({
        baseCurrency: 'KRW',
        targetCurrency: 'USD',
      }).sort({ createdAt: -1 });

      return lastRate?.rate || null;
    } catch (error) {
      logger.error('Failed to get last saved rate:', error);
      return null;
    }
  }

  /**
   * 환율 업데이트 (크론 작업용)
   */
  async updateExchangeRate(): Promise<void> {
    try {
      logger.info('Starting exchange rate update...');
      
      const rate = await this.fetchExchangeRate();
      
      // 캐시 갱신
      await this.redis.setex(this.cacheKey, this.cacheTTL, rate.toString());
      
      // 시스템 로그
      await SystemLog.create({
        level: 'info',
        category: 'exchange-rate',
        message: 'Exchange rate updated successfully',
        context: {
          service: 'ExchangeRateService',
          method: 'updateExchangeRate',
        },
        metadata: {
          rate,
          baseCurrency: 'KRW',
          targetCurrency: 'USD',
        },
      });

      logger.info(`Exchange rate updated: ${rate}`);
    } catch (error) {
      logger.error('Failed to update exchange rate:', error);
      
      await SystemLog.create({
        level: 'error',
        category: 'exchange-rate',
        message: 'Exchange rate update failed',
        context: {
          service: 'ExchangeRateService',
          method: 'updateExchangeRate',
        },
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
        metadata: {},
      });

      throw error;
    }
  }

  /**
   * 수동 환율 설정
   */
  async setManualExchangeRate(rate: number, reason: string, userId: string): Promise<void> {
    if (rate <= 0) {
      throw new Error('Invalid exchange rate');
    }

    const now = new Date();
    const validUntil = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7일

    // 데이터베이스에 저장
    await ExchangeRate.create({
      baseCurrency: 'KRW',
      targetCurrency: 'USD',
      rate,
      source: 'manual',
      isManual: true,
      validFrom: now,
      validUntil,
      metadata: {
        reason,
        setBy: userId,
        setAt: now,
      },
    });

    // 캐시 갱신
    await this.redis.setex(this.cacheKey, this.cacheTTL, rate.toString());

    // 시스템 로그
    await SystemLog.create({
      level: 'info',
      category: 'exchange-rate',
      message: 'Manual exchange rate set',
      context: {
        service: 'ExchangeRateService',
        method: 'setManualExchangeRate',
        userId,
      },
      metadata: {
        rate,
        reason,
        validUntil,
      },
    });

    logger.info(`Manual exchange rate set: ${rate} by ${userId}`);
  }

  /**
   * 환율 이력 조회
   */
  async getExchangeRateHistory(days: number = 30): Promise<any[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return ExchangeRate.find({
      baseCurrency: 'KRW',
      targetCurrency: 'USD',
      createdAt: { $gte: startDate },
    })
      .sort({ createdAt: -1 })
      .lean();
  }

  /**
   * 환율 통계 조회
   */
  async getExchangeRateStats(): Promise<any> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const stats = await ExchangeRate.aggregate([
      {
        $match: {
          baseCurrency: 'KRW',
          targetCurrency: 'USD',
          createdAt: { $gte: thirtyDaysAgo },
        },
      },
      {
        $group: {
          _id: null,
          avgRate: { $avg: '$rate' },
          minRate: { $min: '$rate' },
          maxRate: { $max: '$rate' },
          count: { $sum: 1 },
          sources: { $addToSet: '$source' },
        },
      },
    ]);

    return stats[0] || {
      avgRate: 0,
      minRate: 0,
      maxRate: 0,
      count: 0,
      sources: [],
    };
  }

  /**
   * 캐시 무효화
   */
  async invalidateCache(): Promise<void> {
    await this.redis.del(this.cacheKey);
    logger.info('Exchange rate cache invalidated');
  }
}