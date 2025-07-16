import { Schema, model, Document } from 'mongoose';

export interface IProductMapping extends Document {
  sku: string;
  naverProductId: string;
  shopifyProductId: string;
  shopifyVariantId: string;
  shopifyInventoryItemId: string;
  shopifyLocationId: string;
  productName: string;
  vendor: string;
  isActive: boolean;
  lastSyncedAt: Date;
  syncStatus: 'synced' | 'pending' | 'error';
  syncError?: string;
  priceMargin: number;
  metadata: {
    naverCategory?: string;
    shopifyTags?: string[];
    customFields?: Record<string, any>;
  };
  createdAt: Date;
  updatedAt: Date;
}

const ProductMappingSchema = new Schema<IProductMapping>(
  {
    sku: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    naverProductId: {
      type: String,
      required: true,
      index: true,
    },
    shopifyProductId: {
      type: String,
      required: true,
      index: true,
    },
    shopifyVariantId: {
      type: String,
      required: true,
      index: true,
    },
    shopifyInventoryItemId: {
      type: String,
      required: true,
    },
    shopifyLocationId: {
      type: String,
      required: true,
    },
    productName: {
      type: String,
      required: true,
    },
    vendor: {
      type: String,
      default: 'album',
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    lastSyncedAt: {
      type: Date,
      default: null,
    },
    syncStatus: {
      type: String,
      enum: ['synced', 'pending', 'error'],
      default: 'pending',
      index: true,
    },
    syncError: {
      type: String,
      default: null,
    },
    priceMargin: {
      type: Number,
      default: 1.15, // 15% 마진
    },
    metadata: {
      naverCategory: String,
      shopifyTags: [String],
      customFields: {
        type: Map,
        of: Schema.Types.Mixed,
      },
    },
  },
  {
    timestamps: true,
    collection: 'product_mappings',
  }
);

// 복합 인덱스
ProductMappingSchema.index({ vendor: 1, isActive: 1 });
ProductMappingSchema.index({ syncStatus: 1, lastSyncedAt: 1 });

export const ProductMapping = model<IProductMapping>('ProductMapping', ProductMappingSchema);

