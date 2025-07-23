// packages/backend/src/models/ProductMapping.ts
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
  status: 'ACTIVE' | 'INACTIVE' | 'ERROR';
  lastSyncedAt?: Date;
  syncStatus: 'synced' | 'pending' | 'error';
  syncError?: string;
  priceMargin: number;
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
      required: true,
      index: true,
    },
    shopifyLocationId: {
      type: String,
      required: true,
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
      enum: ['ACTIVE', 'INACTIVE', 'ERROR'],
      default: 'ACTIVE',
      index: true,
    },
    lastSyncedAt: {
      type: Date,
      index: true,
    },
    syncStatus: {
      type: String,
      enum: ['synced', 'pending', 'error'],
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
    },
  },
  {
    timestamps: true,
    collection: 'product_mappings',
    // 낙관적 동시성 제어를 위한 버전 키
    versionKey: '__v',
  }
);

// 복합 인덱스
ProductMappingSchema.index({ vendor: 1, isActive: 1, syncStatus: 1 });
ProductMappingSchema.index({ syncStatus: 1, lastSyncedAt: 1 });
ProductMappingSchema.index({ status: 1, vendor: 1 });

// TTL 인덱스 - 비활성화된 매핑은 90일 후 자동 삭제
ProductMappingSchema.index(
  { updatedAt: 1 },
  { 
    expireAfterSeconds: 7776000, // 90일
    partialFilterExpression: { isActive: false } 
  }
);

// 가상 필드
ProductMappingSchema.virtual('syncNeeded').get(function() {
  if (!this.lastSyncedAt) return true;
  const hoursSinceSync = (Date.now() - this.lastSyncedAt.getTime()) / (1000 * 60 * 60);
  return hoursSinceSync > 1; // 1시간 이상 지난 경우
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

export const ProductMapping = model<IProductMapping>(
  'ProductMapping',
  ProductMappingSchema
);