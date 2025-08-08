// packages/backend/src/controllers/PriceController.ts
import { Request, Response, NextFunction } from 'express';
import { PriceHistory, ExchangeRate, ProductMapping } from '../models';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../middlewares/error.middleware';
import { getRedisClient } from '../config/redis';
import { logger } from '../utils/logger';

export class PriceController {
  /**
   * 가격 이력 조회
   * GET /api/v1/prices/history
   */
  getPriceHistory = asyncHandler(async (
    req: Request,
    res: Response
  ): Promise<void> => {
    const {
      sku,
      startDate,
      endDate,
      page = 1,
      limit = 20
    } = req.query;

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
      PriceHistory.countDocuments(query)
    ]);

    // 데이터 포맷팅
    const formattedData = data.map(item => ({
      id: item._id,
      sku: item.sku,
      productName: item.productName || 'Unknown Product',
      platform: item.platform,
      oldPrice: item.oldPrice,
      newPrice: item.newPrice,
      changePercent: item.oldPrice ? 
        ((item.newPrice - item.oldPrice) / item.oldPrice * 100).toFixed(2) : 0,
      changeReason: item.changeReason,
      changedBy: item.changedBy,
      createdAt: item.createdAt
    }));

    res.json({
      success: true,
      data: formattedData,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit))
      }
    });
  });

  /**
   * 현재 가격 목록 조회
   * GET /api/v1/prices/current
   */
  getCurrentPrices = asyncHandler(async (
    req: Request,
    res: Response
  ): Promise<void> => {
    const { page = 1, limit = 20, search } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const query: any = { isActive: true };
    
    if (search) {
      query.$or = [
        { sku: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } }
      ];
    }

    const [mappings, total] = await Promise.all([
      ProductMapping.find(query)
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      ProductMapping.countDocuments(query)
    ]);

    const priceData = mappings.map(mapping => ({
      id: mapping._id,
      sku: mapping.sku,
      productName: mapping.name || 'Unknown Product',
      naverPrice: mapping.last_naver_price || 0,
      shopifyPrice: mapping.last_shopify_price || 0,
      margin: mapping.margin || 15,
      lastUpdated: mapping.last_price_update || mapping.updatedAt,
      status: this.getPriceStatus(mapping)
    }));

    res.json({
      success: true,
      data: priceData,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit))
      }
    });
  });

  /**
   * 특정 SKU 현재 가격 조회
   * GET /api/v1/prices/current/:sku
   */
  getCurrentPrice = asyncHandler(async (
    req: Request,
    res: Response
  ): Promise<void> => {
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
        priceHistory: await this.getRecentPriceHistory(sku, 10)
      }
    });
  });

  /**
   * 가격 업데이트
   * POST /api/v1/prices/update
   */
  updatePrice = asyncHandler(async (
    req: Request,
    res: Response
  ): Promise<void> => {
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
        exchangeRate: await this.getCurrentExchangeRate()
      }
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
      reason
    });

    res.json({
      success: true,
      message: 'Price updated successfully',
      data: priceHistory
    });
  });

  /**
   * 일괄 가격 업데이트
   * POST /api/v1/prices/bulk-update
   */
  bulkUpdatePrices = asyncHandler(async (
    req: Request,
    res: Response
  ): Promise<void> => {
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
      
      await Promise.all(batch.map(async (mapping) => {
        try {
          const newMargin = marginPercent || fixedMargin || mapping.margin || 15;
          const newShopifyPrice = (mapping.last_naver_price || 0) * exchangeRate * (1 + newMargin / 100);
          
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
              exchangeRate
            }
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
            margin: newMargin
          });
        } catch (error: any) {
          errors.push({
            sku: mapping.sku,
            error: error.message
          });
        }
      }));
    }

    // 캐시 무효화
    const redis = getRedisClient();
    await redis.del('prices:*');

    logger.info(`Bulk price update completed: ${results.length} success, ${errors.length} failed`, {
      userId: (req as any).user?.id,
      marginPercent,
      totalProcessed: mappings.length
    });

    res.json({
      success: true,
      message: 'Bulk price update completed',
      summary: {
        total: mappings.length,
        success: results.length,
        failed: errors.length
      },
      results,
      errors: errors.length > 0 ? errors : undefined
    });
  });

  /**
   * 가격 계산 시뮬레이션
   * POST /api/v1/prices/simulate
   */
  simulatePriceCalculation = asyncHandler(async (
    req: Request,
    res: Response
  ): Promise<void> => {
    const { naverPrice, exchangeRate, marginPercent = 15 } = req.body;

    if (!naverPrice || naverPrice <= 0) {
      throw new AppError('Valid Naver price is required', 400);
    }

    const currentExchangeRate = exchangeRate || await this.getCurrentExchangeRate();
    const calculatedPrice = naverPrice * currentExchangeRate;
    const finalPrice = calculatedPrice * (1 + marginPercent / 100);

    res.json({
      success: true,
      data: {
        input: {
          naverPrice,
          exchangeRate: currentExchangeRate,
          marginPercent
        },
        calculation: {
          step1: `${naverPrice} KRW × ${currentExchangeRate} = $${calculatedPrice.toFixed(2)}`,
          step2: `$${calculatedPrice.toFixed(2)} × ${(1 + marginPercent / 100)} = $${finalPrice.toFixed(2)}`
        },
        output: {
          calculatedPrice: calculatedPrice.toFixed(2),
          finalPrice: finalPrice.toFixed(2),
          roundedPrice: Math.round(finalPrice * 100) / 100
        }
      }
    });
  });

  /**
   * 가격 규칙 설정
   * POST /api/v1/prices/rules
   */
  setPricingRules = asyncHandler(async (
    req: Request,
    res: Response
  ): Promise<void> => {
    const redis = getRedisClient();
    const rules = {
      defaultMargin: req.body.defaultMargin || 15,
      minMargin: req.body.minMargin || 5,
      maxMargin: req.body.maxMargin || 50,
      roundingRule: req.body.roundingRule || 'nearest',
      roundingDigits: req.body.roundingDigits || 2,
      autoUpdate: req.body.autoUpdate || false,
      updateInterval: req.body.updateInterval || 6, // hours
      ...req.body
    };

    // 유효성 검사
    if (rules.defaultMargin < rules.minMargin || rules.defaultMargin > rules.maxMargin) {
      throw new AppError('Default margin must be between min and max margin', 400);
    }

    await redis.set('pricing:rules', JSON.stringify(rules));

    logger.info('Pricing rules updated', {
      userId: (req as any).user?.id,
      rules
    });

    res.json({
      success: true,
      message: 'Pricing rules updated successfully',
      data: rules
    });
  });

  /**
   * 가격 규칙 조회
   * GET /api/v1/prices/rules
   */
  getPricingRules = asyncHandler(async (
    req: Request,
    res: Response
  ): Promise<void> => {
    const redis = getRedisClient();
    const rulesStr = await redis.get('pricing:rules');
    
    const rules = rulesStr ? JSON.parse(rulesStr) : {
      defaultMargin: 15,
      minMargin: 5,
      maxMargin: 50,
      roundingRule: 'nearest',
      roundingDigits: 2,
      autoUpdate: false,
      updateInterval: 6
    };

    res.json({
      success: true,
      data: rules
    });
  });

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

    const rate = latestRate?.rate ? (1 / latestRate.rate) : 0.00075;
    await redis.setex('exchange_rate:KRW:USD', 3600, rate.toString());
    
    return rate;
  }

  private getPriceStatus(mapping: any): string {
    if (!mapping.last_price_update) return 'outdated';
    
    const hoursSinceUpdate = (Date.now() - new Date(mapping.last_price_update).getTime()) / (1000 * 60 * 60);
    
    if (hoursSinceUpdate < 24) return 'current';
    if (hoursSinceUpdate < 72) return 'recent';
    return 'outdated';
  }

  private async getRecentPriceHistory(sku: string, limit: number = 10): Promise<any[]> {
    return PriceHistory.find({ sku })
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('platform oldPrice newPrice changeReason createdAt')
      .lean();
  }
}