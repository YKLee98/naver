// ============================================
// packages/backend/src/models/WebhookLog.ts
// ============================================
import mongoose, { Schema, Document } from 'mongoose';

export interface IWebhookLog extends Document {
  source: 'naver' | 'shopify' | 'other';
  event: string;
  payload: any;
  headers: Record<string, string>;
  processed: boolean;
  success: boolean;
  error?: string;
  response?: any;
  processingTime?: number;
  createdAt: Date;
  updatedAt: Date;
}

const WebhookLogSchema = new Schema<IWebhookLog>(
  {
    source: {
      type: String,
      enum: ['naver', 'shopify', 'other'],
      required: true,
      index: true,
    },
    event: {
      type: String,
      required: true,
      index: true,
    },
    payload: Schema.Types.Mixed,
    headers: {
      type: Map,
      of: String,
    },
    processed: {
      type: Boolean,
      default: false,
      index: true,
    },
    success: {
      type: Boolean,
      default: false,
    },
    error: String,
    response: Schema.Types.Mixed,
    processingTime: Number,
  },
  {
    timestamps: true,
  }
);

// Compound indexes
WebhookLogSchema.index({ source: 1, event: 1, createdAt: -1 });
WebhookLogSchema.index({ processed: 1, createdAt: -1 });

// TTL index (60 days)
WebhookLogSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 60 * 24 * 60 * 60 }
);

export const WebhookLog = mongoose.model<IWebhookLog>(
  'WebhookLog',
  WebhookLogSchema
);
