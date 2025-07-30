// packages/backend/src/services/sync/PriceSyncService.ts
import { Redis } from 'ioredis';
import { logger } from '@/utils/logger';
import { 
  ProductMapping, 
  PriceHistory, 
  ExchangeRate,
  PriceSyncRule,
  SystemLog 
} from '@/models';
import { NaverProductService } from '../naver';
import { ShopifyGraphQLService } from '../shopify';
import { EventEmitter } from 'events';
import { retry } from '@/utils/retry';
import axios from 'axios';

interface PriceSyncOptions {
  mode: 'auto' | 'manual';
  margin?: number;
  exchangeRateSource?: 'api' | 'manual';
  customExchangeRate?: number;
  roundingStrategy?: 'up' | 'down' | 'nearest';
  priceRules?: PriceSyncRule[];
}

interface PriceCalculationResult {
  naverPrice: number;
  shopifyPrice: number;
  exchangeRate: number;
  marginRate: number;
  calculatedMargin: number;
  appliedRules: string[];
  warnings: string[];
}

interface InitialPriceData {
  sku: string;
  naverPrice: number;
  currentShopifyPrice: number;
  suggestedShopifyPrice: number;
  currentMargin: number;
  suggestedMargin: number;
  exchangeRate: number;
}

export class PriceSyncService extends EventEmitter {
  private redis: Redis;
  private naverProductService: NaverProductService;
  private shopifyService: ShopifyGraphQLService;
  private readonly exchangeRateCacheKey = 'exchange_rate:KRW:USD';
  private readonly cacheTTL = 3600; // 1시간
  private readonly EXCHANGE_RATE_APIS = [
    {
      name: 'ExchangeRate-API',
      url: 'https://api.exchangerate-api.com/v4/latest/KRW',
      parser: (data: any) => 1 / data.rates.USD
    },
    {
      name: 'Fixer.io',
      url: `https://api.fixer.io/latest?base=KRW&symbols=USD&access_key=${process.env.FIXER_API_KEY}`,
      parser: (data: any) => data.rates.USD
    }
  ];

  constructor(
    redis: Redis,
    naverProductService: NaverProductService,
    shopifyService: ShopifyGraphQLService
  ) {
    super();
    this.redis = redis;
    this.naverProductService = naverProductService;
    this.shopifyService = shopifyService;
  }

  /**
   * 초기 가격 데이터 가져오기 (수동 설정 시 사용)
   */
  async getInitialPriceData(sku: string): Promise<InitialPriceData> {
    try {
      // SKU 매핑 정보 조회
      const mapping = await ProductMapping.findOne({ sku }).lean();
      if (!mapping) {
        throw new Error(`SKU ${sku} not found in mapping`);
      }

      // 병렬로 양쪽 플랫폼 가격 조회
      const [naverProduct, shopifyProduct] = await Promise.all([
        this.naverProductService.getProduct(mapping.naver_product_id),
        this.shopifyService.getProductVariant(mapping.shopify_variant_id)
      ]);

      // 현재 환율 조회
      const exchangeRate = await this.getCurrentExchangeRate();

      // 현재 마진율 계산
      const currentMargin = this.calculateMarginFromPrices(
        naverProduct.salePrice,
        shopifyProduct.price,
        exchangeRate
      );

      // 제안 가격 및 마진 계산 (기본 15% 마진)
      const suggestedMargin = 1.15;
      const suggestedShopifyPrice = this.calculatePrice(
        naverProduct.salePrice,
        exchangeRate,
        suggestedMargin
      );

      return {
        sku,
        naverPrice: naverProduct.salePrice,
        currentShopifyPrice: parseFloat(shopifyProduct.price),
        suggestedShopifyPrice,
        currentMargin,
        suggestedMargin,
        exchangeRate
      };
    } catch (error) {
      logger.error(`Failed to get initial price data for SKU ${sku}:`, error);
      throw error;
    }
  }

