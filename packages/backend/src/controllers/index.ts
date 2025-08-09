// packages/backend/src/controllers/index.ts

/**
 * Controllers Index with ES Module Pattern
 * Uses conditional exports for optional controllers
 */

// Core Controllers - These should always exist
export { AuthController } from './AuthController.js';
export { ProductController } from './ProductController.js';
export { InventoryController } from './InventoryController.js';
export { SyncController } from './SyncController.js';
export { WebhookController } from './WebhookController.js';
export { MappingController } from './MappingController.js';
export { DashboardController } from './DashboardController.js';

// Optional Controllers - Export with fallback
// These will be conditionally imported in routes
export { PriceSyncController } from './PriceSyncController.js';
export { ExchangeRateController } from './ExchangeRateController.js';
export { PriceController } from './PriceController.js';
export { HealthController } from './HealthController.js';
export { AnalyticsController } from './AnalyticsController.js';
export { SettingsController } from './SettingsController.js';
export { NotificationController } from './NotificationController.js';
export { ReportController } from './ReportController.js';

// Export type definitions
export * from './interfaces.js';