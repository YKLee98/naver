// packages/backend/src/services/exchangeRate/ExchangeRateService.ts
import { Redis } from 'ioredis';
import axios from 'axios';
import { ExchangeRate } from '../../models/ExchangeRate.js';
import { logger } from '../../utils/logger.js';

export interface ExchangeRateData {
  base: string;
  target: string;
  rate: number;
  date: Date;
  source: string;
}

export class ExchangeRateService {
  private redis: Redis;
  private cacheTTL = 3600; // 1 hour
  private defaultRate = 1300; // Default KRW/USD rate
  private apiUrl =
    process.env['EXCHANGE_RATE_API_URL'] ||
    'https://api.exchangerate-api.com/v4/latest/USD';
  private apiKey = process.env['EXCHANGE_RATE_API_KEY'];

  constructor(redis: Redis) {
    this.redis = redis;
  }

  /**
   * Get current exchange rate
   */
  async getRate(base: string = 'USD', target: string = 'KRW'): Promise<number> {
    try {
      const cacheKey = `exchange_rate:${base}:${target}`;

      // Check cache first
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        logger.debug(`Exchange rate from cache: ${base}/${target} = ${cached}`);
        return parseFloat(cached);
      }

      // Check database
      const dbRate = await ExchangeRate.findOne({
        base,
        target,
      }).sort({ date: -1 });

      if (dbRate && this.isRateValid(dbRate.date)) {
        const rate = dbRate.rate;

        // Cache the rate
        await this.redis.setex(cacheKey, this.cacheTTL, rate.toString());

        logger.debug(
          `Exchange rate from database: ${base}/${target} = ${rate}`
        );
        return rate;
      }

      // Fetch from API
      const rate = await this.fetchRateFromAPI(base, target);

      // Save to database
      await this.saveRate(base, target, rate);

      // Cache the rate
      await this.redis.setex(cacheKey, this.cacheTTL, rate.toString());

      logger.info(
        `Exchange rate fetched from API: ${base}/${target} = ${rate}`
      );
      return rate;
    } catch (error) {
      logger.error('Failed to get exchange rate:', error);

      // Return default rate as fallback
      logger.warn(
        `Using default exchange rate: ${base}/${target} = ${this.defaultRate}`
      );
      return this.defaultRate;
    }
  }

  /**
   * Update exchange rates
   */
  async updateRates(): Promise<void> {
    try {
      logger.info('Updating exchange rates...');

      const pairs = [
        { base: 'USD', target: 'KRW' },
        { base: 'KRW', target: 'USD' },
        { base: 'EUR', target: 'KRW' },
        { base: 'JPY', target: 'KRW' },
        { base: 'CNY', target: 'KRW' },
      ];

      for (const pair of pairs) {
        try {
          const rate = await this.fetchRateFromAPI(pair.base, pair.target);
          await this.saveRate(pair.base, pair.target, rate);

          // Clear cache
          const cacheKey = `exchange_rate:${pair.base}:${pair.target}`;
          await this.redis.del(cacheKey);

          logger.info(
            `Updated exchange rate: ${pair.base}/${pair.target} = ${rate}`
          );
        } catch (error) {
          logger.error(
            `Failed to update rate for ${pair.base}/${pair.target}:`,
            error
          );
        }
      }

      logger.info('Exchange rates update completed');
    } catch (error) {
      logger.error('Failed to update exchange rates:', error);
    }
  }

  /**
   * Fetch rate from API
   */
  private async fetchRateFromAPI(
    base: string,
    target: string
  ): Promise<number> {
    try {
      let url = this.apiUrl;

      // Add API key if available
      if (this.apiKey) {
        url += url.includes('?') ? '&' : '?';
        url += `apikey=${this.apiKey}`;
      }

      // Replace base currency in URL
      url = url.replace('/USD', `/${base}`);

      const response = await axios.get(url, {
        timeout: 5000,
        headers: {
          Accept: 'application/json',
        },
      });

      if (response.data && response.data.rates && response.data.rates[target]) {
        return response.data.rates[target];
      }

      // Try alternative API structure
      if (response.data && response.data[target]) {
        return response.data[target];
      }

      throw new Error('Invalid API response structure');
    } catch (error) {
      logger.error('Failed to fetch exchange rate from API:', error);

      // Fallback to hardcoded rates
      return this.getFallbackRate(base, target);
    }
  }

  /**
   * Get fallback rate
   */
  private getFallbackRate(base: string, target: string): number {
    const fallbackRates: Record<string, Record<string, number>> = {
      USD: {
        KRW: 1300,
        EUR: 0.85,
        JPY: 110,
        CNY: 6.5,
      },
      KRW: {
        USD: 0.00077,
        EUR: 0.00065,
        JPY: 0.085,
        CNY: 0.005,
      },
    };

    if (fallbackRates[base] && fallbackRates[base][target]) {
      return fallbackRates[base][target];
    }

    // If no specific rate found, return default
    return this.defaultRate;
  }

  /**
   * Save rate to database
   */
  private async saveRate(
    base: string,
    target: string,
    rate: number
  ): Promise<void> {
    try {
      await ExchangeRate.findOneAndUpdate(
        { base, target },
        {
          base,
          target,
          rate,
          date: new Date(),
          source: this.apiUrl,
        },
        { upsert: true, new: true }
      );
    } catch (error) {
      logger.error('Failed to save exchange rate:', error);
    }
  }

  /**
   * Check if rate is still valid (less than 24 hours old)
   */
  private isRateValid(date: Date): boolean {
    const now = new Date();
    const diffHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
    return diffHours < 24;
  }

  /**
   * Convert amount between currencies
   */
  async convert(
    amount: number,
    from: string = 'USD',
    to: string = 'KRW'
  ): Promise<number> {
    const rate = await this.getRate(from, to);
    return amount * rate;
  }

  /**
   * Get multiple rates
   */
  async getRates(
    pairs: Array<{ base: string; target: string }>
  ): Promise<Record<string, number>> {
    const rates: Record<string, number> = {};

    for (const pair of pairs) {
      const key = `${pair.base}/${pair.target}`;
      rates[key] = await this.getRate(pair.base, pair.target);
    }

    return rates;
  }

  /**
   * Get historical rates
   */
  async getHistoricalRates(
    base: string,
    target: string,
    days: number = 30
  ): Promise<ExchangeRateData[]> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const rates = await ExchangeRate.find({
        base,
        target,
        date: { $gte: startDate },
      })
        .sort({ date: 1 })
        .lean();

      return rates.map((rate) => ({
        base: rate.base,
        target: rate.target,
        rate: rate.rate,
        date: rate.date,
        source: rate.source,
      }));
    } catch (error) {
      logger.error('Failed to get historical rates:', error);
      return [];
    }
  }

  /**
   * Get current rate (USD to KRW)
   */
  async getCurrentRate(): Promise<number> {
    return this.getRate('USD', 'KRW');
  }

  /**
   * Get rate history
   */
  async getRateHistory(days: number = 30): Promise<any[]> {
    const history = await this.getHistoricalRates('USD', 'KRW', days);
    return history.map(h => ({
      rate: h.rate,
      date: h.date,
      source: h.source
    }));
  }

  /**
   * Set manual rate
   */
  async setManualRate(rate: number, validHours: number = 24): Promise<void> {
    const cacheKey = 'exchange_rate:USD:KRW';
    const ttl = validHours * 3600; // Convert hours to seconds
    
    // Save to cache
    await this.redis.setex(cacheKey, ttl, rate.toString());
    
    // Save to database
    await this.saveRate('USD', 'KRW', rate);
    
    logger.info(`Manual rate set: USD/KRW = ${rate} for ${validHours} hours`);
  }

  /**
   * Update exchange rate from API
   */
  async updateExchangeRate(): Promise<number> {
    const rate = await this.fetchRateFromAPI('USD', 'KRW');
    await this.saveRate('USD', 'KRW', rate);
    
    // Clear cache to force refresh
    const cacheKey = 'exchange_rate:USD:KRW';
    await this.redis.del(cacheKey);
    
    return rate;
  }

  /**
   * Calculate price with margin
   */
  calculatePriceWithMargin(
    basePrice: number,
    exchangeRate: number,
    margin: number = 0.1
  ): number {
    const convertedPrice = basePrice * exchangeRate;
    const priceWithMargin = convertedPrice * (1 + margin);

    // Round to nearest 10 KRW
    return Math.round(priceWithMargin / 10) * 10;
  }

  /**
   * Clean old rates
   */
  async cleanOldRates(days: number = 90): Promise<void> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const result = await ExchangeRate.deleteMany({
        date: { $lt: cutoffDate },
      });

      logger.info(`Cleaned ${result.deletedCount} old exchange rates`);
    } catch (error) {
      logger.error('Failed to clean old rates:', error);
    }
  }

  /**
   * Cleanup service
   */
  async cleanup(): Promise<void> {
    // Clear all cached rates
    const keys = await this.redis.keys('exchange_rate:*');
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }

    logger.info('ExchangeRateService cleanup completed');
  }
}

export default ExchangeRateService;
