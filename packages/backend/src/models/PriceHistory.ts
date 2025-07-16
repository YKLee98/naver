// packages/backend/src/models/PriceHistory.ts
import { Schema, model, Document } from 'mongoose';

export interface IPriceHistory extends Document {
  sku: string;
  naverPrice: number;
  exchangeRate: number;
  calculatedShopifyPrice: number;
  finalShopifyPrice: number;
  priceMargin: number;
  currency: string;
  syncStatus: 'pending' | 'completed' | 'failed';
  syncedAt?: Date;
  errorMessage?: string;
  metadata: {
    manualOverride?: boolean;
    overrideReason?: string;
    originalPrice?: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

const PriceHistorySchema = new Schema<IPriceHistory>(
  {
    sku: {
      type: String,
      required: true,
      index: true,
    },
    naverPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    exchangeRate: {
      type: Number,
      required: true,
      min: 0,
    },
    calculatedShopifyPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    finalShopifyPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    priceMargin: {
      type: Number,
      required: true,
      default: 1.15,
    },
    currency: {
      type: String,
      required: true,
      default: 'USD',
    },
    syncStatus: {
      type: String,
      required: true,
      enum: ['pending', 'completed', 'failed'],
      default: 'pending',
      index: true,
    },
    syncedAt: Date,
    errorMessage: String,
    metadata: {
      manualOverride: {
        type: Boolean,
        default: false,
      },
      overrideReason: String,
      originalPrice: Number,
    },
  },
  {
    timestamps: true,
    collection: 'price_history',
  }
);

// 복합 인덱스
PriceHistorySchema.index({ sku: 1, createdAt: -1 });
PriceHistorySchema.index({ syncStatus: 1, createdAt: -1 });

export const PriceHistory = model<IPriceHistory>('PriceHistory', PriceHistorySchema);