  /**
   * 여러 SKU의 초기 가격 데이터 일괄 조회
   */
  async getBulkInitialPriceData(skus: string[]): Promise<InitialPriceData[]> {
    const results: InitialPriceData[] = [];
    const errors: Array<{sku: string, error: string}> = [];

    // 청크로 나누어 처리 (동시 처리 제한)
    const chunks = this.chunkArray(skus, 10);
    
    for (const chunk of chunks) {
      const chunkResults = await Promise.allSettled(
        chunk.map(sku => this.getInitialPriceData(sku))
      );

      chunkResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          errors.push({
            sku: chunk[index],
            error: result.reason.message
          });
        }
      });
    }

    if (errors.length > 0) {
      logger.warn(`Failed to get initial price data for ${errors.length} SKUs`, errors);
    }

    return results;
  }

  /**
   * 가격에서 마진율 역산
   */
  private calculateMarginFromPrices(
    naverPrice: number,
    shopifyPrice: number,
    exchangeRate: number
  ): number {
    const baseUsdPrice = naverPrice * exchangeRate;
    return shopifyPrice / baseUsdPrice;
  }

  /**
   * 가격 동기화 규칙 적용
   */
  async applyPriceSyncRules(
    sku: string,
    options: PriceSyncOptions
  ): Promise<PriceCalculationResult> {
    const mapping = await ProductMapping.findOne({ sku }).lean();
    if (!mapping) {
      throw new Error(`SKU ${sku} not found`);
    }

    // 네이버 가격 조회
    const naverProduct = await this.naverProductService.getProduct(
      mapping.naver_product_id
    );

    // 환율 조회
    const exchangeRate = options.customExchangeRate || 
      await this.getCurrentExchangeRate();

    // 기본 마진율 설정
    let marginRate = options.margin || 1.15;
    const appliedRules: string[] = [];
    const warnings: string[] = [];

    // 카테고리별 마진 규칙 적용
    if (options.priceRules && options.priceRules.length > 0) {
      for (const rule of options.priceRules) {
        if (this.matchRule(mapping, rule)) {
          marginRate = rule.marginRate;
          appliedRules.push(rule.name);
        }
      }
    }

    // 가격 계산
    const shopifyPrice = this.calculatePrice(
      naverProduct.salePrice,
      exchangeRate,
      marginRate,
      options.roundingStrategy
    );

    // 가격 검증
    if (shopifyPrice < 1) {
      warnings.push('Calculated price is less than $1');
    }

    // 가격 변동률 체크
    if (mapping.last_shopify_price) {
      const changeRate = Math.abs(
        (shopifyPrice - mapping.last_shopify_price) / mapping.last_shopify_price
      );
      if (changeRate > 0.5) {
        warnings.push(`Price change is more than 50% (${(changeRate * 100).toFixed(2)}%)`);
      }
    }

    return {
      naverPrice: naverProduct.salePrice,
      shopifyPrice,
      exchangeRate,
      marginRate,
      calculatedMargin: marginRate,
      appliedRules,
      warnings
    };
  }

  /**
   * 현재 환율 조회 (캐시 우선)
   */
  async getCurrentExchangeRate(): Promise<number> {
    try {
      // 캐시 확인
      const cached = await this.redis.get(this.exchangeRateCacheKey);
      if (cached) {
        return parseFloat(cached);
      }

      // DB에서 수동 설정 환율 확인
      const manualRate = await ExchangeRate.findOne({
        isManual: true,
        validFrom: { $lte: new Date() },
        validUntil: { $gte: new Date() }
      }).sort({ createdAt: -1 });

      if (manualRate) {
        await this.redis.setex(
          this.exchangeRateCacheKey, 
          this.cacheTTL, 
          manualRate.rate.toString()
        );
        return manualRate.rate;
      }

      // API에서 환율 조회
      const rate = await this.fetchExchangeRateFromAPI();
      
      // DB 저장
      await ExchangeRate.create({
        baseCurrency: 'KRW',
        targetCurrency: 'USD',
        rate,
        source: 'api',
        isManual: false,
        validFrom: new Date(),
        validUntil: new Date(Date.now() + 24 * 60 * 60 * 1000)
      });

      // 캐시 저장
      await this.redis.setex(this.exchangeRateCacheKey, this.cacheTTL, rate.toString());
      
      return rate;
    } catch (error) {
      logger.error('Failed to get exchange rate:', error);
      
      // 폴백: 마지막 알려진 환율 사용
      const lastRate = await ExchangeRate.findOne({})
        .sort({ createdAt: -1 })
        .lean();
      
      if (lastRate) {
        logger.warn(`Using last known exchange rate: ${lastRate.rate}`);
        return lastRate.rate;
      }
      
      // 최종 폴백: 기본값
      logger.error('Using default exchange rate: 0.00075');
      return 0.00075;
    }
  }

  /**
   * 외부 API에서 환율 조회
   */
  private async fetchExchangeRateFromAPI(): Promise<number> {
    for (const api of this.EXCHANGE_RATE_APIS) {
      try {
        const response = await retry(
          () => axios.get(api.url, { timeout: 5000 }),
          { retries: 2, minTimeout: 1000 }
        );

        const rate = api.parser(response.data);
        
        if (rate && rate > 0) {
          logger.info(`Exchange rate fetched from ${api.name}: ${rate}`);
          return rate;
        }
      } catch (error) {
        logger.warn(`Failed to fetch rate from ${api.name}:`, error.message);
      }
    }

    throw new Error('Failed to fetch exchange rate from all sources');
  }

  /**
   * 간단한 Shopify 가격 계산 메서드 (기존 코드와의 호환성을 위해 추가)
   */
  async calculateShopifyPrice(
    naverPrice: number,
    margin: number = 1.15
  ): Promise<number> {
    try {
      // 현재 환율 조회
      const exchangeRate = await this.getCurrentExchangeRate();
      
      // 가격 계산
      const shopifyPrice = this.calculatePrice(
        naverPrice,
        exchangeRate,
        margin,
        'nearest' // default rounding strategy
      );
      
      return shopifyPrice;
    } catch (error) {
      logger.error('Failed to calculate Shopify price', error);
      throw error;
    }
  }

  /**
   * 가격 계산 헬퍼 메서드
   */
  private calculatePrice(
    naverPrice: number,
    exchangeRate: number,
    marginRate: number,
    roundingStrategy: 'up' | 'down' | 'nearest' = 'nearest'
  ): number {
    const baseUsdPrice = naverPrice * exchangeRate;
    const priceWithMargin = baseUsdPrice * marginRate;
    
    // 라운딩 전략 적용
    switch (roundingStrategy) {
      case 'up':
        return Math.ceil(priceWithMargin * 100) / 100;
      case 'down':
        return Math.floor(priceWithMargin * 100) / 100;
      case 'nearest':
      default:
        return Math.round(priceWithMargin * 100) / 100;
    }
  }

  /**
   * 가격 규칙 매칭 확인
   */
  private matchRule(mapping: any, rule: PriceSyncRule): boolean {
    // 카테고리 매칭
    if (rule.condition.category && mapping.category !== rule.condition.category) {
      return false;
    }
    
    // 가격 범위 매칭
    if (rule.condition.priceRange) {
      const { min, max } = rule.condition.priceRange;
      if (min && mapping.naverPrice < min) return false;
      if (max && mapping.naverPrice > max) return false;
    }
    
    // SKU 패턴 매칭
    if (rule.condition.skuPattern) {
      const pattern = new RegExp(rule.condition.skuPattern);
      if (!pattern.test(mapping.sku)) return false;
    }
    
    return true;
  }

  /**
   * 가격 동기화 실행
   */
  async syncPrices(
    skus: string[],
    options: PriceSyncOptions
  ): Promise<{
    success: number;
    failed: number;
    results: Array<{
      sku: string;
      success: boolean;
      data?: PriceCalculationResult;
      error?: string;
    }>;
  }> {
    const results = [];
    let success = 0;
    let failed = 0;

    this.emit('sync:start', { total: skus.length, options });

    for (const sku of skus) {
      try {
        // 가격 계산
        const priceData = await this.applyPriceSyncRules(sku, options);

        // Shopify 업데이트
        const mapping = await ProductMapping.findOne({ sku }).lean();
        await this.shopifyService.updateProductPrice(
          mapping.shopify_variant_id,
          priceData.shopifyPrice
        );

        // 이력 저장
        await PriceHistory.create({
          sku,
          platform: 'shopify',
          oldPrice: mapping.last_shopify_price || 0,
          newPrice: priceData.shopifyPrice,
          reason: options.mode === 'manual' ? 'Manual sync' : 'Auto sync',
          metadata: {
            naverPrice: priceData.naverPrice,
            exchangeRate: priceData.exchangeRate,
            marginRate: priceData.marginRate,
            appliedRules: priceData.appliedRules
          }
        });

        // 매핑 업데이트
        await ProductMapping.updateOne(
          { sku },
          {
            last_shopify_price: priceData.shopifyPrice,
            last_sync_timestamp: new Date(),
            last_price_sync: new Date()
          }
        );

        results.push({
          sku,
          success: true,
          data: priceData
        });
        success++;

        this.emit('sync:progress', {
          current: results.length,
          total: skus.length,
          sku
        });

      } catch (error) {
        logger.error(`Failed to sync price for SKU ${sku}:`, error);
        results.push({
          sku,
          success: false,
          error: error.message
        });
        failed++;
      }
    }

    this.emit('sync:complete', { success, failed });

    // 시스템 로그 기록
    await SystemLog.create({
      type: 'PRICE_SYNC',
      level: failed > 0 ? 'warning' : 'info',
      message: `Price sync completed: ${success} success, ${failed} failed`,
      metadata: {
        options,
        totalSkus: skus.length,
        success,
        failed
      }
    });

    return { success, failed, results };
  }

  /**
   * 배열을 청크로 나누는 헬퍼 메서드
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * 수동 환율 설정
   */
  async setManualExchangeRate(
    rate: number,
    reason: string,
    validDays: number = 7
  ): Promise<void> {
    const now = new Date();
    const validUntil = new Date(now.getTime() + validDays * 24 * 60 * 60 * 1000);

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
        setBy: 'admin' // 나중에 사용자 정보로 대체
      }
    });

    // 캐시 업데이트
    await this.redis.setex(this.exchangeRateCacheKey, this.cacheTTL, rate.toString());
    
    this.emit('exchangeRate:updated', { rate, reason, validUntil });
    
    logger.info(`Manual exchange rate set: ${rate} (${reason})`);
  }

  /**
   * 가격 동기화 이력 조회
   */
  async getPriceHistory(
    sku: string,
    options: {
      limit?: number;
      startDate?: Date;
      endDate?: Date;
    } = {}
  ): Promise<any[]> {
    const query: any = { sku };
    
    if (options.startDate || options.endDate) {
      query.createdAt = {};
      if (options.startDate) query.createdAt.$gte = options.startDate;
      if (options.endDate) query.createdAt.$lte = options.endDate;
    }

    return PriceHistory.find(query)
      .sort({ createdAt: -1 })
      .limit(options.limit || 100)
      .lean();
  }

  /**
   * 가격 분석 리포트 생성
   */
  async generatePriceAnalytics(
    dateRange: { start: Date; end: Date }
  ): Promise<{
    avgMargin: number;
    priceChanges: number;
    totalRevenue: number;
    topChangedProducts: Array<{
      sku: string;
      changeCount: number;
      avgChange: number;
    }>;
  }> {
    // 가격 이력 조회
    const history = await PriceHistory.find({
      createdAt: { $gte: dateRange.start, $lte: dateRange.end }
    }).lean();

    // 평균 마진 계산
    const margins = history
      .filter(h => h.metadata?.marginRate)
      .map(h => h.metadata.marginRate);
    
    const avgMargin = margins.length > 0
      ? margins.reduce((sum, m) => sum + m, 0) / margins.length
      : 0;

    // SKU별 변경 횟수 집계
    const skuChanges: { [sku: string]: { count: number; changes: number[] } } = {};
    
    history.forEach(h => {
      if (!skuChanges[h.sku]) {
        skuChanges[h.sku] = { count: 0, changes: [] };
      }
      skuChanges[h.sku].count++;
      
      if (h.oldPrice && h.newPrice) {
        const changePercent = ((h.newPrice - h.oldPrice) / h.oldPrice) * 100;
        skuChanges[h.sku].changes.push(changePercent);
      }
    });

    // Top 변경 상품
    const topChangedProducts = Object.entries(skuChanges)
      .map(([sku, data]) => ({
        sku,
        changeCount: data.count,
        avgChange: data.changes.length > 0
          ? data.changes.reduce((sum, c) => sum + c, 0) / data.changes.length
          : 0
      }))
      .sort((a, b) => b.changeCount - a.changeCount)
      .slice(0, 10);

    return {
      avgMargin,
      priceChanges: history.length,
      totalRevenue: 0, // 실제 판매 데이터와 연계 필요
      topChangedProducts
    };
  }

  /**
   * 대량 가격 동기화 (배치 처리)
   */
  async syncPricesInBulk(
    options: PriceSyncOptions & { batchSize?: number }
  ): Promise<{
    totalProcessed: number;
    success: number;
    failed: number;
    errors: Array<{ sku: string; error: string }>;
  }> {
    const batchSize = options.batchSize || 50;
    const errors: Array<{ sku: string; error: string }> = [];
    let totalProcessed = 0;
    let success = 0;
    let failed = 0;

    // 활성 매핑 조회
    const mappings = await ProductMapping.find({ isActive: true })
      .select('sku')
      .lean();

    const skus = mappings.map(m => m.sku);
    const batches = this.chunkArray(skus, batchSize);

    logger.info(`Starting bulk price sync for ${skus.length} SKUs in ${batches.length} batches`);

    for (const [index, batch] of batches.entries()) {
      logger.info(`Processing batch ${index + 1} of ${batches.length}`);
      
      try {
        const result = await this.syncPrices(batch, options);
        totalProcessed += batch.length;
        success += result.success;
        failed += result.failed;
        
        // 에러 수집
        result.results
          .filter(r => !r.success)
          .forEach(r => errors.push({ sku: r.sku, error: r.error || 'Unknown error' }));
        
        // Rate limiting between batches
        if (index < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) {
        logger.error(`Batch ${index + 1} failed:`, error);
        batch.forEach(sku => errors.push({ 
          sku, 
          error: error instanceof Error ? error.message : 'Batch processing failed' 
        }));
        failed += batch.length;
      }
    }

    logger.info(`Bulk price sync completed: ${success} success, ${failed} failed`);

    return {
      totalProcessed,
      success,
      failed,
      errors
    };
  }

  /**
   * 가격 변동 알림 설정 확인
   */
  async checkPriceAlerts(sku: string, oldPrice: number, newPrice: number): Promise<void> {
    const changePercent = Math.abs((newPrice - oldPrice) / oldPrice) * 100;
    
    // 20% 이상 변동 시 알림
    if (changePercent >= 20) {
      this.emit('price:alert', {
        sku,
        oldPrice,
        newPrice,
        changePercent,
        message: `Price changed by ${changePercent.toFixed(2)}% for SKU ${sku}`
      });
    }
  }

  /**
   * 가격 동기화 작업 스케줄링
   */
  async schedulePriceSync(cronExpression: string): Promise<void> {
    // 스케줄링 로직은 별도의 스케줄러 서비스에서 구현
    logger.info(`Price sync scheduled with cron: ${cronExpression}`);
    this.emit('schedule:created', { cron: cronExpression });
  }

  /**
   * 가격 롤백
   */
  async rollbackPrice(sku: string, targetDate: Date): Promise<void> {
    // 특정 날짜의 가격으로 롤백
    const historyRecord = await PriceHistory.findOne({
      sku,
      createdAt: { $lte: targetDate }
    })
    .sort({ createdAt: -1 })
    .lean();

    if (!historyRecord) {
      throw new Error(`No price history found for SKU ${sku} before ${targetDate}`);
    }

    const mapping = await ProductMapping.findOne({ sku }).lean();
    if (!mapping) {
      throw new Error(`Mapping not found for SKU ${sku}`);
    }

    // Shopify 가격 업데이트
    await this.shopifyService.updateProductPrice(
      mapping.shopify_variant_id,
      historyRecord.oldPrice
    );

    // 롤백 이력 저장
    await PriceHistory.create({
      sku,
      platform: 'shopify',
      oldPrice: historyRecord.newPrice,
      newPrice: historyRecord.oldPrice,
      reason: `Rollback to ${targetDate.toISOString()}`,
      metadata: {
        rollbackTargetDate: targetDate,
        rollbackFromId: historyRecord._id
      }
    });

    logger.info(`Price rolled back for SKU ${sku} to ${historyRecord.oldPrice}`);
  }
}