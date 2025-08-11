// packages/backend/src/models/InventoryTransaction.ts
import { Schema, model, Document } from 'mongoose';

export interface InventoryTransaction extends Document {
  sku: string;
  platform: 'naver' | 'shopify';
  transactionType: 'sale' | 'restock' | 'adjustment' | 'sync';
  quantity: number;
  previousQuantity: number;
  newQuantity: number;
  orderId?: string;
  orderLineItemId?: string;
  reason?: string;
  performedBy: 'system' | 'manual' | 'webhook';
  syncStatus: 'pending' | 'completed' | 'failed';
  syncedAt?: Date;
  errorMessage?: string;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const InventoryTransactionSchema = new Schema<IInventoryTransaction>(
  {
    sku: {
      type: String,
      required: true,
      index: true,
    },
    platform: {
      type: String,
      required: true,
      enum: ['naver', 'shopify'],
      index: true,
    },
    transactionType: {
      type: String,
      required: true,
      enum: ['sale', 'restock', 'adjustment', 'sync'],
      index: true,
    },
    quantity: {
      type: Number,
      required: true,
    },
    previousQuantity: {
      type: Number,
      required: true,
    },
    newQuantity: {
      type: Number,
      required: true,
    },
    orderId: {
      type: String,
      sparse: true,
      index: true,
    },
    orderLineItemId: String,
    reason: String,
    performedBy: {
      type: String,
      required: true,
      enum: ['system', 'manual', 'webhook'],
      default: 'system',
    },
    syncStatus: {
      type: String,
      required: true,
      enum: ['pending', 'completed', 'failed'],
      default: 'pending',
      index: true,
    },
    syncedAt: Date,
    errorMessage: String,
    metadata: {
      type: Map,
      of: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    collection: 'inventory_transactions',
  }
);

// 복합 인덱스
InventoryTransactionSchema.index({ sku: 1, createdAt: -1 });
InventoryTransactionSchema.index({ platform: 1, syncStatus: 1 });
InventoryTransactionSchema.index({ orderId: 1, platform: 1 });

// 멱등성을 위한 유니크 인덱스
InventoryTransactionSchema.index(
  { orderId: 1, orderLineItemId: 1, transactionType: 1 },
  { unique: true, sparse: true }
);

export const InventoryTransaction = model<IInventoryTransaction>(
  'InventoryTransaction',
  InventoryTransactionSchema
);
