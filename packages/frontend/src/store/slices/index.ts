// packages/frontend/src/store/slices/index.ts

// Slice exports
export { default as authSlice } from './authSlice';
export { default as dashboardSlice } from './dashboardSlice';
export { default as inventorySlice } from './inventorySlice';
export { default as pricingSlice } from './pricingSlice';
export { default as productSlice } from './productSlice';
export { default as settingsSlice } from './settingsSlice';
export { default as syncSlice } from './syncSlice';
export { default as notificationSlice } from './notificationSlice';
export { default as websocketSlice } from './websocketSlice';

// Auth actions
export {
  setAuthenticated,
  login,
  logout,
  getCurrentUser,
  updateProfile,
} from './authSlice';

// Dashboard actions
export {
  setDashboardStats,
  setActivities,
  addActivity,
  setDateRange,
  toggleAutoRefresh,
  setRefreshInterval,
  addDashboardNotification,
  removeDashboardNotification,
  clearDashboardError,
  fetchDashboardStats,
  fetchRecentActivity,
  fetchSalesChart,
  fetchInventoryChart,
  fetchSyncChart,
  fetchNotifications,
  markNotificationRead,
  fetchSystemHealth,
} from './dashboardSlice';

// Inventory actions
export {
  setSelectedSku,
  updateInventoryRealTime,
  updateInventoryStatus,
  setFilters as setInventoryFilters,
  clearInventoryError,
  resetInventoryState,
  fetchInventoryStatus,
  fetchInventoryBySku,
  fetchTransactions,
  syncInventory,
  adjustInventory,
  fetchDiscrepancies,
  setLowStockAlert,
  generateInventoryReport,
} from './inventorySlice';

// Pricing actions
export {
  setPriceHistory,
  addPriceHistory,
  updatePriceRealTime,
  setExchangeRate,
  updateExchangeRate,
  setPriceFilter,
  setLoading as setPricingLoading,
  setError as setPricingError,
  clearPricingState,
} from './pricingSlice';

// Notification actions
export {
  addNotification,
  markAsRead,
  markAllAsRead,
  removeNotification,
  clearNotifications,
  toggleDrawer,
  setDrawerOpen,
  toggleSound,
  setSoundEnabled,
} from './notificationSlice';

// WebSocket actions
export {
  setConnected,
  setReconnecting,
  incrementReconnectAttempts,
  resetReconnectAttempts,
  setError as setWebSocketError,
  resetWebSocketState,
} from './websocketSlice';

// Product actions (if exists)
export type { default as ProductSlice } from './productSlice';

// Settings actions (if exists)
export type { default as SettingsSlice } from './settingsSlice';

// Sync actions (if exists)
export type { default as SyncSlice } from './syncSlice';