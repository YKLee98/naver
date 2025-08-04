// packages/frontend/src/services/api/index.ts
import apiService from '../api';
import { apiClient } from '@/utils/api';

// 서비스별 API export (레거시 호환성)
export { apiClient };
export { default as apiService } from '../api';

// 개별 서비스 API (필요시 추가)
export const productApi = {
  getProducts: (params?: any) => apiService.getProducts(params),
  getProduct: (id: string) => apiService.getProduct(id),
  createProduct: (data: any) => apiService.createProduct(data),
  updateProduct: (id: string, data: any) => apiService.updateProduct(id, data),
  deleteProduct: (id: string) => apiService.deleteProduct(id),
};

export const inventoryApi = {
  getInventory: (params?: any) => apiService.getInventory(params),
  updateInventory: (sku: string, data: any) => apiService.updateInventory(sku, data),
  syncInventory: (sku?: string) => apiService.syncInventory(sku),
  bulkUpdateInventory: (items: any[]) => apiService.bulkUpdateInventory(items),
};

export const priceApi = {
  getPricing: (params?: any) => apiService.getPricing(params),
  updatePricing: (sku: string, data: any) => apiService.updatePricing(sku, data),
  syncPricing: (sku?: string) => apiService.syncPricing(sku),
  bulkUpdatePricing: (items: any[]) => apiService.bulkUpdatePricing(items),
};

export const syncApi = {
  performFullSync: () => apiService.performFullSync(),
  getSyncStatus: () => apiService.getSyncStatus(),
  getSyncHistory: (params?: any) => apiService.getSyncHistory(params),
};

export const dashboardApi = {
  getStats: () => apiService.getDashboardStats(),
  getRecentActivity: (limit?: number) => apiService.getRecentActivity(limit),
  getSalesChartData: (params: any) => apiService.request({ 
    method: 'GET', 
    url: '/dashboard/charts/sales', 
    params 
  }),
  getInventoryChartData: () => apiService.request({ 
    method: 'GET', 
    url: '/dashboard/charts/inventory' 
  }),
  getSyncChartData: (params: any) => apiService.request({ 
    method: 'GET', 
    url: '/dashboard/charts/sync', 
    params 
  }),
  getNotifications: (params?: any) => apiService.getNotifications(params),
  markNotificationAsRead: (id: string) => apiService.markNotificationAsRead(id),
  getSystemHealth: () => apiService.getSystemHealth(),
};

export const settingsApi = {
  getSettings: () => apiService.getSettings(),
  updateSettings: (data: any) => apiService.updateSettings(data),
  testApiConnection: (platform: 'naver' | 'shopify') => apiService.testApiConnection(platform),
};

export const authApi = {
  login: (credentials: { email: string; password: string }) => apiService.login(credentials),
  logout: () => apiService.logout(),
  getCurrentUser: () => apiService.getCurrentUser(),
  refreshToken: (refreshToken: string) => apiService.request({
    method: 'POST',
    url: '/auth/refresh',
    data: { refreshToken }
  }),
};