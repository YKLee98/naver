// packages/backend/src/models/SyncJob.ts
import { Schema, model, Document } from 'mongoose';
import { BaseModelHelper, IBaseDocument } from './base/BaseModel.js';
import { v4 as uuidv4 } from 'uuid';

// Sync job types
export enum SyncJobType {
  FULL = 'full',
  INVENTORY = 'inventory',
  PRICE = 'price',
  ORDER = 'order',
  PRODUCT = 'product',
  MAPPING = 'mapping'
}

// Sync job status
export enum SyncJobStatus {
  PENDING = 'pending',
  QUEUED = 'queued',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  PAUSED = 'paused'
}

// Sync job priority
export enum SyncJobPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  URGENT = 'urgent'
}

// Error details interface
export interface ISyncError {
  sku?: string;
  code: string;
  message: string;
  details?: any;
  timestamp: Date;
  retryable: boolean;
}

// Sync job interface
export interface ISyncJob extends IBaseDocument {
  syncJobId: string;
  type: SyncJobType;
  status: SyncJobStatus;
  priority: SyncJobPriority;
  progress: number;
  totalItems: number;
  processedItems: number;
  successItems: number;
  failedItems: number;
  skippedItems: number;
  errorList: ISyncError[]; // Changed from 'errors' to avoid reserved word
  warnings: string[];
  metadata: {
    source?: string;
    target?: string;
    triggeredBy?: string;
    triggerReason?: string;
    filters?: Record<string, any>;
    options?: Record<string, any>;
    results?: Record<string, any>;
  };
  performance: {
    startedAt?: Date;
    completedAt?: Date;
    duration?: number; // in milliseconds
    itemsPerSecond?: number;
    averageItemTime?: number; // in milliseconds
  };
  retry: {
    attempts: number;
    maxAttempts: number;
    lastAttemptAt?: Date;
    nextRetryAt?: Date;
    backoffMultiplier: number;
  };
  dependencies: {
    parentJobId?: string;
    childJobIds: string[];
    blockedBy: string[];
  };
  
  // Instance methods
  updateProgress(processed: number, success: number, failed: number): Promise<void>;
  addError(error: ISyncError): Promise<void>;
  complete(results?: any): Promise<void>;
  fail(reason: string): Promise<void>;
  cancel(): Promise<void>;
  canRetry(): boolean;
  scheduleRetry(): Promise<void>;
}

// Sync job schema
const syncJobSchema = new Schema<ISyncJob>(
  {
    syncJobId: {
      type: String,
      required: true,
      unique: true,
      default: () => uuidv4()
      // Removed index: true to avoid duplicate with unique: true
    },
    type: {
      type: String,
      enum: Object.values(SyncJobType),
      required: true,
      index: true
    },
    status: {
      type: String,
      enum: Object.values(SyncJobStatus),
      default: SyncJobStatus.PENDING,
      index: true
    },
    priority: {
      type: String,
      enum: Object.values(SyncJobPriority),
      default: SyncJobPriority.NORMAL,
      index: true
    },
    progress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    totalItems: {
      type: Number,
      default: 0,
      min: 0
    },
    processedItems: {
      type: Number,
      default: 0,
      min: 0
    },
    successItems: {
      type: Number,
      default: 0,
      min: 0
    },
    failedItems: {
      type: Number,
      default: 0,
      min: 0
    },
    skippedItems: {
      type: Number,
      default: 0,
      min: 0
    },
    errorList: [{
      sku: String,
      code: {
        type: String,
        required: true
      },
      message: {
        type: String,
        required: true
      },
      details: Schema.Types.Mixed,
      timestamp: {
        type: Date,
        default: Date.now
      },
      retryable: {
        type: Boolean,
        default: true
      }
    }],
    warnings: [{
      type: String
    }],
    metadata: {
      source: String,
      target: String,
      triggeredBy: String,
      triggerReason: String,
      filters: {
        type: Map,
        of: Schema.Types.Mixed
      },
      options: {
        type: Map,
        of: Schema.Types.Mixed
      },
      results: {
        type: Map,
        of: Schema.Types.Mixed
      }
    },
    performance: {
      startedAt: Date,
      completedAt: Date,
      duration: Number,
      itemsPerSecond: Number,
      averageItemTime: Number
    },
    retry: {
      attempts: {
        type: Number,
        default: 0
      },
      maxAttempts: {
        type: Number,
        default: 3
      },
      lastAttemptAt: Date,
      nextRetryAt: Date,
      backoffMultiplier: {
        type: Number,
        default: 2
      }
    },
    dependencies: {
      parentJobId: String,
      childJobIds: [{
        type: String
      }],
      blockedBy: [{
        type: String
      }]
    }
  },
  {
    collection: 'sync_jobs',
    // Suppress the reserved keys warning
    suppressReservedKeysWarning: true
  }
);

