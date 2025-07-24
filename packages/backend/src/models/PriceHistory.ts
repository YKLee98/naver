// packages/backend/src/models/PriceHistory.ts
import { Schema, model, Document } from 'mongoose';

export interface IPriceHistory extends Document {
  sku: string;
  platform: 'naver' | 'shopify';
  oldPrice: number;
  newPrice: number;
  currency: string;
  reason: string;
  changePercent: number;
  metadata?: {
    naverPrice?: number;
    exchangeRate?: number;
    marginRate?: number;
    appliedRules?: string[];
    warnings?: string[];
  };
  syncJobId?: string;
  createdBy: string;
  createdAt: Date;
}

const PriceHistorySchema = new Schema<IPriceHistory>({
  sku: {
    type: String,
    required: true,
    index: true
  },
  platform: {
    type: String,
    required: true,
    enum: ['naver', 'shopify']
  },
  oldPrice: {
    type: Number,
    required: true
  },
  newPrice: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    required: true,
    default: 'USD'
  },
  reason: {
    type: String,
    required: true
  },
  changePercent: {
    type: Number,
    required: true
  },
  metadata: {
    naverPrice: Number,
    exchangeRate: Number,
    marginRate: Number,
    appliedRules: [String],
    warnings: [String]
  },
  syncJobId: {
    type: String,
    index: true
  },
  createdBy: {
    type: String,
    required: true
  }
}, {
  timestamps: { createdAt: true, updatedAt: false }
});

// 인덱스
PriceHistorySchema.index({ sku: 1, createdAt: -1 });
PriceHistorySchema.index({ platform: 1, createdAt: -1 });
PriceHistorySchema.index({ syncJobId: 1 });

// TTL 인덱스 (90일 후 자동 삭제)
PriceHistorySchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 });

// 가상 필드
PriceHistorySchema.virtual('priceChange').get(function() {
  return this.newPrice - this.oldPrice;
});

export const PriceHistory = model<IPriceHistory>('PriceHistory', PriceHistorySchema);
