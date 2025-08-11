// packages/backend/src/models/ProductMapping.ts
import { Schema, model, Document } from 'mongoose';
import { BaseModelHelper, IBaseDocument } from './base/BaseModel.js';

// Product status enum
export enum ProductStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  DISCONTINUED = 'discontinued',
  OUT_OF_STOCK = 'out_of_stock',
  PENDING = 'pending',
}

// Sync status enum
export enum ProductSyncStatus {
  SYNCED = 'synced',
  PENDING = 'pending',
  ERROR = 'error',
  SKIPPED = 'skipped',
}

// Platform enum
export enum Platform {
  NAVER = 'naver',
  SHOPIFY = 'shopify',
}

// Price tier enum
export enum PriceTier {
  BUDGET = 'budget',
  STANDARD = 'standard',
  PREMIUM = 'premium',
  LUXURY = 'luxury',
}

// Product mapping interface
export interface IProductMapping extends IBaseDocument {
  // Core identifiers
  sku: string;
  barcode?: string;
  naverProductId: string;
  shopifyProductId: string;
  shopifyVariantId: string;
  shopifyInventoryItemId?: string;
  shopifyLocationId?: string;

  // Product information
  productName: string;
  productNameKo?: string;
  productNameEn?: string;
  description?: string;
  shortDescription?: string;

  // Categorization
  category: string;
  subcategory?: string;
  tags: string[];
  vendor?: string;
  brand?: string;
  collection?: string;

  // Status and sync
  status: ProductStatus;
  isActive: boolean;
  syncStatus: {
    inventory: ProductSyncStatus;
    price: ProductSyncStatus;
    product: ProductSyncStatus;
    lastSyncAt?: Date;
    lastError?: string;
  };

  // Inventory
  inventory: {
    naver: {
      available: number;
      reserved: number;
      safety: number;
      lastUpdated?: Date;
    };
    shopify: {
      available: number;
      incoming: number;
      committed: number;
      lastUpdated?: Date;
    };
    sync: {
      enabled: boolean;
      bidirectional: boolean;
      priorityPlatform: Platform;
    };
  };

  // Pricing
  pricing: {
    naver: {
      regular: number;
      sale?: number;
      cost?: number;
      margin?: number;
      currency: string;
      lastUpdated?: Date;
    };
    shopify: {
      regular: number;
      sale?: number;
      compareAt?: number;
      cost?: number;
      margin?: number;
      currency: string;
      lastUpdated?: Date;
    };
    tier: PriceTier;
    autoSync: boolean;
    rules?: {
      marginPercent?: number;
      roundingStrategy?: 'up' | 'down' | 'nearest';
      minPrice?: number;
      maxPrice?: number;
    };
  };

  // Product details
  details: {
    weight?: number;
    weightUnit?: string;
    dimensions?: {
      length?: number;
      width?: number;
      height?: number;
      unit?: string;
    };
    requiresShipping: boolean;
    taxable: boolean;
    harmonizedCode?: string;
    countryOfOrigin?: string;
  };

  // Media
  media: {
    images: Array<{
      url: string;
      alt?: string;
      position: number;
      platform: Platform;
    }>;
    videos?: Array<{
      url: string;
      title?: string;
      platform: Platform;
    }>;
  };

  // SEO
  seo: {
    metaTitle?: string;
    metaDescription?: string;
    keywords?: string[];
    canonicalUrl?: string;
  };

  // Analytics
  analytics: {
    views: number;
    clicks: number;
    conversions: number;
    revenue: number;
    lastViewedAt?: Date;
    popularityScore?: number;
  };

  // Metadata
  metadata: {
    createdBy?: string;
    lastModifiedBy?: string;
    importBatch?: string;
    source?: string;
    customFields?: Record<string, any>;
  };

  // Instance methods
  syncInventory(): Promise<void>;
  syncPricing(): Promise<void>;
  calculateMargin(): number;
  updateAnalytics(event: string, value?: number): Promise<void>;
  validateMapping(): boolean;
  getDiscrepancies(): any;
}

