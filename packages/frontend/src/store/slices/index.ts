// packages/frontend/src/store/slices/index.ts

export { default as inventorySlice } from './inventorySlice';
export { default as pricingSlice } from './priceSlice';
export { default as mappingSlice } from './mappingSlice';
export { default as settingsSlice } from './settingsSlice';
export { default as dashboardSlice } from './dashboardSlice';
export { default as notificationSlice } from './notificationSlice';
export { default as productSlice } from './productSlice';

// Action exports
export {
  updateInventoryRealTime,
  setInventoryFilter,
  setInventorySort,
} from './inventorySlice';

export {
  updatePriceRealTime,
  updateExchangeRate,
  setPriceFilter,
} from './pricingSlice';

export {
  updateMappingStatus,
  setMappingFilter,
} from './mappingSlice';

export {
  updateSettings,
  resetSettings,
} from './settingsSlice';

export {
  addActivity,
  updateDashboardStats,
  fetchInventoryChartData,
  fetchSalesChartData,
} from './dashboardSlice';

export {
  addNotification,
  removeNotification,
  markAsRead,
  clearAllNotifications,
} from './notificationSlice';

export {
  fetchProductMappings,
  createMapping,
  updateMapping,
  deleteMapping,
  autoDiscoverMappings,
  searchNaverProducts,
  searchShopifyProducts,
} from './productSlice';