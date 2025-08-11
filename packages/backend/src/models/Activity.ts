// ============================================
// packages/backend/src/models/Activity.ts
// ============================================
import mongoose, { Schema, Document } from 'mongoose';

export interface IActivity extends Document {
  type:
    | 'sync'
    | 'inventory_update'
    | 'price_update'
    | 'mapping'
    | 'order'
    | 'system';
  action: string;
  details?: string;
  metadata?: Record<string, any>;
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  success: boolean;
  errorMessage?: string;
  duration?: number;
  createdAt: Date;
  updatedAt: Date;
}

const ActivitySchema = new Schema<IActivity>(
  {
    type: {
      type: String,
      enum: [
        'sync',
        'inventory_update',
        'price_update',
        'mapping',
        'order',
        'system',
      ],
      required: true,
      index: true,
    },
    action: {
      type: String,
      required: true,
    },
    details: String,
    metadata: {
      type: Map,
      of: Schema.Types.Mixed,
    },
    userId: {
      type: String,
      index: true,
    },
    ipAddress: String,
    userAgent: String,
    success: {
      type: Boolean,
      default: true,
    },
    errorMessage: String,
    duration: Number,
  },
  {
    timestamps: true,
  }
);

// Create compound indexes
ActivitySchema.index({ type: 1, createdAt: -1 });
ActivitySchema.index({ userId: 1, createdAt: -1 });
ActivitySchema.index({ success: 1, createdAt: -1 });

// TTL index for automatic cleanup (90 days)
ActivitySchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 90 * 24 * 60 * 60 }
);

export const Activity = mongoose.model<IActivity>('Activity', ActivitySchema);