// Product mapping schema
const productMappingSchema = new Schema<IProductMapping>(
  {
    // Core identifiers
    sku: {
      type: String,
      required: [true, 'SKU is required'],
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    barcode: {
      type: String,
      sparse: true,
      index: true,
    },
    naverProductId: {
      type: String,
      required: [true, 'Naver Product ID is required'],
      index: true,
    },
    shopifyProductId: {
      type: String,
      required: [true, 'Shopify Product ID is required'],
      index: true,
    },
    shopifyVariantId: {
      type: String,
      required: [true, 'Shopify Variant ID is required'],
      index: true,
    },
    shopifyInventoryItemId: String,
    shopifyLocationId: String,

    // Product information
    productName: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
      index: 'text', // Enable text search
    },
    productNameKo: {
      type: String,
      trim: true,
    },
    productNameEn: {
      type: String,
      trim: true,
    },
    description: {
      type: String,
      maxlength: 5000,
    },
    shortDescription: {
      type: String,
      maxlength: 500,
    },

    // Categorization
    category: {
      type: String,
      required: [true, 'Category is required'],
      index: true,
    },
    subcategory: String,
    tags: [
      {
        type: String,
        lowercase: true,
        trim: true,
      },
    ],
    vendor: {
      type: String,
      index: true,
    },
    brand: {
      type: String,
      index: true,
    },
    collection: String,

    // Status and sync
    status: {
      type: String,
      enum: Object.values(ProductStatus),
      default: ProductStatus.PENDING,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    syncStatus: {
      inventory: {
        type: String,
        enum: Object.values(ProductSyncStatus),
        default: ProductSyncStatus.PENDING,
      },
      price: {
        type: String,
        enum: Object.values(ProductSyncStatus),
        default: ProductSyncStatus.PENDING,
      },
      product: {
        type: String,
        enum: Object.values(ProductSyncStatus),
        default: ProductSyncStatus.PENDING,
      },
      lastSyncAt: Date,
      lastError: String,
    },

    // Inventory
    inventory: {
      naver: {
        available: {
          type: Number,
          default: 0,
          min: 0,
        },
        reserved: {
          type: Number,
          default: 0,
          min: 0,
        },
        safety: {
          type: Number,
          default: 0,
          min: 0,
        },
        lastUpdated: Date,
      },
      shopify: {
        available: {
          type: Number,
          default: 0,
          min: 0,
        },
        incoming: {
          type: Number,
          default: 0,
          min: 0,
        },
        committed: {
          type: Number,
          default: 0,
          min: 0,
        },
        lastUpdated: Date,
      },
      sync: {
        enabled: {
          type: Boolean,
          default: true,
        },
        bidirectional: {
          type: Boolean,
          default: false,
        },
        priorityPlatform: {
          type: String,
          enum: Object.values(Platform),
          default: Platform.NAVER,
        },
      },
    },

    // Pricing
    pricing: {
      naver: {
        regular: {
          type: Number,
          required: true,
          min: 0,
        },
        sale: {
          type: Number,
          min: 0,
        },
        cost: {
          type: Number,
          min: 0,
        },
        margin: Number,
        currency: {
          type: String,
          default: 'KRW',
        },
        lastUpdated: Date,
      },
      shopify: {
        regular: {
          type: Number,
          required: true,
          min: 0,
        },
        sale: {
          type: Number,
          min: 0,
        },
        compareAt: {
          type: Number,
          min: 0,
        },
        cost: {
          type: Number,
          min: 0,
        },
        margin: Number,
        currency: {
          type: String,
          default: 'USD',
        },
        lastUpdated: Date,
      },
      tier: {
        type: String,
        enum: Object.values(PriceTier),
        default: PriceTier.STANDARD,
      },
      autoSync: {
        type: Boolean,
        default: true,
      },
      rules: {
        marginPercent: {
          type: Number,
          min: 0,
          max: 100,
        },
        roundingStrategy: {
          type: String,
          enum: ['up', 'down', 'nearest'],
          default: 'nearest',
        },
        minPrice: {
          type: Number,
          min: 0,
        },
        maxPrice: {
          type: Number,
          min: 0,
        },
      },
    },

    // Product details
    details: {
      weight: Number,
      weightUnit: {
        type: String,
        default: 'g',
      },
      dimensions: {
        length: Number,
        width: Number,
        height: Number,
        unit: {
          type: String,
          default: 'cm',
        },
      },
      requiresShipping: {
        type: Boolean,
        default: true,
      },
      taxable: {
        type: Boolean,
        default: true,
      },
      harmonizedCode: String,
      countryOfOrigin: String,
    },

    // Media
    media: {
      images: [
        {
          url: {
            type: String,
            required: true,
          },
          alt: String,
          position: {
            type: Number,
            default: 0,
          },
          platform: {
            type: String,
            enum: Object.values(Platform),
          },
        },
      ],
      videos: [
        {
          url: {
            type: String,
            required: true,
          },
          title: String,
          platform: {
            type: String,
            enum: Object.values(Platform),
          },
        },
      ],
    },

    // SEO
    seo: {
      metaTitle: {
        type: String,
        maxlength: 70,
      },
      metaDescription: {
        type: String,
        maxlength: 160,
      },
      keywords: [
        {
          type: String,
          lowercase: true,
        },
      ],
      canonicalUrl: String,
    },

    // Analytics
    analytics: {
      views: {
        type: Number,
        default: 0,
        min: 0,
      },
      clicks: {
        type: Number,
        default: 0,
        min: 0,
      },
      conversions: {
        type: Number,
        default: 0,
        min: 0,
      },
      revenue: {
        type: Number,
        default: 0,
        min: 0,
      },
      lastViewedAt: Date,
      popularityScore: {
        type: Number,
        default: 0,
        index: true,
      },
    },

    // Metadata
    metadata: {
      createdBy: String,
      lastModifiedBy: String,
      importBatch: String,
      source: String,
      customFields: {
        type: Map,
        of: Schema.Types.Mixed,
      },
    },
  },
  {
    collection: 'product_mappings',
  }
);

// Initialize base model features
BaseModelHelper.initializeSchema(productMappingSchema);

// Additional indexes
productMappingSchema.index({ category: 1, status: 1 });
productMappingSchema.index({ vendor: 1, isActive: 1 });
productMappingSchema.index({ 'pricing.tier': 1, status: 1 });
productMappingSchema.index({ 'analytics.popularityScore': -1 });
productMappingSchema.index({ 'syncStatus.lastSyncAt': -1 });
productMappingSchema.index({
  'inventory.naver.available': 1,
  'inventory.shopify.available': 1,
});

// Text search index
productMappingSchema.index({
  productName: 'text',
  productNameKo: 'text',
  productNameEn: 'text',
  description: 'text',
  tags: 'text',
});

// Instance methods
productMappingSchema.methods.syncInventory = async function (): Promise<void> {
  // Implementation would go here
  this.syncStatus.inventory = ProductSyncStatus.SYNCED;
  this.syncStatus.lastSyncAt = new Date();
  await this.save();
};

productMappingSchema.methods.syncPricing = async function (): Promise<void> {
  // Implementation would go here
  this.syncStatus.price = ProductSyncStatus.SYNCED;
  this.syncStatus.lastSyncAt = new Date();
  await this.save();
};

productMappingSchema.methods.calculateMargin = function (): number {
  const cost = this.pricing.shopify.cost || 0;
  const price = this.pricing.shopify.sale || this.pricing.shopify.regular;

  if (cost === 0 || price === 0) return 0;

  return ((price - cost) / price) * 100;
};

productMappingSchema.methods.updateAnalytics = async function (
  event: string,
  value: number = 1
): Promise<void> {
  switch (event) {
    case 'view':
      this.analytics.views += value;
      this.analytics.lastViewedAt = new Date();
      break;
    case 'click':
      this.analytics.clicks += value;
      break;
    case 'conversion':
      this.analytics.conversions += value;
      break;
    case 'revenue':
      this.analytics.revenue += value;
      break;
  }

  // Update popularity score
  this.analytics.popularityScore =
    this.analytics.views * 0.1 +
    this.analytics.clicks * 0.3 +
    this.analytics.conversions * 0.6;

  await this.save();
};

productMappingSchema.methods.validateMapping = function (): boolean {
  // Check required fields
  if (!this.sku || !this.naverProductId || !this.shopifyProductId) {
    return false;
  }

  // Check pricing consistency
  if (this.pricing.naver.regular <= 0 || this.pricing.shopify.regular <= 0) {
    return false;
  }

  return true;
};

productMappingSchema.methods.getDiscrepancies = function (): any {
  const discrepancies: any = {};

  // Check inventory discrepancies
  const inventoryDiff = Math.abs(
    this.inventory.naver.available - this.inventory.shopify.available
  );

  if (inventoryDiff > 0) {
    discrepancies.inventory = {
      naver: this.inventory.naver.available,
      shopify: this.inventory.shopify.available,
      difference: inventoryDiff,
    };
  }

  // Check price discrepancies (considering exchange rate)
  // This would need actual exchange rate calculation

  return discrepancies;
};

// Static methods
productMappingSchema.statics.findActiveMappings = async function () {
  return this.find({
    isActive: true,
    status: ProductStatus.ACTIVE,
    _deleted: { $ne: true },
  });
};

productMappingSchema.statics.findByPlatformId = async function (
  platform: Platform,
  id: string
) {
  const query: any = { _deleted: { $ne: true } };

  if (platform === Platform.NAVER) {
    query.naverProductId = id;
  } else if (platform === Platform.SHOPIFY) {
    query.shopifyProductId = id;
  }

  return this.findOne(query);
};

productMappingSchema.statics.findBySku = async function (sku: string) {
  return this.findOne({
    sku: sku.toUpperCase(),
    _deleted: { $ne: true },
  });
};

productMappingSchema.statics.findOutOfStock = async function () {
  return this.find({
    $or: [
      { 'inventory.naver.available': 0 },
      { 'inventory.shopify.available': 0 },
    ],
    isActive: true,
    _deleted: { $ne: true },
  });
};

// Create and export model
export const ProductMapping = model<IProductMapping>(
  'ProductMapping',
  productMappingSchema
);
