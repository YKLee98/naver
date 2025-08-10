// ===== 3. packages/backend/src/models/SyncHistory.ts =====
import { Schema, model, Document } from 'mongoose';

export interface ISyncHistory extends Document {
  jobId: string;
  type: 'full' | 'partial' | 'inventory' | 'price' | 'manual';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  source: 'scheduled' | 'manual' | 'webhook' | 'api';
  statistics: {
    totalItems: number;
    processedItems: number;
    successCount: number;
    failedCount: number;
    skippedCount: number;
    createdCount?: number;
    updatedCount?: number;
  };
  performance: {
    startTime: Date;
    endTime?: Date;
    duration?: number; // in milliseconds
    itemsPerSecond?: number;
  };
  errors: Array<{
    timestamp: Date;
    entity: string;
    error: string;
    details?: any;
  }>;
  warnings: Array<{
    timestamp: Date;
    entity: string;
    warning: string;
    details?: any;
  }>;
  metadata?: {
    triggerUser?: string;
    triggerReason?: string;
    options?: Record<string, any>;
    results?: Record<string, any>;
  };
  createdAt: Date;
  updatedAt: Date;
}

const SyncHistorySchema = new Schema<ISyncHistory>(
  {
    jobId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    type: {
      type: String,
      required: true,
      enum: ['full', 'partial', 'inventory', 'price', 'manual'],
      index: true
    },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'running', 'completed', 'failed', 'cancelled'],
      default: 'pending',
      index: true
    },
    source: {
      type: String,
      required: true,
      enum: ['scheduled', 'manual', 'webhook', 'api'],
      default: 'manual'
    },
    statistics: {
      totalItems: { type: Number, default: 0 },
      processedItems: { type: Number, default: 0 },
      successCount: { type: Number, default: 0 },
      failedCount: { type: Number, default: 0 },
      skippedCount: { type: Number, default: 0 },
      createdCount: { type: Number, default: 0 },
      updatedCount: { type: Number, default: 0 }
    },
    performance: {
      startTime: { type: Date, required: true },
      endTime: Date,
      duration: Number,
      itemsPerSecond: Number
    },
    errors: [{
      timestamp: { type: Date, default: Date.now },
      entity: String,
      error: String,
      details: Schema.Types.Mixed
    }],
    warnings: [{
      timestamp: { type: Date, default: Date.now },
      entity: String,
      warning: String,
      details: Schema.Types.Mixed
    }],
    metadata: {
      triggerUser: String,
      triggerReason: String,
      options: Schema.Types.Mixed,
      results: Schema.Types.Mixed
    }
  },
  {
    timestamps: true
  }
);

// Indexes
SyncHistorySchema.index({ type: 1, status: 1, createdAt: -1 });
SyncHistorySchema.index({ 'performance.startTime': -1 });
SyncHistorySchema.index({ source: 1, createdAt: -1 });

// TTL index (keep for 90 days)
SyncHistorySchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 });

// Virtual fields
SyncHistorySchema.virtual('successRate').get(function() {
  if (this.statistics.processedItems === 0) return 0;
  return Math.round((this.statistics.successCount / this.statistics.processedItems) * 100);
});

// Pre-save hook to calculate duration
SyncHistorySchema.pre('save', function(next) {
  if (this.performance.startTime && this.performance.endTime) {
    this.performance.duration = this.performance.endTime.getTime() - this.performance.startTime.getTime();
    
    if (this.statistics.processedItems > 0 && this.performance.duration > 0) {
      this.performance.itemsPerSecond = Math.round(
        (this.statistics.processedItems / (this.performance.duration / 1000)) * 100
      ) / 100;
    }
  }
  next();
});

export const SyncHistory = model<ISyncHistory>('SyncHistory', SyncHistorySchema);