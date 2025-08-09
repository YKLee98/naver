// packages/backend/src/models/WebhookLog.ts
import { Schema, model, Document } from 'mongoose';

export interface IWebhookLog extends Document {
  source: 'shopify' | 'naver' | 'other';
  event: string;
  topic?: string;
  shopId?: string;
  payload: any;
  headers: Record<string, any>;
  status: 'received' | 'processing' | 'completed' | 'failed';
  processedAt?: Date;
  error?: {
    message: string;
    stack?: string;
    code?: string;
  };
  retryCount: number;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const WebhookLogSchema = new Schema<IWebhookLog>(
  {
    source: {
      type: String,
      required: true,
      enum: ['shopify', 'naver', 'other'],
      index: true
    },
    event: {
      type: String,
      required: true,
      index: true
    },
    topic: {
      type: String,
      index: true
    },
    shopId: {
      type: String,
      index: true
    },
    payload: {
      type: Schema.Types.Mixed,
      required: true
    },
    headers: {
      type: Map,
      of: Schema.Types.Mixed,
      default: {}
    },
    status: {
      type: String,
      required: true,
      enum: ['received', 'processing', 'completed', 'failed'],
      default: 'received',
      index: true
    },
    processedAt: Date,
    error: {
      message: String,
      stack: String,
      code: String
    },
    retryCount: {
      type: Number,
      default: 0
    },
    metadata: {
      type: Map,
      of: Schema.Types.Mixed
    }
  },
  {
    timestamps: true,
    collection: 'webhook_logs'
  }
);

// 복합 인덱스
WebhookLogSchema.index({ source: 1, status: 1, createdAt: -1 });
WebhookLogSchema.index({ event: 1, createdAt: -1 });
WebhookLogSchema.index({ shopId: 1, topic: 1, createdAt: -1 });

// TTL 인덱스 - 30일 후 자동 삭제
WebhookLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2592000 });

// 메서드
WebhookLogSchema.methods.markProcessed = function() {
  this.status = 'completed';
  this.processedAt = new Date();
  return this.save();
};

WebhookLogSchema.methods.markFailed = function(error: Error) {
  this.status = 'failed';
  this.error = {
    message: error.message,
    stack: error.stack,
    code: (error as any).code
  };
  return this.save();
};

export const WebhookLog = model<IWebhookLog>('WebhookLog', WebhookLogSchema);