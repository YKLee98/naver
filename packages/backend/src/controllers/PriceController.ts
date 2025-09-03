// packages/backend/src/controllers/PriceController.ts
import { Request, Response, NextFunction } from 'express';
import { PriceHistory, ExchangeRate, ProductMapping } from '../models/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/errors.js';
import { getRedisClient } from '../config/redis.js';
import { logger } from '../utils/logger.js';

export class PriceController {
  private priceSyncService: any;
  private exchangeRateService: any;

  constructor(priceSyncService?: any, exchangeRateService?: any) {
    this.priceSyncService = priceSyncService;
    this.exchangeRateService = exchangeRateService;

    // Bind method aliases for api.routes.ts compatibility
    this.getPrices = this.getCurrentPrices.bind(this);
    this.getPriceBySku = this.getCurrentPrice.bind(this);
    this.getPriceDiscrepancies = this.getPriceDiscrepanciesMethod.bind(this);
    this.calculatePrice = this.simulatePriceCalculation.bind(this);
    this.getMargins = this.getMarginsMethod.bind(this);
    this.syncPriceBySku = this.syncPriceBySkuMethod.bind(this);
  }

  // Method aliases for api.routes.ts compatibility
  getPrices: any;
  getPriceBySku: any;
  getPriceDiscrepancies: any;
  calculatePrice: any;
  getMargins: any;
  syncPriceBySku: any;
  /**
   * 가격 이력 조회
   * GET /api/v1/prices/history
   */
  getPriceHistory = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const { sku, startDate, endDate, page = 1, limit = 20 } = req.query;

      const query: any = {};

