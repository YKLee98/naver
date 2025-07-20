// packages/shared/src/types/platform.types.ts
import { BaseEntity, Platform, SyncStatus, TransactionType } from './common.types';

export interface ProductMapping extends BaseEntity {
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
  lastSyncedAt: string | null;
  syncStatus: 'synced' | 'pending' | 'error';
  syncError?: string;
  priceMargin: number;
  metadata?: {
    naverCategory?: string;
    shopifyTags?: string[];
    customFields?: Record<string, any>;
  };
}

export interface InventoryTransaction extends BaseEntity {
  sku: string;
  platform: Platform;
  transactionType: TransactionType;
  quantity: number;
  previousQuantity: number;
  newQuantity: number;
  orderId?: string;
  orderLineItemId?: string;
  reason?: string;
  performedBy: 'system' | 'manual' | 'webhook';
  syncStatus: SyncStatus;
  syncedAt?: string;
  errorMessage?: string;
  metadata?: Record<string, any>;
}

export interface PriceHistory extends BaseEntity {
  sku: string;
  naverPrice: number;
  exchangeRate: number;
  calculatedShopifyPrice: number;
  finalShopifyPrice: number;
  priceMargin: number;
  currency: string;
  syncStatus: SyncStatus;
  syncedAt?: string;
  errorMessage?: string;
  metadata?: {
    manualOverride?: boolean;
    overrideReason?: string;
    originalPrice?: number;
  };
}

export interface ExchangeRate extends BaseEntity {
  rate: number;
  fromCurrency: string;
  toCurrency: string;
  source: string;
  validFrom: string;
  validTo: string;
}

export interface SystemLog extends BaseEntity {
  level: 'info' | 'warn' | 'error' | 'debug';
  category: string;
  message: string;
  metadata?: Record<string, any>;
  userId?: string;
  ip?: string;
  userAgent?: string;
}

