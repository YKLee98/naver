// packages/backend/src/controllers/index.ts

/**
 * Controllers Index with Safe Export Pattern
 * Uses try-catch to handle missing controllers gracefully
 */

// Core Controllers - Always available
export { AuthController } from './AuthController';
export { ProductController } from './ProductController';
export { InventoryController } from './InventoryController';
export { SyncController } from './SyncController';
export { WebhookController } from './WebhookController';
export { MappingController } from './MappingController';
export { DashboardController } from './DashboardController';

// Extended Controllers - May not be available
try {
  export { PriceSyncController } from './PriceSyncController';
} catch (e) {
  console.warn('PriceSyncController not available');
}

try {
  export { ExchangeRateController } from './ExchangeRateController';
} catch (e) {
  console.warn('ExchangeRateController not available');
}

try {
  export { PriceController } from './PriceController';
} catch (e) {
  console.warn('PriceController not available');
}

try {
  export { HealthController } from './HealthController';
} catch (e) {
  console.warn('HealthController not available');
}

try {
  export { AnalyticsController } from './AnalyticsController';
} catch (e) {
  console.warn('AnalyticsController not available');
}

try {
  export { SettingsController } from './SettingsController';
} catch (e) {
  console.warn('SettingsController not available');
}

try {
  export { NotificationController } from './NotificationController';
} catch (e) {
  console.warn('NotificationController not available');
}

try {
  export { ReportController } from './ReportController';
} catch (e) {
  console.warn('ReportController not available');
}

// Export type definitions for TypeScript support
export type * from './types';

// Re-export controller interfaces if they exist
try {
  export type { IController, IAuthController, IProductController } from './interfaces';
} catch (e) {
  // Interfaces might not exist, that's okay
}
