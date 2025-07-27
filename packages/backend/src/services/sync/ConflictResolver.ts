// packages/backend/src/services/sync/ConflictResolver.ts
import { ProductMapping, InventoryTransaction, PriceHistory } from '../../models';
import { logger } from '../../utils/logger';
import { Schema, model, Document } from 'mongoose';

interface IConflictLog extends Document {
  type: 'inventory' | 'price' | 'order';
  sku: string;
  conflict: any;
  resolution: any;
  strategy: string;
  resolved: boolean;
  resolvedAt?: Date;
  resolvedBy: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const ConflictLogSchema = new Schema<IConflictLog>({
  type: { 
    type: String, 
    required: true, 
    enum: ['inventory', 'price', 'order'],
    index: true 
  },
  sku: { 
    type: String, 
    required: true,
    index: true 
  },
  conflict: { 
    type: Schema.Types.Mixed, 
    required: true 
  },
  resolution: { 
    type: Schema.Types.Mixed, 
    required: true 
  },
  strategy: { 
    type: String, 
    required: true 
  },
  resolved: {
    type: Boolean,
    default: false,
    index: true
  },
  resolvedAt: { 
    type: Date,
    index: true 
  },
  resolvedBy: { 
    type: String, 
    default: 'system',
    required: true
  },
  metadata: {
    type: Map,
    of: Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true,
  collection: 'conflict_logs',
});

// 복합 인덱스
ConflictLogSchema.index({ type: 1, resolved: 1, createdAt: -1 });
ConflictLogSchema.index({ sku: 1, type: 1, createdAt: -1 });

const ConflictLog = model<IConflictLog>('ConflictLog', ConflictLogSchema);

export interface ConflictResolution {
  type: 'inventory' | 'price' | 'order';
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
        
        const resolution = {
          type: 'inventory' as const,
          sku,
          conflict: { naverQuantity, shopifyQuantity },
          resolution: {
            finalQuantity: latestTransaction.newQuantity,
            source: latestTransaction.platform,
          },
          strategy: 'latest_transaction',
        };

        await this.logConflict(resolution);
        return resolution;
      }
    }

    // 전략 2: 더 적은 수량 채택 (보수적 접근)
    const minQuantity = Math.min(naverQuantity, shopifyQuantity);
    
    const resolution = {
      type: 'inventory' as const,
      sku,
      conflict: { naverQuantity, shopifyQuantity },
      resolution: {
        finalQuantity: minQuantity,
        source: 'minimum',
      },
      strategy: 'conservative_minimum',
    };

    await this.logConflict(resolution);
    return resolution;
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
    const expectedShopifyPrice = naverPrice * exchangeRate * mapping.priceMargin;
    const priceDifference = Math.abs(shopifyPrice - expectedShopifyPrice);
    const differencePercentage = (priceDifference / expectedShopifyPrice) * 100;

    // 전략 1: 5% 이내 차이는 무시
    if (differencePercentage <= 5) {
      const resolution = {
        type: 'price' as const,
        sku,
        conflict: { naverPrice, shopifyPrice, expectedShopifyPrice },
        resolution: {
          finalPrice: shopifyPrice,
          action: 'keep_current',
        },
        strategy: 'tolerance_5_percent',
      };

      await this.logConflict(resolution);
      return resolution;
    }

    // 전략 2: 최근 가격 이력 확인
    const recentPriceHistory = await PriceHistory.find({ sku })
      .sort({ createdAt: -1 })
      .limit(5);

    if (recentPriceHistory.length > 0) {
      const avgRecentPrice = recentPriceHistory.reduce((sum, h) => sum + h.newPrice, 0) 
        / recentPriceHistory.length;
      
      // 평균 가격과의 차이가 10% 이내면 평균값 사용
      if (Math.abs(avgRecentPrice - expectedShopifyPrice) / avgRecentPrice <= 0.1) {
        const resolution = {
          type: 'price' as const,
          sku,
          conflict: { naverPrice, shopifyPrice, expectedShopifyPrice },
          resolution: {
            finalPrice: avgRecentPrice,
            action: 'use_average',
          },
          strategy: 'historical_average',
        };

        await this.logConflict(resolution);
        return resolution;
      }
    }

