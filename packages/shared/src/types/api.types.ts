// packages/shared/src/types/api.types.ts
import { ProductMapping, InventoryTransaction, PriceHistory } from './platform.types';

// API Request Types
export interface CreateMappingRequest {
  sku: string;
  naverProductId: string;
  shopifyProductId: string;
  shopifyVariantId: string;
  shopifyInventoryItemId: string;
  shopifyLocationId: string;
  productName: string;
  vendor?: string;
  priceMargin?: number;
  isActive?: boolean;
}

export interface UpdateMappingRequest extends Partial<CreateMappingRequest> {
  id: string;
}

export interface AdjustInventoryRequest {
  sku: string;
  quantity: number;
  reason: string;
  platform: Platform;
}

export interface UpdatePricingRequest {
  sku: string;
  naverPrice?: number;
  margin?: number;
  customShopifyPrice?: number;
}

export interface SyncRequest {
  sku?: string;
  type?: 'inventory' | 'price' | 'all';
  force?: boolean;
}

// WebSocket Event Types
export interface WebSocketEvent<T = any> {
  event: string;
  data: T;
  timestamp: string;
}

export interface InventoryUpdateEvent {
  sku: string;
  platform: Platform;
  previousQuantity: number;
  newQuantity: number;
  transactionType: TransactionType;
}

export interface PriceUpdateEvent {
  sku: string;
  naverPrice: number;
  shopifyPrice: number;
  exchangeRate: number;
  margin: number;
}

export interface SyncStatusEvent {
  type: 'start' | 'progress' | 'complete' | 'error';
  message: string;
  progress?: number;
  total?: number;
  errors?: string[];
}

