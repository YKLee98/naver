// packages/backend/src/websocket/events/index.ts

// Export all event handlers
export * from './sync.events';
export * from './inventory.events';
export * from './price.events';

// Re-export individual functions for convenience
export {
  registerSyncEvents,
  broadcastSyncProgress,
  broadcastSyncComplete,
  broadcastSyncError,
} from './sync.events';

export {
  registerInventoryEvents,
  broadcastInventoryUpdate,
  broadcastOutOfStock,
  broadcastLowStock,
} from './inventory.events';

export {
  registerPriceEvents,
  emitPriceUpdate,
  emitBulkPriceUpdate,
  broadcastPriceAlert,
} from './price.events';