    // 전략 3: 네이버 가격 기준으로 재계산
    const resolution = {
      type: 'price' as const,
      sku,
      conflict: { naverPrice, shopifyPrice, expectedShopifyPrice },
      resolution: {
        finalPrice: expectedShopifyPrice,
        action: 'recalculate',
      },
      strategy: 'naver_based_calculation',
    };

    await this.logConflict(resolution);
    return resolution;
  }

  /**
   * 주문 충돌 해결
   */
  async resolveOrderConflict(
    orderId: string,
    naverStatus: string,
    shopifyStatus: string
  ): Promise<ConflictResolution> {
    logger.warn(`Order status conflict detected for order ${orderId}`, {
      naverStatus,
      shopifyStatus,
    });

    // 상태 우선순위 매핑
    const statusPriority: Record<string, number> = {
      'CANCELED': 10,
      'RETURNED': 9,
      'EXCHANGED': 8,
      'DELIVERED': 7,
      'SHIPPING': 6,
      'PAYED': 5,
      'PENDING': 4,
    };

    const naverPriority = statusPriority[naverStatus] || 0;
    const shopifyPriority = statusPriority[shopifyStatus] || 0;

    // 더 높은 우선순위 상태 채택
    const finalStatus = naverPriority > shopifyPriority ? naverStatus : shopifyStatus;
    const source = naverPriority > shopifyPriority ? 'naver' : 'shopify';

    const resolution = {
      type: 'order' as const,
      sku: orderId, // orderId를 sku 필드에 저장
      conflict: { naverStatus, shopifyStatus },
      resolution: {
        finalStatus,
        source,
      },
      strategy: 'status_priority',
    };

    await this.logConflict(resolution);
    return resolution;
  }

  /**
   * 충돌 로그 저장
   */
  private async logConflict(resolution: ConflictResolution): Promise<void> {
    try {
      await ConflictLog.create({
        type: resolution.type,
        sku: resolution.sku,
        conflict: resolution.conflict,
        resolution: resolution.resolution,
        strategy: resolution.strategy,
        resolved: true,
        resolvedAt: new Date(),
        resolvedBy: 'system',
        metadata: {
          timestamp: new Date().toISOString(),
        }
      });
    } catch (error) {
      logger.error('Failed to log conflict resolution:', error);
    }
  }

  /**
   * 미해결 충돌 조회
   */
  async getUnresolvedConflicts(type?: 'inventory' | 'price' | 'order'): Promise<IConflictLog[]> {
    const query: any = { resolved: false };
    
    if (type) {
      query.type = type;
    }

    return ConflictLog.find(query)
      .sort({ createdAt: -1 })
      .limit(100);
  }

  /**
   * 충돌 수동 해결
   */
  async markConflictResolved(
    conflictId: string, 
    resolvedBy: string,
    resolution?: any
  ): Promise<void> {
    await ConflictLog.findByIdAndUpdate(conflictId, {
      resolved: true,
      resolvedAt: new Date(),
      resolvedBy,
      ...(resolution && { resolution }),
    });
  }

  /**
   * 충돌 통계 조회
   */
  async getConflictStats(days: number = 7): Promise<any> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const stats = await ConflictLog.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            type: '$type',
            strategy: '$strategy',
            resolved: '$resolved'
          },
          count: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: '$_id.type',
          strategies: {
            $push: {
              strategy: '$_id.strategy',
              resolved: '$_id.resolved',
              count: '$count'
            }
          },
          total: { $sum: '$count' }
        }
      }
    ]);

    return stats;
  }
}