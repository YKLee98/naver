// packages/backend/src/models/PriceSyncJob.ts
import { Schema, model, Document } from 'mongoose';

export interface IPriceSyncJob extends Document {
  jobId: string;
  type: 'full' | 'partial' | 'manual';
  status: 'pending' | 'running' | 'completed' | 'failed';
  totalItems: number;
  processedItems: number;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  options: {
    mode: 'auto' | 'manual';
    margin?: number;
    exchangeRateSource?: 'api' | 'manual';
    customExchangeRate?: number;
    roundingStrategy?: 'up' | 'down' | 'nearest';
    skus?: string[];
  };
  errors: Array<{
    sku: string;
    error: string;
    timestamp: Date;
  }>;
  startedAt?: Date;
  completedAt?: Date;
  executionTime?: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const PriceSyncJobSchema = new Schema<IPriceSyncJob>({
  jobId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  type: {
    type: String,
    required: true,
    enum: ['full', 'partial', 'manual']
  },
  status: {
    type: String,
    required: true,
    enum: ['pending', 'running', 'completed', 'failed'],
    default: 'pending',
    index: true
  },
  totalItems: {
    type: Number,
    default: 0
  },
  processedItems: {
    type: Number,
    default: 0
  },
  successCount: {
    type: Number,
    default: 0
  },
  failedCount: {
    type: Number,
    default: 0
  },
  skippedCount: {
    type: Number,
    default: 0
  },
  options: {
    mode: {
      type: String,
      enum: ['auto', 'manual']
    },
    margin: Number,
    exchangeRateSource: {
      type: String,
      enum: ['api', 'manual']
    },
    customExchangeRate: Number,
    roundingStrategy: {
      type: String,
      enum: ['up', 'down', 'nearest']
    },
    skus: [String]
  },
  errors: [{
    sku: String,
    error: String,
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  startedAt: Date,
  completedAt: Date,
  executionTime: Number,
  createdBy: {
    type: String,
    required: true
  }
}, {
  timestamps: true
});

// 인덱스
PriceSyncJobSchema.index({ status: 1, createdAt: -1 });
PriceSyncJobSchema.index({ type: 1, createdAt: -1 });

// TTL 인덱스 (30일 후 자동 삭제)
PriceSyncJobSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2592000 });

// 실행 시간 계산
PriceSyncJobSchema.pre('save', function(next) {
  if (this.startedAt && this.completedAt) {
    this.executionTime = this.completedAt.getTime() - this.startedAt.getTime();
  }
  next();
});

export const PriceSyncJob = model<IPriceSyncJob>('PriceSyncJob', PriceSyncJobSchema);