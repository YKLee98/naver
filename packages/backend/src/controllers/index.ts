// packages/backend/src/controllers/index.ts
export { AuthController } from './AuthController';
export { ProductController } from './ProductController';
export { InventoryController } from './InventoryController';
export { SyncController } from './SyncController';
export { WebhookController } from './WebhookController';
export { MappingController } from './MappingController';
export { DashboardController } from './DashboardController';
export { PriceSyncController } from './PriceSyncController';
export { ExchangeRateController } from './ExchangeRateController';
export { PriceController } from './PriceController';

// Health Controller가 있다면
try {
  export { HealthController } from './HealthController';
} catch (e) {
  // HealthController가 없어도 무시
}

