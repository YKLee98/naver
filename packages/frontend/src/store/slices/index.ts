// packages/frontend/src/store/slices/index.ts

export { default as authSlice } from './authSlice';
export { default as inventorySlice } from './inventorySlice';
export { default as pricingSlice } from './pricingSlice';
export { default as settingsSlice } from './settingsSlice';
export { default as dashboardSlice } from './dashboardSlice';
export { default as notificationSlice } from './notificationSlice';
export { default as productSlice } from './productSlice';
export { default as syncSlice } from './syncSlice';

// Action exports from inventorySlice
export {
  setSelectedSku,
  clearError as clearInventoryError,
  updateInventoryStatus,
  updateInventoryRealTime,
  fetchInventoryStatus,
  fetchInventoryBySku,
  fetchTransactions,
  syncInventory,
  adjustInventory,
  fetchDiscrepancies,
  setLowStockAlert,
  generateInventoryReport,
} from './inventorySlice';

// Action exports from pricingSlice
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

// Action exports from productSlice
export {
  setSelectedProduct,
  setSelectedMapping,
  clearError as clearProductError,
  fetchProducts,
  fetchMappings,
  createMapping,
  updateMapping,
  deleteMapping,
  syncMapping,
} from './productSlice';

// Action exports from settingsSlice
export {
  clearError as clearSettingsError,
  setConnectionStatus,
  fetchSettings,
  fetchApiSettings,
  updateApiSettings,
  fetchSyncSettings,
  updateSyncSettings,
  fetchNotificationSettings,
  updateNotificationSettings,
  testApiConnection,
  exportSettings,
  importSettings,
  resetSettings,
} from './settingsSlice';

// Action exports from dashboardSlice
export {
  clearError as clearDashboardError,
  addNotification as addDashboardNotification,
  removeNotification as removeDashboardNotification,
  setDashboardStats,
  setActivities,
  addActivity,  // addActivity export 추가
  setDateRange,
  toggleAutoRefresh,
  setRefreshInterval,
  fetchDashboardStats,
  fetchRecentActivity,
  fetchSalesChart,
  fetchInventoryChart,
  fetchSyncChart,
  fetchNotifications,
  markNotificationRead,
  fetchSystemHealth,
} from './dashboardSlice';

// Action exports from notificationSlice
export {
  addNotification,
  markAsRead,
  markAllAsRead,
  removeNotification,
  clearNotifications,
  toggleDrawer,
  toggleSound,
} from './notificationSlice';

// Action exports from authSlice
export {
  clearError as clearAuthError,
  setAuthenticated,
  login,
  logout,
  getCurrentUser,
  updateProfile,
} from './authSlice';

// Action exports from syncSlice
export {
  clearError as clearSyncError,
  startSync,
  syncSuccess,
  syncFailure,
  updateSyncProgress,
  cancelSync,
  performFullSync,
  performInventorySync,
  performPriceSync,
  syncSingleProduct,
} from './syncSlice';