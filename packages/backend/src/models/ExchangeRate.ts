// packages/backend/src/models/ExchangeRate.ts
import { Schema, model, Document } from 'mongoose';

export interface IExchangeRate extends Document {
  baseCurrency: string;
  targetCurrency: string;
  rate: number;
  source: 'api' | 'manual';
  apiSource?: string;
  isManual: boolean;
  validFrom: Date;
  validUntil: Date;
  metadata?: {
    manualReason?: string;
    setBy?: string;
    apiResponse?: any;
  };
  createdAt: Date;
  updatedAt: Date;
}

const ExchangeRateSchema = new Schema<IExchangeRate>({
  baseCurrency: {
    type: String,
    required: true,
    uppercase: true,
    default: 'KRW'
  },
  targetCurrency: {
    type: String,
    required: true,
    uppercase: true,
    default: 'USD'
  },
  rate: {
    type: Number,
    required: true,
    min: 0
  },
  source: {
    type: String,
    required: true,
    enum: ['api', 'manual']
  },
  apiSource: {
    type: String
  },
  isManual: {
    type: Boolean,
    default: false,
    index: true
  },
  validFrom: {
    type: Date,
    required: true,
    index: true
  },
  validUntil: {
    type: Date,
    required: true,
    index: true
  },
  metadata: {
    manualReason: String,
    setBy: String,
    apiResponse: Schema.Types.Mixed
  }
}, {
  timestamps: true
});

// 복합 인덱스
ExchangeRateSchema.index({ 
  baseCurrency: 1, 
  targetCurrency: 1, 
  validFrom: -1 
});

ExchangeRateSchema.index({ 
  isManual: 1, 
  validFrom: 1, 
  validUntil: 1 
});

// 현재 유효한 환율 조회 메서드
ExchangeRateSchema.statics.getCurrentRate = async function(
  baseCurrency: string = 'KRW',
  targetCurrency: string = 'USD'
): Promise<IExchangeRate | null> {
  const now = new Date();
  
  // 먼저 수동 설정 환율 확인
  const manualRate = await this.findOne({
    baseCurrency,
    targetCurrency,
    isManual: true,
    validFrom: { $lte: now },
    validUntil: { $gte: now }
  }).sort({ createdAt: -1 });

  if (manualRate) return manualRate;

  // API 환율 확인
  return this.findOne({
    baseCurrency,
    targetCurrency,
    isManual: false,
    validFrom: { $lte: now },
    validUntil: { $gte: now }
  }).sort({ createdAt: -1 });
};

export const ExchangeRate = model<IExchangeRate>('ExchangeRate', ExchangeRateSchema);
