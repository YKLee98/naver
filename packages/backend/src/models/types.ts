// packages/backend/src/models/types.ts

// Re-export all interfaces from models
export type { IUser } from './User.js';
export type { IProductMapping } from './ProductMapping.js';
export type { ISyncJob } from './SyncJob.js';
export type { IActivity } from './Activity.js';
export type { ISession } from './Session.js';
export type { ISystemLog } from './SystemLog.js';
export type { IWebhookLog } from './WebhookLog.js';
export type { IExchangeRate } from './ExchangeRate.js';
export type { IInventoryTransaction } from './InventoryTransaction.js';
export type { IPriceHistory } from './PriceHistory.js';
export type { INotification } from './Notification.js';
export type { IOrderSyncStatus } from './OrderSyncStatus.js';
export type { ISetting } from './Setting.js';

// Common types used across models
export interface PaginationOptions {
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

export interface QueryFilters {
  startDate?: Date;
  endDate?: Date;
  status?: string;
  type?: string;
  search?: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  pagination?: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface SyncStatus {
  status: 'idle' | 'syncing' | 'completed' | 'failed';
  lastSyncAt?: Date;
  nextSyncAt?: Date;
  progress?: number;
  message?: string;
}

export interface InventoryStatus {
  sku: string;
  naverStock: number;
  shopifyStock: number;
  difference: number;
  status: 'synced' | 'mismatch' | 'warning' | 'out_of_stock';
  lastSyncedAt?: Date;
}

export interface PriceStatus {
  sku: string;
  naverPrice: number;
  shopifyPrice: number;
  exchangeRate: number;
  margin: number;
  difference: number;
  differencePercent: number;
  status: 'synced' | 'mismatch' | 'needs_update';
  lastUpdated?: Date;
}