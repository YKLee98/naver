// ===== 2. packages/backend/src/models/Alert.ts =====
import { Schema, model, Document } from 'mongoose';

export interface IAlert extends Document {
  type:
    | 'low_stock'
    | 'out_of_stock'
    | 'price_discrepancy'
    | 'sync_failure'
    | 'system';
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'active' | 'acknowledged' | 'dismissed' | 'resolved';
  title: string;
  message: string;
  details?: Record<string, any>;
  relatedEntity?: {
    type: string;
    id: string;
    name?: string;
  };
  acknowledgedAt?: Date;
  acknowledgedBy?: string;
  dismissedAt?: Date;
  dismissedBy?: string;
  resolvedAt?: Date;
  resolvedBy?: string;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AlertSchema = new Schema<IAlert>(
  {
    type: {
      type: String,
      required: true,
      enum: [
        'low_stock',
        'out_of_stock',
        'price_discrepancy',
        'sync_failure',
        'system',
      ],
      index: true,
    },
    severity: {
      type: String,
      required: true,
      enum: ['low', 'medium', 'high', 'critical'],
      index: true,
    },
    status: {
      type: String,
      required: true,
      enum: ['active', 'acknowledged', 'dismissed', 'resolved'],
      default: 'active',
      index: true,
    },
    title: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    details: {
      type: Schema.Types.Mixed,
      default: {},
    },
    relatedEntity: {
      type: {
        type: String,
      },
      id: String,
      name: String,
    },
    acknowledgedAt: Date,
    acknowledgedBy: String,
    dismissedAt: Date,
    dismissedBy: String,
    resolvedAt: Date,
    resolvedBy: String,
    expiresAt: {
      type: Date,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
AlertSchema.index({ status: 1, severity: 1, createdAt: -1 });
AlertSchema.index({ type: 1, status: 1 });
AlertSchema.index({ 'relatedEntity.type': 1, 'relatedEntity.id': 1 });

// TTL index for expired alerts
AlertSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Static methods
AlertSchema.statics.createAlert = async function (
  type: IAlert['type'],
  severity: IAlert['severity'],
  title: string,
  message: string,
  details?: Record<string, any>,
  relatedEntity?: IAlert['relatedEntity']
) {
  return this.create({
    type,
    severity,
    title,
    message,
    details,
    relatedEntity,
    status: 'active',
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
  });
};

export const Alert = model<IAlert>('Alert', AlertSchema);
