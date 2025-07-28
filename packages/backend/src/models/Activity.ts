// packages/backend/src/models/Activity.ts
import { Schema, model, Document } from 'mongoose';

export interface IActivity extends Document {
  type: 'sync' | 'inventory_update' | 'price_update' | 'mapping_change' | 'error';
  action: string;
  details: string;
  metadata?: Record<string, any>;
  userId?: string;
  createdAt: Date;
}

const activitySchema = new Schema<IActivity>(
  {
    type: {
      type: String,
      required: true,
      enum: ['sync', 'inventory_update', 'price_update', 'mapping_change', 'error'],
      index: true,
    },
    action: {
      type: String,
      required: true,
    },
    details: {
      type: String,
      required: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
    userId: {
      type: String,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// 인덱스
activitySchema.index({ createdAt: -1 });
activitySchema.index({ type: 1, createdAt: -1 });

// 정적 메소드: 활동 로그 생성
activitySchema.statics.log = async function(
  type: IActivity['type'],
  action: string,
  details: string,
  metadata?: Record<string, any>,
  userId?: string
) {
  return this.create({
    type,
    action,
    details,
    metadata,
    userId,
  });
};

// TTL 설정 (30일 후 자동 삭제)
activitySchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

export const Activity = model<IActivity>('Activity', activitySchema);