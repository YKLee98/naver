// ===== 1. packages/backend/src/models/ProductMapping.ts =====
import { Schema, model, Document } from 'mongoose';

export interface IProductMapping extends Document {
  sku: string;
  naverProductId: string;
  shopifyProductId: string;
  shopifyVariantId: string;
  shopifyInventoryItemId?: string;  // Optional로 변경
  shopifyLocationId?: string;  // Optional로 변경
  productName: string;
  vendor: string;
  isActive: boolean;
  status: 'ACTIVE' | 'INACTIVE' | 'ERROR' | 'PENDING';  // PENDING 추가
  lastSyncedAt?: Date;
  syncStatus: 'synced' | 'pending' | 'error' | 'syncing';  // syncing 추가
  syncError?: string;
  priceMargin: number;
  retryCount?: number;  // 추가
  lastRetryAt?: Date;  // 추가
  metadata: {
    naverCategory?: string;
    shopifyTags?: string[];
    customFields?: Record<string, any>;
    shopifyTitle?: string;
    naverStatus?: string;
    initialPrices?: {
      naver: number;
      shopify: number;
    };
    initialQuantities?: {
      naver: number;
      shopify: number;
    };
    autoSearchUsed?: boolean;  // 추가
    searchConfidence?: number;  // 추가
    searchResults?: any;  // 추가
    createdBy?: string;  // 추가
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
      uppercase: true,
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
      unique: true,
      index: true,
    },
    shopifyInventoryItemId: {
      type: String,
      required: false,  // 변경: true → false
      index: true,
      default: null,
    },
    shopifyLocationId: {
      type: String,
      required: false,  // 변경: true → false
      default: null,
    },
    productName: {
      type: String,
      required: true,
      index: true,
    },
    vendor: {
      type: String,
      required: true,
      default: 'album',
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE', 'ERROR', 'PENDING'],
      default: 'PENDING',  // 변경: 'ACTIVE' → 'PENDING'
      index: true,
    },
    lastSyncedAt: {
      type: Date,
      index: true,
    },
    syncStatus: {
      type: String,
      enum: ['synced', 'pending', 'error', 'syncing'],
      default: 'pending',
      index: true,
    },
    syncError: String,
    priceMargin: {
      type: Number,
      default: 1.15,
      min: 1,
      max: 2,
    },
    retryCount: {
      type: Number,
      default: 0,
    },
    lastRetryAt: Date,
    metadata: {
      naverCategory: String,
      shopifyTags: [String],
      customFields: {
        type: Map,
        of: Schema.Types.Mixed,
      },
      shopifyTitle: String,
      naverStatus: String,
      initialPrices: {
        naver: Number,
        shopify: Number,
      },
      initialQuantities: {
        naver: Number,
        shopify: Number,
      },
      autoSearchUsed: Boolean,
      searchConfidence: Number,
      searchResults: Schema.Types.Mixed,
      createdBy: String,
    },
  },
  {
    timestamps: true,
    collection: 'product_mappings',
    versionKey: '__v',
  }
);

// 복합 인덱스
ProductMappingSchema.index({ vendor: 1, isActive: 1, syncStatus: 1 });
ProductMappingSchema.index({ syncStatus: 1, lastSyncedAt: 1 });
ProductMappingSchema.index({ status: 1, vendor: 1 });
ProductMappingSchema.index({ status: 'PENDING', retryCount: 1, lastRetryAt: 1 });

// TTL 인덱스 제거 (중요한 데이터 보호)
// 삭제됨: TTL 인덱스

// 가상 필드
ProductMappingSchema.virtual('syncNeeded').get(function() {
  if (!this.lastSyncedAt) return true;
  const hoursSinceSync = (Date.now() - this.lastSyncedAt.getTime()) / (1000 * 60 * 60);
  return hoursSinceSync > 1;
});

// 메서드
ProductMappingSchema.methods.markSynced = function() {
  this.lastSyncedAt = new Date();
  this.syncStatus = 'synced';
  this.syncError = undefined;
  return this.save();
};

ProductMappingSchema.methods.markError = function(error: string) {
  this.syncStatus = 'error';
  this.syncError = error;
  this.status = 'ERROR';
  return this.save();
};

ProductMappingSchema.methods.markPending = function() {
  this.status = 'PENDING';
  this.isActive = false;
  return this.save();
};

// 정적 메서드
ProductMappingSchema.statics.findActiveBySku = function(sku: string) {
  return this.findOne({ sku: sku.toUpperCase(), isActive: true });
};

ProductMappingSchema.statics.findByVendor = function(vendor: string, options: any = {}) {
  const query: any = { vendor, isActive: true };
  if (options.syncStatus) {
    query.syncStatus = options.syncStatus;
  }
  return this.find(query);
};

ProductMappingSchema.statics.findPendingMappings = function(limit = 10) {
  return this.find({
    status: 'PENDING',
    retryCount: { $lt: 5 },
    $or: [
      { lastRetryAt: { $lt: new Date(Date.now() - 30 * 60 * 1000) } },
      { lastRetryAt: { $exists: false } }
    ]
  }).limit(limit);
};

export const ProductMapping = model<IProductMapping>(
  'ProductMapping',
  ProductMappingSchema
);
