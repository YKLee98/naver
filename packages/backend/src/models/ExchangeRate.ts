// packages/backend/src/models/ExchangeRate.ts
import { Schema, model, Document } from 'mongoose';

export interface IExchangeRate extends Document {
  baseCurrency: string;
  targetCurrency: string;
  rate: number;
  source: string;
  isManual: boolean;
  validFrom: Date;
  validUntil: Date;
  metadata: {
    apiResponse?: Record<string, any>;
    manualReason?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const ExchangeRateSchema = new Schema<IExchangeRate>(
  {
    baseCurrency: {
      type: String,
      required: true,
      default: 'KRW',
    },
    targetCurrency: {
      type: String,
      required: true,
      default: 'USD',
    },
    rate: {
      type: Number,
      required: true,
      min: 0,
    },
    source: {
      type: String,
      required: true,
      default: 'api',
    },
    isManual: {
      type: Boolean,
      default: false,
      index: true,
    },
    validFrom: {
      type: Date,
      required: true,
      default: Date.now,
    },
    validUntil: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + 24 * 60 * 60 * 1000), // 24시간 후
    },
    metadata: {
      apiResponse: {
        type: Map,
        of: Schema.Types.Mixed,
      },
      manualReason: String,
    },
  },
  {
    timestamps: true,
    collection: 'exchange_rates',
  }
);

// 복합 인덱스
ExchangeRateSchema.index({ baseCurrency: 1, targetCurrency: 1, validFrom: -1 });
ExchangeRateSchema.index({ validUntil: 1 }, { expireAfterSeconds: 0 });

// 현재 유효한 환율 조회를 위한 메서드
ExchangeRateSchema.statics.getCurrentRate = async function (
  baseCurrency = 'KRW',
  targetCurrency = 'USD'
) {
  const now = new Date();
  return this.findOne({
    baseCurrency,
    targetCurrency,
    validFrom: { $lte: now },
    validUntil: { $gte: now },
  }).sort({ validFrom: -1 });
};

export const ExchangeRate = model<IExchangeRate>('ExchangeRate', ExchangeRateSchema);

