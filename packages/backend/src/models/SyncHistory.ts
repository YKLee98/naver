// packages/backend/src/models/SyncHistory.ts
import { Schema, model, Document } from 'mongoose';

export interface ISyncHistory extends Document {
  sku: string;
  vendor: string;
  syncType: 'manual' | 'auto' | 'scheduled' | 'batch';
  status: 'success' | 'failed' | 'partial';
  details: {
    syncedFields?: string[];
    changes?: {
      price?: { old: number; new: number };
      inventory?: { old: number; new: number };
      images?: { added: number; removed: number };
      description?: boolean;
    };
    errors?: string[];
    warnings?: string[];
  };
  duration: number;
  retryCount?: number;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const SyncHistorySchema = new Schema<ISyncHistory>(
  {
    sku: {
      type: String,
      required: true,
      index: true,
    },
    vendor: {
      type: String,
      required: true,
      default: 'album',
    },
    syncType: {
      type: String,
      required: true,
      enum: ['manual', 'auto', 'scheduled', 'batch'],
    },
    status: {
      type: String,
      required: true,
      enum: ['success', 'failed', 'partial'],
      index: true,
    },
    details: {
      syncedFields: [String],
      changes: {
        price: {
          old: Number,
          new: Number,
        },
        inventory: {
          old: Number,
          new: Number,
        },
        images: {
          added: Number,
          removed: Number,
        },
        description: Boolean,
      },
      errors: [String],
      warnings: [String],
    },
    duration: {
      type: Number,
      required: true,
      default: 0,
    },
    retryCount: {
      type: Number,
      default: 0,
    },
    metadata: {
      type: Map,
      of: Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
    collection: 'sync_histories',
  }
);

// 복합 인덱스
SyncHistorySchema.index({ sku: 1, createdAt: -1 });
SyncHistorySchema.index({ vendor: 1, status: 1, createdAt: -1 });
SyncHistorySchema.index({ syncType: 1, createdAt: -1 });

// TTL 인덱스 - 90일 후 자동 삭제
SyncHistorySchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 });

export const SyncHistory = model<ISyncHistory>('SyncHistory', SyncHistorySchema);
