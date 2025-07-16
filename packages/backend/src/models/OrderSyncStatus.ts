// packages/backend/src/models/OrderSyncStatus.ts
import { Schema, model, Document } from 'mongoose';

export interface IOrderSyncStatus extends Document {
  orderId: string;
  platform: 'naver' | 'shopify';
  orderNumber: string;
  orderDate: Date;
  syncStatus: 'pending' | 'processing' | 'completed' | 'failed';
  lastAttemptAt?: Date;
  completedAt?: Date;
  attemptCount: number;
  items: Array<{
    sku: string;
    quantity: number;
    syncStatus: 'pending' | 'completed' | 'failed';
    errorMessage?: string;
  }>;
  errorMessage?: string;
  metadata: {
    customerInfo?: Record<string, any>;
    paymentInfo?: Record<string, any>;
    shippingInfo?: Record<string, any>;
  };
  createdAt: Date;
  updatedAt: Date;
}

const OrderSyncStatusSchema = new Schema<IOrderSyncStatus>(
  {
    orderId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    platform: {
      type: String,
      required: true,
      enum: ['naver', 'shopify'],
      index: true,
    },
    orderNumber: {
      type: String,
      required: true,
      index: true,
    },
    orderDate: {
      type: Date,
      required: true,
      index: true,
    },
    syncStatus: {
      type: String,
      required: true,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
      index: true,
    },
    lastAttemptAt: Date,
    completedAt: Date,
    attemptCount: {
      type: Number,
      default: 0,
    },
    items: [
      {
        sku: {
          type: String,
          required: true,
        },
        quantity: {
          type: Number,
          required: true,
        },
        syncStatus: {
          type: String,
          required: true,
          enum: ['pending', 'completed', 'failed'],
          default: 'pending',
        },
        errorMessage: String,
      },
    ],
    errorMessage: String,
    metadata: {
      customerInfo: {
        type: Map,
        of: Schema.Types.Mixed,
      },
      paymentInfo: {
        type: Map,
        of: Schema.Types.Mixed,
      },
      shippingInfo: {
        type: Map,
        of: Schema.Types.Mixed,
      },
    },
  },
  {
    timestamps: true,
    collection: 'order_sync_status',
  }
);

// 복합 인덱스
OrderSyncStatusSchema.index({ platform: 1, syncStatus: 1, lastAttemptAt: 1 });
OrderSyncStatusSchema.index({ orderDate: -1, platform: 1 });

export const OrderSyncStatus = model<IOrderSyncStatus>(
  'OrderSyncStatus',
  OrderSyncStatusSchema
);

