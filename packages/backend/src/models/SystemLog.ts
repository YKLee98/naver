// packages/backend/src/models/SystemLog.ts
import mongoose, { Schema, Document } from 'mongoose';

export interface ISystemLog extends Document {
  level: 'error' | 'warn' | 'info' | 'debug';
  message: string;
  metadata?: Record<string, any>;
  source?: string;
  stack?: string;
  timestamp: Date;
  createdAt: Date;
  updatedAt: Date;
}

const SystemLogSchema = new Schema<ISystemLog>(
  {
    level: {
      type: String,
      enum: ['error', 'warn', 'info', 'debug'],
      required: true,
      index: true,
    },
    message: {
      type: String,
      required: true,
    },
    metadata: {
      type: Map,
      of: Schema.Types.Mixed,
    },
    source: String,
    stack: String,
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// TTL index for automatic cleanup (30 days)
SystemLogSchema.index(
  { timestamp: 1 },
  { expireAfterSeconds: 30 * 24 * 60 * 60 }
);

export const SystemLog = mongoose.model<ISystemLog>(
  'SystemLog',
  SystemLogSchema
);
