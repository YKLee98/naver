// packages/backend/src/models/SystemLog.ts
import { Schema, model, Document } from 'mongoose';

export interface ISystemLog extends Document {
  level: 'error' | 'warn' | 'info' | 'debug';
  category: string;
  message: string;
  context: {
    service?: string;
    method?: string;
    userId?: string;
    sku?: string;
    orderId?: string;
  };
  error?: {
    name: string;
    message: string;
    stack?: string;
    code?: string;
  };
  metadata: Record<string, any>;
  createdAt: Date;
}

const SystemLogSchema = new Schema<ISystemLog>(
  {
    level: {
      type: String,
      required: true,
      enum: ['error', 'warn', 'info', 'debug'],
      index: true,
    },
    category: {
      type: String,
      required: true,
      index: true,
    },
    message: {
      type: String,
      required: true,
    },
    context: {
      service: String,
      method: String,
      userId: String,
      sku: String,
      orderId: String,
    },
    error: {
      name: String,
      message: String,
      stack: String,
      code: String,
    },
    metadata: {
      type: Map,
      of: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'system_logs',
    capped: { size: 104857600, max: 100000 }, // 100MB, 최대 10만개 로그
  }
);

// 복합 인덱스
SystemLogSchema.index({ level: 1, createdAt: -1 });
SystemLogSchema.index({ category: 1, createdAt: -1 });
SystemLogSchema.index({ 'context.service': 1, level: 1, createdAt: -1 });

// TTL 인덱스 - 30일 후 자동 삭제
SystemLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2592000 });

export const SystemLog = model<ISystemLog>('SystemLog', SystemLogSchema);

