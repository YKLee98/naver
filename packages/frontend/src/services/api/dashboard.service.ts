
// ===== 2. packages/frontend/src/services/api/dashboard.service.ts (Updated) =====
import { api } from '../api';
import { AxiosResponse } from 'axios';

// Types
export interface DashboardStats {
  totalInventory: number;
  todaySales: number;
  syncStatus: 'normal' | 'warning' | 'error';
  alertCount: number;
  inventoryValue: number;
  lowStockCount: number;
  outOfStockCount: number;
  syncSuccessRate: number;
  lastSyncTime?: string;
  activeProducts: number;
  totalProducts: number;
  priceDiscrepancies: number;
  pendingSyncs: number;
}

export interface Activity {
  _id: string;
  id: string;
  type: 'sync' | 'inventory_update' | 'price_update' | 'mapping_change' | 'error';
  action: string;
  details: string;
  metadata?: Record<string, any>;
  userId?: string;
  createdAt: string;
  timestamp: string;
}

export interface ChartData {
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
    backgroundColor?: string | string[];
    borderColor?: string;
    borderWidth?: number;
    fill?: boolean;
  }>;
  summary?: {
    total?: number;
    average?: number;
    trend?: 'up' | 'down' | 'stable';
    changePercent?: number;
  };
}

export interface Alert {
  _id: string;
  type: string;
  severity: string;
  status: string;
  title: string;
  message: string;
  details?: any;
  createdAt: string;
}

class DashboardService {
  /**
   * Get dashboard statistics
   */
  async getStatistics(): Promise<AxiosResponse<{ success: boolean; data: DashboardStats }>> {
    return api.get('/dashboard/statistics');
  }

  /**
   * Get statistics by type
   */
  async getStatisticsByType(type: string): Promise<AxiosResponse<{ success: boolean; data: any }>> {
    return api.get(`/dashboard/statistics/${type}`);
  }

  /**
   * Get recent activities
   */
  async getRecentActivities(params?: {
    limit?: number;
    offset?: number;
    type?: string;
  }): Promise<AxiosResponse<{ success: boolean; data: { activities: Activity[]; pagination: any } }>> {
    return api.get('/dashboard/activities', { params });
  }

  /**
   * Get activity by ID
   */
  async getActivityById(id: string): Promise<AxiosResponse<{ success: boolean; data: Activity }>> {
    return api.get(`/dashboard/activities/${id}`);
  }

  /**
   * Get sales chart data
   */
  async getSalesChartData(params?: {
    period?: string;
    platform?: string;
  }): Promise<AxiosResponse<{ success: boolean; data: ChartData }>> {
    return api.get('/dashboard/charts/sales', { params });
  }

  /**
   * Get inventory chart data
   */
  async getInventoryChartData(params?: {
    period?: string;
    sku?: string;
  }): Promise<AxiosResponse<{ success: boolean; data: ChartData }>> {
    return api.get('/dashboard/charts/inventory', { params });
  }

  /**
   * Get price chart data
   */
  async getPriceChartData(params?: {
    period?: string;
    sku?: string;
  }): Promise<AxiosResponse<{ success: boolean; data: ChartData }>> {
    return api.get('/dashboard/charts/price', { params });
  }

  /**
   * Get sync chart data
   */
  async getSyncChartData(params?: {
    period?: string;
  }): Promise<AxiosResponse<{ success: boolean; data: ChartData }>> {
    return api.get('/dashboard/charts/sync', { params });
  }

  /**
   * Get performance chart data
   */
  async getPerformanceChartData(params?: {
    metric?: string;
  }): Promise<AxiosResponse<{ success: boolean; data: ChartData }>> {
    return api.get('/dashboard/charts/performance', { params });
  }

  /**
   * Get alerts
   */
  async getAlerts(params?: {
    status?: string;
    severity?: string;
  }): Promise<AxiosResponse<{ success: boolean; data: Alert[] }>> {
    return api.get('/dashboard/alerts', { params });
  }

  /**
   * Dismiss alert
   */
  async dismissAlert(id: string): Promise<AxiosResponse<{ success: boolean; data: any }>> {
    return api.post(`/dashboard/alerts/${id}/dismiss`);
  }

  /**
   * Acknowledge alert
   */
  async acknowledgeAlert(id: string): Promise<AxiosResponse<{ success: boolean; data: any }>> {
    return api.post(`/dashboard/alerts/${id}/acknowledge`);
  }

  /**
   * Get widgets
   */
  async getWidgets(): Promise<AxiosResponse<{ success: boolean; data: any[] }>> {
    return api.get('/dashboard/widgets');
  }

  /**
   * Get widget data
   */
  async getWidgetData(widgetId: string): Promise<AxiosResponse<{ success: boolean; data: any }>> {
    return api.get(`/dashboard/widgets/${widgetId}`);
  }

  /**
   * Refresh widget
   */
  async refreshWidget(widgetId: string): Promise<AxiosResponse<{ success: boolean; data: any }>> {
    return api.post(`/dashboard/widgets/${widgetId}/refresh`);
  }

  /**
   * Get dashboard config
   */
  async getDashboardConfig(): Promise<AxiosResponse<{ success: boolean; data: any }>> {
    return api.get('/dashboard/config');
  }

  /**
   * Update dashboard config
   */
  async updateDashboardConfig(config: any): Promise<AxiosResponse<{ success: boolean; data: any }>> {
    return api.put('/dashboard/config', config);
  }

  /**
   * Export dashboard data
   */
  async exportDashboardData(params: {
    format?: string;
    dateRange?: any;
  }): Promise<AxiosResponse<{ success: boolean; data: { exportId: string } }>> {
    return api.post('/dashboard/export', params);
  }

  /**
   * Get export status
   */
  async getExportStatus(exportId: string): Promise<AxiosResponse<{ success: boolean; data: any }>> {
    return api.get(`/dashboard/export/${exportId}/status`);
  }

  /**
   * Download export
   */
  async downloadExport(exportId: string): Promise<Blob> {
    const response = await api.get(`/dashboard/export/${exportId}/download`, {
      responseType: 'blob'
    });
    return response.data;
  }
}

export const dashboardService = new DashboardService();