// packages/backend/src/models/SyncJob.ts
import mongoose, { Schema, Document } from 'mongoose';

export interface ISyncJob extends Document {
  syncJobId: string;
  type: 'full' | 'inventory' | 'price' | 'order';
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  totalItems: number;
  processedItems: number;
  successItems: number;
  failedItems: number;
  errors: Array<{
    sku?: string;
    error: string;
    timestamp: Date;
  }>;
  metadata: Record<string, any>;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const SyncJobSchema = new Schema<ISyncJob>(
  {
    syncJobId: { 
      type: String, 
      required: true, 
      unique: true 
      // Removed index: true to avoid duplicate
    },
    type: {
      type: String,
      enum: ['full', 'inventory', 'price', 'order'],
      required: true
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
      default: 'pending'
    },
    progress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    totalItems: {
      type: Number,
      default: 0
    },
    processedItems: {
      type: Number,
      default: 0
    },
    successItems: {
      type: Number,
      default: 0
    },
    failedItems: {
      type: Number,
      default: 0
    },
    errors: [{
      sku: String,
      error: String,
      timestamp: {
        type: Date,
        default: Date.now
      }
    }],
    metadata: {
      type: Map,
      of: Schema.Types.Mixed,
      default: {}
    },
    startedAt: Date,
    completedAt: Date
  },
  {
    timestamps: true,
    // Suppress reserved keys warning for 'errors'
    suppressReservedKeysWarning: true
  }
);

// Create indexes using schema.index() only
SyncJobSchema.index({ syncJobId: 1 });
SyncJobSchema.index({ type: 1, status: 1 });
SyncJobSchema.index({ createdAt: -1 });
SyncJobSchema.index({ status: 1, createdAt: -1 });

// TTL index for automatic cleanup of old jobs
SyncJobSchema.index(
  { completedAt: 1 },
  { 
    expireAfterSeconds: 30 * 24 * 60 * 60, // 30 days
    partialFilterExpression: { status: 'completed' }
  }
);

export const SyncJob = mongoose.model<ISyncJob>('SyncJob', SyncJobSchema);
