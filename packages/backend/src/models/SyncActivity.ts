// packages/backend/src/models/SyncActivity.ts
import { Schema, model, Document } from 'mongoose';

export interface ISyncActivity extends Document {
  type: string;
  source: string;
  target: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'queued';
  details: Record<string, any>;
  metadata?: Record<string, any>;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

const SyncActivitySchema = new Schema<ISyncActivity>(
  {
    type: {
      type: String,
      required: true,
      index: true,
    },
    source: {
      type: String,
      required: true,
    },
    target: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'processing', 'completed', 'failed', 'queued'],
      default: 'pending',
      index: true,
    },
    details: {
      type: Map,
      of: Schema.Types.Mixed,
      default: {},
    },
    metadata: {
      type: Map,
      of: Schema.Types.Mixed,
    },
    error: String,
  },
  {
    timestamps: true,
    collection: 'sync_activities',
  }
);

// 인덱스
SyncActivitySchema.index({ type: 1, status: 1, createdAt: -1 });
SyncActivitySchema.index({ source: 1, target: 1, createdAt: -1 });

// TTL 인덱스 - 30일 후 자동 삭제
SyncActivitySchema.index({ createdAt: 1 }, { expireAfterSeconds: 2592000 });

export const SyncActivity = model<ISyncActivity>(
  'SyncActivity',
  SyncActivitySchema
);
