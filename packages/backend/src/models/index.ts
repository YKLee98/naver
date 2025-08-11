// packages/backend/src/models/index.ts

// Base model exports
export {
  BaseModelHelper,
  type IBaseDocument,
  type IBaseModel,
} from './base/BaseModel.js';

// Model exports
export { User, type IUser, UserRole, UserStatus } from './User.js';
export {
  ProductMapping,
  type IProductMapping,
  ProductStatus,
  ProductSyncStatus,
  Platform,
  PriceTier,
} from './ProductMapping.js';
export {
  SyncJob,
  type ISyncJob,
  SyncJobType,
  SyncJobStatus,
  SyncJobPriority,
  type ISyncError,
} from './SyncJob.js';
export {
  Settings,
  type ISettings,
  SettingsCategory,
  SettingsValueType,
  SettingsAccessLevel,
} from './Settings.js';
export { Activity, type IActivity } from './Activity.js';
export { Session, type ISession } from './Session.js';
export { SystemLog, type ISystemLog } from './SystemLog.js';
export {
  InventoryTransaction,
  type IInventoryTransaction,
} from './InventoryTransaction.js';
export { PriceHistory, type IPriceHistory } from './PriceHistory.js';
export { ExchangeRate, type IExchangeRate } from './ExchangeRate.js';
export { Notification, type INotification } from './Notification.js';
export { OrderSyncStatus, type IOrderSyncStatus } from './OrderSyncStatus.js';
export { WebhookLog, type IWebhookLog } from './WebhookLog.js';
export { SyncHistory, type ISyncHistory } from './SyncHistory.js';
export { PriceSyncJob, type IPriceSyncJob } from './PriceSyncJob.js';
export { SyncActivity, type ISyncActivity } from './SyncActivity.js';

// Re-export all types for convenience
export type * from './types.js';
