// ===== 1. packages/backend/src/services/exchangeRate/ExchangeRateService.ts =====
import { Redis } from 'ioredis';
import axios from 'axios';
import { logger } from '../../utils/logger';
import { ExchangeRate } from '../../models';
import { config } from '../../config';
import { retryOperation } from '../../utils/retry'; 

interface ExchangeRateProvider {
  name: string;
  url: string;
  parser: (data: any) => number;
  requiresApiKey: boolean;
  priority: number;
}

export class ExchangeRateService {
  private redis: Redis;
  private readonly cacheKey = 'exchange_rate:KRW:USD';
  private readonly cacheTTL = 3600; // 1시간
  private readonly providers: ExchangeRateProvider[] = [
    {
      name: 'ExchangeRate-API',
      url: 'https://api.exchangerate-api.com/v4/latest/USD',
      parser: (data: any) => data.rates.KRW,
      requiresApiKey: false,
      priority: 1
    },
    {
      name: 'Fixer.io',
      url: `https://api.fixer.io/latest?base=USD&symbols=KRW`,
      parser: (data: any) => data.rates.KRW,
      requiresApiKey: true,
      priority: 2
    },
    {
      name: 'CurrencyAPI',
      url: `https://api.currencyapi.com/v3/latest?base_currency=USD&currencies=KRW`,
      parser: (data: any) => data.data.KRW.value,
      requiresApiKey: true,
      priority: 3
    }
  ];

  constructor(redis: Redis) {
    this.redis = redis;
  }

  /**
   * 현재 환율 조회 (USD to KRW)
   */
  async getCurrentRate(): Promise<number> {
    try {
      // 1. 캐시 확인
      const cached = await this.redis.get(this.cacheKey);
      if (cached) {
        logger.debug(`Using cached exchange rate: ${cached}`);
        return parseFloat(cached);
      }

      // 2. 수동 설정 환율 확인
      const manualRate = await this.getManualRate();
      if (manualRate) {
        await this.setCacheRate(manualRate);
        return manualRate;
      }

      // 3. API에서 환율 가져오기
      const apiRate = await this.fetchFromProviders();
      await this.saveRate(apiRate, 'api');
      await this.setCacheRate(apiRate);
      
      return apiRate;
    } catch (error) {
      logger.error('Failed to get exchange rate:', error);
      
      // 4. 폴백: 마지막 저장된 환율
      const lastRate = await this.getLastSavedRate();
      if (lastRate) {
        logger.warn(`Using last saved rate: ${lastRate}`);
        return lastRate;
      }

      // 5. 최종 폴백: 기본값
      const defaultRate = 1300;
      logger.error(`Using default rate: ${defaultRate}`);
      return defaultRate;
    }
  }

  /**
   * 수동 환율 설정
   */
  async setManualRate(rate: number, validHours: number = 24): Promise<void> {
    try {
      const now = new Date();
      const validUntil = new Date(now.getTime() + validHours * 60 * 60 * 1000);

      // 기존 활성 환율 비활성화
      await ExchangeRate.updateMany(
        { isActive: true },
        { isActive: false }
      );

      // 새 환율 저장
      await ExchangeRate.create({
        rate,
        source: 'manual',
        isActive: true,
        isManual: true,
        validUntil,
        baseCurrency: 'USD',
        targetCurrency: 'KRW',
        metadata: {
          setAt: now,
          validHours
        }
      });

      // 캐시 업데이트
      await this.setCacheRate(rate);
      
      logger.info(`Manual exchange rate set: ${rate} (valid for ${validHours} hours)`);
    } catch (error) {
      logger.error('Failed to set manual rate:', error);
      throw error;
    }
  }

  /**
   * 환율 업데이트 (크론 작업용)
   */
  async updateExchangeRate(): Promise<number> {
    try {
      logger.info('Updating exchange rate...');
      
      // 수동 환율이 유효한지 확인
      const manualRate = await this.getManualRate();
      if (manualRate) {
        logger.info('Manual rate is still valid, skipping update');
        return manualRate;
      }

      // API에서 새 환율 가져오기
      const newRate = await this.fetchFromProviders();
      
      // 변동률 확인
      const lastRate = await this.getLastSavedRate();
      if (lastRate) {
        const changePercent = Math.abs((newRate - lastRate) / lastRate * 100);
        logger.info(`Exchange rate change: ${changePercent.toFixed(2)}%`);
        
        // 급격한 변동 경고 (10% 이상)
        if (changePercent > 10) {
          logger.warn(`Large exchange rate change detected: ${changePercent.toFixed(2)}%`);
        }
      }

      // 저장 및 캐시
      await this.saveRate(newRate, 'api');
      await this.setCacheRate(newRate);
      
      logger.info(`Exchange rate updated: ${newRate}`);
      return newRate;
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
      createdAt: { $gte: startDate }
    })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();
  }

  /**
   * Private Methods
   */
  private async getManualRate(): Promise<number | null> {
    const manualRate = await ExchangeRate.findOne({
      isManual: true,
      isActive: true,
      validUntil: { $gte: new Date() }
    }).lean();

    return manualRate?.rate || null;
  }

  private async getLastSavedRate(): Promise<number | null> {
    const lastRate = await ExchangeRate.findOne({
      baseCurrency: 'USD',
      targetCurrency: 'KRW'
    })
    .sort({ createdAt: -1 })
    .lean();

    return lastRate?.rate || null;
  }

  private async fetchFromProviders(): Promise<number> {
    const sortedProviders = [...this.providers].sort((a, b) => a.priority - b.priority);
    
    for (const provider of sortedProviders) {
      try {
        if (provider.requiresApiKey && !config.exchangeRate?.apiKey) {
          logger.debug(`Skipping ${provider.name} - API key required`);
          continue;
        }

        logger.debug(`Fetching from ${provider.name}...`);
        
        const url = provider.requiresApiKey 
          ? `${provider.url}&access_key=${config.exchangeRate.apiKey}`
          : provider.url;

        const response = await retry(
          async () => {
            const res = await axios.get(url, { timeout: 5000 });
            return res.data;
          },
          {
            retries: 2,
            minTimeout: 1000,
            maxTimeout: 3000,
            onRetry: (error, attempt) => {
              logger.debug(`Retry attempt ${attempt} for ${provider.name}:`, error.message);
            }
          }
        );

        const rate = provider.parser(response);
        
        if (rate && rate > 0 && rate < 10000) { // 유효성 검사
          logger.info(`Successfully fetched rate from ${provider.name}: ${rate}`);
          return rate;
        }
      } catch (error: any) {
        logger.warn(`Failed to fetch from ${provider.name}:`, error.message);
      }
    }

    throw new Error('All exchange rate providers failed');
  }

  private async saveRate(rate: number, source: string): Promise<void> {
    await ExchangeRate.create({
      rate,
      source,
      isActive: true,
      isManual: false,
      baseCurrency: 'USD',
      targetCurrency: 'KRW',
      validUntil: new Date(Date.now() + 24 * 60 * 60 * 1000),
      metadata: {
        fetchedAt: new Date(),
        provider: source
      }
    });
  }

  private async setCacheRate(rate: number): Promise<void> {
    await this.redis.setex(this.cacheKey, this.cacheTTL, rate.toString());
  }
}