// Initialize base model features
BaseModelHelper.initializeSchema(syncJobSchema);

// Create compound indexes
syncJobSchema.index({ type: 1, status: 1 });
syncJobSchema.index({ status: 1, priority: -1, createdAt: 1 });
syncJobSchema.index({ 'metadata.triggeredBy': 1, createdAt: -1 });
syncJobSchema.index({ 'performance.startedAt': -1 });
syncJobSchema.index({ 'retry.nextRetryAt': 1 }, { sparse: true });

// TTL index for automatic cleanup (30 days after completion)
syncJobSchema.index(
  { 'performance.completedAt': 1 },
  { 
    expireAfterSeconds: 30 * 24 * 60 * 60,
    partialFilterExpression: { 
      status: { $in: [SyncJobStatus.COMPLETED, SyncJobStatus.CANCELLED] }
    }
  }
);

// Pre-save middleware
syncJobSchema.pre('save', function(next) {
  // Calculate progress
  if (this.totalItems > 0) {
    this.progress = Math.round((this.processedItems / this.totalItems) * 100);
  }
  
  // Calculate performance metrics
  if (this.performance.startedAt && this.performance.completedAt) {
    this.performance.duration = 
      this.performance.completedAt.getTime() - this.performance.startedAt.getTime();
    
    if (this.performance.duration > 0 && this.processedItems > 0) {
      this.performance.itemsPerSecond = 
        Math.round((this.processedItems / this.performance.duration) * 1000 * 100) / 100;
      this.performance.averageItemTime = 
        Math.round(this.performance.duration / this.processedItems);
    }
  }
  
  next();
});

// Instance methods
syncJobSchema.methods.updateProgress = async function(
  processed: number,
  success: number,
  failed: number
): Promise<void> {
  this.processedItems = processed;
  this.successItems = success;
  this.failedItems = failed;
  
  if (this.totalItems > 0) {
    this.progress = Math.round((processed / this.totalItems) * 100);
  }
  
  await this.save();
};

syncJobSchema.methods.addError = async function(error: ISyncError): Promise<void> {
  this.errorList.push(error);
  
  // Keep only last 1000 errors to prevent document size issues
  if (this.errorList.length > 1000) {
    this.errorList = this.errorList.slice(-1000);
  }
  
  await this.save();
};

syncJobSchema.methods.complete = async function(results?: any): Promise<void> {
  this.status = SyncJobStatus.COMPLETED;
  this.progress = 100;
  this.performance.completedAt = new Date();
  
  if (results) {
    if (!this.metadata.results) {
      this.metadata.results = new Map();
    }
    Object.keys(results).forEach(key => {
      this.metadata.results!.set(key, results[key]);
    });
  }
  
  await this.save();
};

syncJobSchema.methods.fail = async function(reason: string): Promise<void> {
  this.status = SyncJobStatus.FAILED;
  this.performance.completedAt = new Date();
  
  this.errorList.push({
    code: 'JOB_FAILED',
    message: reason,
    timestamp: new Date(),
    retryable: this.canRetry()
  });
  
  if (this.canRetry()) {
    await this.scheduleRetry();
  }
  
  await this.save();
};

syncJobSchema.methods.cancel = async function(): Promise<void> {
  this.status = SyncJobStatus.CANCELLED;
  this.performance.completedAt = new Date();
  await this.save();
};

syncJobSchema.methods.canRetry = function(): boolean {
  return this.retry.attempts < this.retry.maxAttempts;
};

syncJobSchema.methods.scheduleRetry = async function(): Promise<void> {
  if (!this.canRetry()) {
    throw new Error('Maximum retry attempts reached');
  }
  
  this.retry.attempts++;
  this.retry.lastAttemptAt = new Date();
  
  // Exponential backoff
  const delayMs = Math.min(
    1000 * Math.pow(this.retry.backoffMultiplier, this.retry.attempts),
    300000 // Max 5 minutes
  );
  
  this.retry.nextRetryAt = new Date(Date.now() + delayMs);
  this.status = SyncJobStatus.PENDING;
  
  await this.save();
};

// Static methods
syncJobSchema.statics.findPendingJobs = async function() {
  return this.find({
    status: SyncJobStatus.PENDING,
    $or: [
      { 'retry.nextRetryAt': { $lte: new Date() } },
      { 'retry.nextRetryAt': { $exists: false } }
    ],
    _deleted: { $ne: true }
  }).sort({ priority: -1, createdAt: 1 });
};

syncJobSchema.statics.findRunningJobs = async function() {
  return this.find({
    status: SyncJobStatus.PROCESSING,
    _deleted: { $ne: true }
  });
};

syncJobSchema.statics.findJobsByType = async function(type: SyncJobType) {
  return this.find({
    type,
    _deleted: { $ne: true }
  }).sort({ createdAt: -1 });
};

// Create and export model
export const SyncJob = model<ISyncJob>('SyncJob', syncJobSchema);