      if (sku) {
        query.sku = sku;
      }

      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) {
          query.createdAt.$gte = new Date(startDate as string);
        }
        if (endDate) {
          query.createdAt.$lte = new Date(endDate as string);
        }
      }

      const skip = (Number(page) - 1) * Number(limit);

      const [data, total] = await Promise.all([
        PriceHistory.find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(Number(limit))
          .populate('sku', 'name')
          .lean(),
        PriceHistory.countDocuments(query),
      ]);

      // 데이터 포맷팅
      const formattedData = data.map((item) => ({
        id: item._id,
        sku: item.sku,
        productName: item.productName || 'Unknown Product',
        platform: item.platform,
        oldPrice: item.oldPrice,
        newPrice: item.newPrice,
        changePercent: item.oldPrice
          ? (((item.newPrice - item.oldPrice) / item.oldPrice) * 100).toFixed(2)
          : 0,
        changeReason: item.changeReason,
        changedBy: item.changedBy,
        createdAt: item.createdAt,
      }));

      res.json({
        success: true,
        data: formattedData,
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          totalPages: Math.ceil(total / Number(limit)),
        },
      });
    }
  );

  /**
   * 현재 가격 목록 조회
   * GET /api/v1/prices/current
   */
  getCurrentPrices = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const { page = 1, limit = 20, search, realtime } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const query: any = {};

      if (search) {
        query.$or = [
          { sku: { $regex: search, $options: 'i' } },
          { productName: { $regex: search, $options: 'i' } },
        ];
      }

      logger.info('Fetching product mappings for prices:', { 
        query, 
        skip, 
        limit: Number(limit),
        realtime: realtime === 'true'
      });

      const [mappings, total] = await Promise.all([
        ProductMapping.find(query).skip(skip).limit(Number(limit)).lean(),
        ProductMapping.countDocuments(query),
      ]);

      logger.info(`Found ${mappings.length} mappings`);

      // 실시간 가격 조회 옵션
      const priceDataPromises = mappings.map(async (mapping) => {
        let naverPrice = 0;
        let shopifyPrice = 0;
        
        if (realtime === 'true' || !mapping.pricing) {
          try {
            // 네이버 실시간 가격 조회 - searchProducts 메서드 사용
            const naverService = (this as any).naverProductService;
            if (naverService && mapping.sku) {
              try {
                const searchResults = await naverService.searchProducts({
                  searchKeyword: mapping.sku,
                  searchType: 'SELLER_MANAGEMENT_CODE',
                  page: 1,
                  size: 10
                });
                
                if (searchResults?.contents && searchResults.contents.length > 0) {
                  // 매핑된 ID와 정확히 일치하는 상품 찾기
                  let naverProduct = null;
                  
                  // 먼저 ID로 정확한 매칭 시도
                  for (const item of searchResults.contents) {
                    // ID가 정확히 일치하는지 확인
                    const itemId = String(item.id || item.productNo || item.channelProductNo || '');
                    if (itemId === String(mapping.naverProductId)) {
                      naverProduct = item;
                      logger.info(`Found exact match by ID: ${itemId}`);
                      break;
                    }
                    
                    // channelProducts 확인
                    if (item.channelProducts && Array.isArray(item.channelProducts)) {
                      for (const channelProduct of item.channelProducts) {
                        const channelId = String(channelProduct.channelProductNo || channelProduct.id || '');
                        if (channelId === String(mapping.naverProductId)) {
                          naverProduct = {
                            ...channelProduct,
                            salePrice: channelProduct.salePrice || item.salePrice,
                            price: channelProduct.price || item.price,
                            originProductNo: item.originProductNo
                          };
                          logger.info(`Found exact match in channelProducts: ${channelId}`);
                          break;
                        }
                      }
                    }
                    
                    if (naverProduct) break;
                  }
                  
                  // 정확한 매칭이 없으면 SKU로 찾기
                  if (!naverProduct) {
                    for (const item of searchResults.contents) {
                      if (item.sellerManagementCode === mapping.sku) {
                        naverProduct = item;
                        logger.info(`Found match by SKU: ${mapping.sku}`);
                        break;
                      }
                    }
                  }
                  
                  if (naverProduct) {
                    naverPrice = naverProduct.salePrice || naverProduct.price || 0;
                    logger.info(`Naver real-time price for ${mapping.sku}: ${naverPrice}원 (Product: ${naverProduct.name}, ID: ${naverProduct.id})`);
                  } else {
                    logger.warn(`No matching Naver product found for ${mapping.sku} with ID ${mapping.naverProductId}`);
                  }
                } else if (mapping.naverProductId) {
                  // fallback to getProductById if available
                  const naverProduct = await naverService.getProductById(mapping.naverProductId);
                  naverPrice = naverProduct?.salePrice || naverProduct?.price || 0;
                  logger.info(`Naver real-time price for ${mapping.sku}: ${naverPrice}원`);
                }
              } catch (naverError: any) {
                logger.error(`Error fetching Naver price for ${mapping.sku}: ${naverError.message}`);
              }
            }
            
            // Shopify 실시간 가격 조회
            const shopifyInventoryService = (this as any).shopifyInventoryService;
            if (shopifyInventoryService && mapping.sku) {
              try {
                // GraphQL로 SKU 검색해서 가격 정보 가져오기
                const gqlQuery = `
                  query getVariantBySku($sku: String!) {
                    productVariants(first: 1, query: $sku) {
                      edges {
                        node {
                          id
                          sku
                          price
                          product {
                            title
                          }
                        }
                      }
                    }
                  }
                `;
                
                if (shopifyInventoryService.client) {
                  const response = await shopifyInventoryService.client.post({
                    path: 'graphql',
                    data: {
                      query: gqlQuery,
                      variables: { sku: `sku:${mapping.sku}` }
                    }
                  });
                  
                  if (response?.body?.data?.productVariants?.edges?.length > 0) {
                    const variant = response.body.data.productVariants.edges[0].node;
                    shopifyPrice = parseFloat(variant.price || '0');
                    logger.info(`Shopify real-time price for ${mapping.sku}: $${shopifyPrice}`);
                  }
                } else {
                  // Mock 모드
                  shopifyPrice = 15.99;
                  logger.debug(`Mock Shopify price for ${mapping.sku}: $${shopifyPrice}`);
                }
              } catch (shopifyError: any) {
                logger.error(`Error fetching Shopify price for ${mapping.sku}: ${shopifyError.message}`);
              }
            }
            
            // DB 업데이트 - 실시간 가격이 있으면 무조건 업데이트
            if (naverPrice > 0 || shopifyPrice > 0) {
              const updateData: any = {
                'pricing.naver.lastUpdated': new Date(),
                'pricing.shopify.lastUpdated': new Date()
              };
              
              if (naverPrice > 0) {
                updateData['pricing.naver.regular'] = naverPrice;
                updateData['pricing.naver.sale'] = naverPrice;
              }
              
              if (shopifyPrice > 0) {
                updateData['pricing.shopify.regular'] = shopifyPrice;
                updateData['pricing.shopify.sale'] = shopifyPrice;
              }
              
              await ProductMapping.findByIdAndUpdate(mapping._id, { $set: updateData });
              logger.info(`Updated prices in DB for ${mapping.sku} - Naver: ${naverPrice}, Shopify: ${shopifyPrice}`);
            }
          } catch (error: any) {
            logger.error(`Error fetching real-time prices for ${mapping.sku}: ${error?.message || 'Unknown error'}`);
            // 오류 시 DB 값 사용
            naverPrice = mapping.pricing?.naver?.regular || mapping.pricing?.naver?.sale || 0;
            shopifyPrice = mapping.pricing?.shopify?.regular || mapping.pricing?.shopify?.sale || 0;
          }
        } else {
          // DB 값 사용
          naverPrice = mapping.pricing?.naver?.regular || mapping.pricing?.naver?.sale || 0;
          shopifyPrice = mapping.pricing?.shopify?.regular || mapping.pricing?.shopify?.sale || 0;
        }
        
        // 마진율 계산: ((쇼피파이 가격 - 네이버 가격) / 네이버 가격) * 100
        // 환율 적용: 쇼피파이 가격(USD)를 원화로 변환
        const exchangeRate = 1330; // 기본 환율 (실제로는 환율 서비스에서 가져와야 함)
        const shopifyPriceKRW = shopifyPrice * exchangeRate;
        
        let calculatedMargin = 0;
        if (naverPrice > 0) {
          calculatedMargin = ((shopifyPriceKRW - naverPrice) / naverPrice) * 100;
        }
        
        return {
          id: mapping._id,
          sku: mapping.sku,
          productName: mapping.productName || 'Unknown Product',
          naverPrice,
          shopifyPrice,
          margin: Math.round(calculatedMargin * 100) / 100, // 소수점 2자리까지
          lastUpdated: new Date(),
          status: mapping.status || 'active',
          isRealtime: realtime === 'true'
        };
      });

      const priceData = await Promise.all(priceDataPromises);

      res.json({
        success: true,
        data: priceData,
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          totalPages: Math.ceil(total / Number(limit)),
        },
      });
    }
  );

  /**
   * 특정 SKU 현재 가격 조회
   * GET /api/v1/prices/current/:sku
   */
  getCurrentPrice = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const { sku } = req.params;

      const mapping = await ProductMapping.findOne({ sku }).lean();

      if (!mapping) {
        throw new AppError('Product not found', 404);
      }

      res.json({
        success: true,
        data: {
          sku: mapping.sku,
          productName: mapping.name || 'Unknown Product',
          naverPrice: mapping.last_naver_price || 0,
          shopifyPrice: mapping.last_shopify_price || 0,
          margin: mapping.margin || 15,
          lastUpdated: mapping.last_price_update || mapping.updatedAt,
          priceHistory: await this.getRecentPriceHistory(sku, 10),
        },
      });
    }
  );

  /**
   * 가격 업데이트
   * POST /api/v1/prices/update
   */
  updatePrice = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const { sku, shopifyPrice, reason } = req.body;

      if (!sku || typeof shopifyPrice !== 'number') {
        throw new AppError('SKU and price are required', 400);
      }

      const mapping = await ProductMapping.findOne({ sku });
      if (!mapping) {
        throw new AppError('Product not found', 404);
      }

      // 가격 이력 저장
      const priceHistory = await PriceHistory.create({
        sku,
        productName: mapping.name,
        platform: 'shopify',
        oldPrice: mapping.last_shopify_price || 0,
        newPrice: shopifyPrice,
        changeReason: reason || 'Manual update',
        changedBy: (req as any).user?.id || 'system',
        metadata: {
          margin: mapping.margin,
          exchangeRate: await this.getCurrentExchangeRate(),
        },
      });

      // 매핑 업데이트
      mapping.last_shopify_price = shopifyPrice;
      mapping.last_price_update = new Date();
      await mapping.save();

      // 캐시 무효화
      const redis = getRedisClient();
      await redis.del(`price:${sku}`);

      logger.info(`Price updated for SKU ${sku}: ${shopifyPrice}`, {
        userId: (req as any).user?.id,
        reason,
      });

      res.json({
        success: true,
        message: 'Price updated successfully',
        data: priceHistory,
      });
    }
  );

  /**
   * 일괄 가격 업데이트
   * POST /api/v1/prices/bulk-update
   */
  bulkUpdatePrices = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const { skus, marginPercent, fixedMargin, applyToAll } = req.body;

      let query: any = { isActive: true };

      if (!applyToAll && skus && skus.length > 0) {
        query.sku = { $in: skus };
      }

      const mappings = await ProductMapping.find(query);

      if (mappings.length === 0) {
        throw new AppError('No products found', 404);
      }

      const exchangeRate = await this.getCurrentExchangeRate();
      const results = [];
      const errors = [];

      // 배치 처리
      const batchSize = 10;
      for (let i = 0; i < mappings.length; i += batchSize) {
        const batch = mappings.slice(i, i + batchSize);

        await Promise.all(
          batch.map(async (mapping) => {
            try {
              const newMargin =
                marginPercent || fixedMargin || mapping.margin || 15;
              const newShopifyPrice =
                (mapping.last_naver_price || 0) *
                exchangeRate *
                (1 + newMargin / 100);

              // 가격 이력 저장
              await PriceHistory.create({
                sku: mapping.sku,
                productName: mapping.name,
                platform: 'shopify',
                oldPrice: mapping.last_shopify_price || 0,
                newPrice: newShopifyPrice,
                changeReason: 'Bulk margin update',
                changedBy: (req as any).user?.id || 'system',
                metadata: {
                  margin: newMargin,
                  exchangeRate,
                },
              });

              // 매핑 업데이트
              mapping.last_shopify_price = newShopifyPrice;
              mapping.margin = newMargin;
              mapping.last_price_update = new Date();
              await mapping.save();

              results.push({
                sku: mapping.sku,
                success: true,
                newPrice: newShopifyPrice.toFixed(2),
                margin: newMargin,
              });
            } catch (error: any) {
              errors.push({
                sku: mapping.sku,
                error: error.message,
              });
            }
          })
        );
      }

      // 캐시 무효화
      const redis = getRedisClient();
      await redis.del('prices:*');

      logger.info(
        `Bulk price update completed: ${results.length} success, ${errors.length} failed`,
        {
          userId: (req as any).user?.id,
          marginPercent,
          totalProcessed: mappings.length,
        }
      );

      res.json({
        success: true,
        message: 'Bulk price update completed',
        summary: {
          total: mappings.length,
          success: results.length,
          failed: errors.length,
        },
        results,
        errors: errors.length > 0 ? errors : undefined,
      });
    }
  );

  /**
   * 가격 계산 시뮬레이션
   * POST /api/v1/prices/simulate
   */
  simulatePriceCalculation = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const { naverPrice, exchangeRate, marginPercent = 15 } = req.body;

      if (!naverPrice || naverPrice <= 0) {
        throw new AppError('Valid Naver price is required', 400);
      }

      const currentExchangeRate =
        exchangeRate || (await this.getCurrentExchangeRate());
      const calculatedPrice = naverPrice * currentExchangeRate;
      const finalPrice = calculatedPrice * (1 + marginPercent / 100);

      res.json({
        success: true,
        data: {
          input: {
            naverPrice,
            exchangeRate: currentExchangeRate,
            marginPercent,
          },
          calculation: {
            step1: `${naverPrice} KRW × ${currentExchangeRate} = $${calculatedPrice.toFixed(2)}`,
            step2: `$${calculatedPrice.toFixed(2)} × ${1 + marginPercent / 100} = $${finalPrice.toFixed(2)}`,
          },
          output: {
            calculatedPrice: calculatedPrice.toFixed(2),
            finalPrice: finalPrice.toFixed(2),
            roundedPrice: Math.round(finalPrice * 100) / 100,
          },
        },
      });
    }
  );

  /**
   * 가격 규칙 설정
   * POST /api/v1/prices/rules
   */
  setPricingRules = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const redis = getRedisClient();
      const rules = {
        defaultMargin: req.body.defaultMargin || 15,
        minMargin: req.body.minMargin || 5,
        maxMargin: req.body.maxMargin || 50,
        roundingRule: req.body.roundingRule || 'nearest',
        roundingDigits: req.body.roundingDigits || 2,
        autoUpdate: req.body.autoUpdate || false,
        updateInterval: req.body.updateInterval || 6, // hours
        ...req.body,
      };

      // 유효성 검사
      if (
        rules.defaultMargin < rules.minMargin ||
        rules.defaultMargin > rules.maxMargin
      ) {
        throw new AppError(
          'Default margin must be between min and max margin',
          400
        );
      }

      await redis.set('pricing:rules', JSON.stringify(rules));

      logger.info('Pricing rules updated', {
        userId: (req as any).user?.id,
        rules,
      });

      res.json({
        success: true,
        message: 'Pricing rules updated successfully',
        data: rules,
      });
    }
  );

  /**
   * 가격 규칙 조회
   * GET /api/v1/prices/rules
   */
  getPricingRules = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const redis = getRedisClient();
      const rulesStr = await redis.get('pricing:rules');

      const rules = rulesStr
        ? JSON.parse(rulesStr)
        : {
            defaultMargin: 15,
            minMargin: 5,
            maxMargin: 50,
            roundingRule: 'nearest',
            roundingDigits: 2,
            autoUpdate: false,
            updateInterval: 6,
          };

      res.json({
        success: true,
        data: rules,
      });
    }
  );

  /**
   * Get exchange rate
   * GET /api/v1/prices/exchange-rate
   */
  getExchangeRate = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const rate = await this.getCurrentExchangeRate();
      
      res.json({
        success: true,
        rate: 1 / rate, // Convert to KRW per USD
        krwPerUsd: 1 / rate,
        usdPerKrw: rate,
        source: 'cached',
        change: 0,
        changePercent: 0,
        updatedAt: new Date(),
      });
    }
  );

  /**
   * Private Helper Methods
   */
  private async getCurrentExchangeRate(): Promise<number> {
    const redis = getRedisClient();
    const cached = await redis.get('exchange_rate:KRW:USD');

    if (cached) {
      return parseFloat(cached);
    }

    const latestRate = await ExchangeRate.findOne({ isActive: true })
      .sort({ createdAt: -1 })
      .lean();

    const rate = latestRate?.rate ? 1 / latestRate.rate : 0.00075;
    await redis.setex('exchange_rate:KRW:USD', 3600, rate.toString());

    return rate;
  }

  private getPriceStatus(mapping: any): string {
    if (!mapping.last_price_update) return 'outdated';

    const hoursSinceUpdate =
      (Date.now() - new Date(mapping.last_price_update).getTime()) /
      (1000 * 60 * 60);

    if (hoursSinceUpdate < 24) return 'current';
    if (hoursSinceUpdate < 72) return 'recent';
    return 'outdated';
  }

  private async getRecentPriceHistory(
    sku: string,
    limit: number = 10
  ): Promise<any[]> {
    return PriceHistory.find({ sku })
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('platform oldPrice newPrice changeReason createdAt')
      .lean();
  }

  /**
   * 가격 불일치 조회
   * GET /api/v1/prices/discrepancies
   */
  getPriceDiscrepanciesMethod = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const { threshold = 5, page = 1, limit = 20 } = req.query;

      const mappings = await ProductMapping.find({ isActive: true }).lean();
      const discrepancies = [];

      for (const mapping of mappings) {
        if (mapping.last_naver_price && mapping.last_shopify_price) {
          const expectedPrice = mapping.last_naver_price * (await this.getCurrentExchangeRate()) * (1 + (mapping.margin || 15) / 100);
          const diff = Math.abs(mapping.last_shopify_price - expectedPrice);
          const diffPercent = (diff / expectedPrice) * 100;

          if (diffPercent > Number(threshold)) {
            discrepancies.push({
              sku: mapping.sku,
              productName: mapping.name || 'Unknown',
              naverPrice: mapping.last_naver_price,
              shopifyPrice: mapping.last_shopify_price,
              expectedPrice: expectedPrice.toFixed(2),
              difference: diff.toFixed(2),
              differencePercent: diffPercent.toFixed(2),
            });
          }
        }
      }

      const skip = (Number(page) - 1) * Number(limit);
      const paginatedDiscrepancies = discrepancies.slice(skip, skip + Number(limit));

      res.json({
        success: true,
        data: paginatedDiscrepancies,
        pagination: {
          total: discrepancies.length,
          page: Number(page),
          limit: Number(limit),
          totalPages: Math.ceil(discrepancies.length / Number(limit)),
        },
      });
    }
  );

  /**
   * 마진 정보 조회
   * GET /api/v1/prices/margins
   */
  getMarginsMethod = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const { page = 1, limit = 20 } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const [mappings, total] = await Promise.all([
        ProductMapping.find({ isActive: true })
          .skip(skip)
          .limit(Number(limit))
          .lean(),
        ProductMapping.countDocuments({ isActive: true }),
      ]);

      const marginData = mappings.map((mapping) => ({
        sku: mapping.sku,
        productName: mapping.name || 'Unknown',
        margin: mapping.margin || 15,
        naverPrice: mapping.last_naver_price || 0,
        shopifyPrice: mapping.last_shopify_price || 0,
        calculatedMargin: mapping.last_naver_price && mapping.last_shopify_price
          ? ((mapping.last_shopify_price / (mapping.last_naver_price * 0.00075) - 1) * 100).toFixed(2)
          : 0,
      }));

      res.json({
        success: true,
        data: marginData,
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          totalPages: Math.ceil(total / Number(limit)),
        },
      });
    }
  );

  /**
   * SKU별 가격 동기화
   * POST /api/v1/prices/sync/:sku
   */
  syncPriceBySkuMethod = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const { sku } = req.params;

      if (!this.priceSyncService) {
        throw new AppError('Price sync service not available', 503);
      }

      const result = await this.priceSyncService.syncSinglePrice(sku);

      res.json({
        success: true,
        message: `Price synced for SKU: ${sku}`,
        data: result,
      });
    }
  );
}
