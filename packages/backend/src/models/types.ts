// packages/backend/src/models/types.ts

// Re-export all model interfaces
export type { IBaseDocument, IBaseModel } from './base/BaseModel.js';
export type { IUser } from './User.js';
export type { IProductMapping } from './ProductMapping.js';
export type { ISyncJob, ISyncError } from './SyncJob.js';
export type { ISettings } from './Settings.js';
export type { IActivity } from './Activity.js';
export type { ISession } from './Session.js';
export type { ISystemLog } from './SystemLog.js';
export type { IInventoryTransaction } from './InventoryTransaction.js';
export type { IPriceHistory } from './PriceHistory.js';
export type { IExchangeRate } from './ExchangeRate.js';
export type { INotification } from './Notification.js';
export type { IOrderSyncStatus } from './OrderSyncStatus.js';
export type { IWebhookLog } from './WebhookLog.js';
export type { ISyncHistory } from './SyncHistory.js';
export type { IPriceSyncJob } from './PriceSyncJob.js';
export type { ISyncActivity } from './SyncActivity.js';
export type { IApiRequest } from './ApiRequest.js';
export type { IToken } from './Token.js';

// Common types
export interface PaginationOptions {
  page: number;
  limit: number;
  sort?: any;
  populate?: string | string[];
}

export interface PaginationResult<T> {
  docs: T[];
  total: number;
  page: number;
  pages: number;
  limit: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface QueryOptions {
  lean?: boolean;
  populate?: string | string[];
  select?: string;
  sort?: any;
}

export interface BulkWriteResult {
  acknowledged: boolean;
  insertedCount: number;
  matchedCount: number;
  modifiedCount: number;
  deletedCount: number;
  upsertedCount: number;
}
