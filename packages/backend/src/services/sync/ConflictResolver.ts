import { ProductMapping, InventoryTransaction, PriceHistory } from '../../models';
import { logger } from '../../utils/logger';
import{ Schema, model, Document } from 'mongoose';  
interface ConflictLog extends Document {
    type: 'inventory' | 'price';
    sku: string;
    conflict: any;
    resolution: any;
    strategy: string;
    resolvedAt: Date;
    resolvedBy: string;
}
const conflictLogSchema = new Schema<ConflictLog>({
  type: { type: String, required: true, enum: ['inventory', 'price'] },
  sku: { type: String, required: true },
  conflict: { type: Schema.Types.Mixed, required: true },
  resolution: { type: Schema.Types.Mixed, required: true },
  strategy: { type: String, required: true },
  resolvedAt: { type: Date, default: Date.now },
  resolvedBy: { type: String, default:'system', },} // 사용자 ID 또는 이름
, {
    timestamps: true,
    collection: 'conflict_logs',
});
const ConflictLogModel = model<ConflictLog>('ConflictLog', conflictLogSchema);

export interface ConflictResolution {
  type: 'inventory' | 'price';
  sku: string;
  conflict: any;
  resolution: any;
  strategy: string;
}

export class ConflictResolver {
  /**
   * 재고 충돌 해결
   */
  async resolveInventoryConflict(
    sku: string,
    naverQuantity: number,
    shopifyQuantity: number,
    lastSyncTime?: Date
  ): Promise<ConflictResolution> {
    logger.warn(`Inventory conflict detected for SKU ${sku}`, {
      naverQuantity,
      shopifyQuantity,
    });

    // 전략 1: 마지막 동기화 이후 트랜잭션 확인
    if (lastSyncTime) {
      const recentTransactions = await InventoryTransaction.find({
        sku,
        createdAt: { $gt: lastSyncTime },
      }).sort({ createdAt: -1 });

      if (recentTransactions.length > 0) {
        // 가장 최근 트랜잭션 기준으로 해결
        const latestTransaction = recentTransactions[0];
        
        return {
          type: 'inventory',
          sku,
          conflict: { naverQuantity, shopifyQuantity },
          resolution: {
            finalQuantity: latestTransaction.newQuantity,
            source: latestTransaction.platform,
          },
          strategy: 'latest_transaction',
        };
      }
    }

    // 전략 2: 더 적은 수량 채택 (보수적 접근)
    const minQuantity = Math.min(naverQuantity, shopifyQuantity);
    
    return {
      type: 'inventory',
      sku,
      conflict: { naverQuantity, shopifyQuantity },
      resolution: {
        finalQuantity: minQuantity,
        source: 'minimum',
      },
      strategy: 'conservative_minimum',
    };
  }

  /**
   * 가격 충돌 해결
   */
  async resolvePriceConflict(
    sku: string,
    naverPrice: number,
    shopifyPrice: number,
    exchangeRate: number
  ): Promise<ConflictResolution> {
    logger.warn(`Price conflict detected for SKU ${sku}`, {
      naverPrice,
      shopifyPrice,
    });

    const mapping = await ProductMapping.findOne({ sku }).lean();
    if (!mapping) {
      throw new Error(`Mapping not found for SKU: ${sku}`);
    }

    // 예상 Shopify 가격 계산
    const expectedShopifyPrice = (naverPrice / exchangeRate) * mapping.priceMargin;
    const priceDifference = Math.abs(shopifyPrice - expectedShopifyPrice);
    const differencePercentage = (priceDifference / expectedShopifyPrice) * 100;

    // 전략 1: 5% 미만 차이는 무시
    if (differencePercentage < 5) {
      return {
        type: 'price',
        sku,
        conflict: { naverPrice, shopifyPrice, expectedShopifyPrice },
        resolution: {
          action: 'ignore',
          reason: 'difference_within_threshold',
        },
        strategy: 'threshold_based',
      };
    }

    // 전략 2: 수동 오버라이드 확인
    const recentManualUpdate = await PriceHistory.findOne({
      sku,
      'metadata.manualOverride': true,
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // 24시간 이내
    }).sort({ createdAt: -1 });

    if (recentManualUpdate) {
      return {
        type: 'price',
        sku,
        conflict: { naverPrice, shopifyPrice, expectedShopifyPrice },
        resolution: {
          action: 'keep_manual',
          finalPrice: recentManualUpdate.finalShopifyPrice,
          reason: 'recent_manual_override',
        },
        strategy: 'manual_override',
      };
    }

    // 전략 3: 네이버 가격 기준으로 재계산
    return {
      type: 'price',
      sku,
      conflict: { naverPrice, shopifyPrice, expectedShopifyPrice },
      resolution: {
        action: 'recalculate',
        finalPrice: Math.round(expectedShopifyPrice * 100) / 100,
        source: 'naver',
      },
      strategy: 'naver_as_source',
    };
  }

  /**
   * 일괄 충돌 해결
   */
  async resolveBulkConflicts(
    conflicts: Array<{
      sku: string;
      type: 'inventory' | 'price';
      data: any;
    }>
  ): Promise<ConflictResolution[]> {
    const resolutions: ConflictResolution[] = [];

    for (const conflict of conflicts) {
      try {
        let resolution: ConflictResolution;

        if (conflict.type === 'inventory') {
          resolution = await this.resolveInventoryConflict(
            conflict.sku,
            conflict.data.naverQuantity,
            conflict.data.shopifyQuantity,
            conflict.data.lastSyncTime
          );
        } else {
          resolution = await this.resolvePriceConflict(
            conflict.sku,
            conflict.data.naverPrice,
            conflict.data.shopifyPrice,
            conflict.data.exchangeRate
          );
        }

        resolutions.push(resolution);
      } catch (error) {
        logger.error(`Failed to resolve conflict for SKU ${conflict.sku}:`, error);
      }
    }

    return resolutions;
  }

  /**
   * 충돌 로그 저장
   */
  async logConflictResolution(resolution: ConflictResolution): Promise<void> {
    try{
        await ConflictLog.create({
        type: resolution.type,
        sku: resolution.sku,
        conflict: resolution.conflict,
        resolution: resolution.resolution,
        strategy: resolution.strategy,
        resolvedAt: new Date(),
        resolvedBy: 'system', // 또는 현재 사용자 ID
      });  
    } catch (error) {
      logger.error(`Failed to log conflict resolution for SKU ${resolution.sku}:`, error);
    }
    // TODO: 충돌 해결 로그를 별도 컬렉션에 저장
    logger.info('Conflict resolved:', resolution);
  }
}

async function getConflictHistory(
    sku?: string,
    type?: 'inventory' | 'price',
    limit: number = 100
): Promise<ConflictLog[]> {
  const query: any = {};
  if (sku) query.sku = sku;
  if (type) query.type = type;

  return ConflictLog.find(query)
    .sort({ resolvedAt: -1 })
    .limit(limit)
    .lean();
}

