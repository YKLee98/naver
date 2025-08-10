// ===== 1. packages/frontend/src/services/api/dashboard.service.ts =====
import { api } from '../api';
import {
  DashboardStats,
  Activity,
  ChartData,
  Alert,
  Widget,
  DashboardConfig,
  ExportRequest,
  ExportStatus
} from '@/types/models';

class DashboardService {
  /**
   * Get dashboard statistics
   */
  async getStatistics(): Promise<DashboardStats> {
    const response = await api.get('/dashboard/statistics');
    return response.data.data;
  }

  /**
   * Get statistics by type
   */
  async getStatisticsByType(type: string): Promise<any> {
    const response = await api.get(`/dashboard/statistics/${type}`);
    return response.data.data;
  }

  /**
   * Get recent activities
   */
  async getRecentActivities(params?: {
    limit?: number;
    offset?: number;
    type?: string;
  }): Promise<{ activities: Activity[]; pagination: any }> {
    const response = await api.get('/dashboard/activities', { params });
    return response.data.data;
  }

  /**
   * Get activity by ID
   */
  async getActivityById(id: string): Promise<Activity> {
    const response = await api.get(`/dashboard/activities/${id}`);
    return response.data.data;
  }

  /**
   * Get price chart data
   */
  async getPriceChartData(params?: {
    period?: string;
    sku?: string;
  }): Promise<ChartData> {
    const response = await api.get('/dashboard/charts/price', { params });
    return response.data.data;
  }

  /**
   * Get inventory chart data
   */
  async getInventoryChartData(params?: {
    period?: string;
    sku?: string;
  }): Promise<ChartData> {
    const response = await api.get('/dashboard/charts/inventory', { params });
    return response.data.data;
  }

  /**
   * Get sync chart data
   */
  async getSyncChartData(params?: {
    period?: string;
  }): Promise<ChartData> {
    const response = await api.get('/dashboard/charts/sync', { params });
    return response.data.data;
  }

  /**
   * Get sales chart data
   */
  async getSalesChartData(params?: {
    period?: string;
    platform?: string;
  }): Promise<ChartData> {
    const response = await api.get('/dashboard/charts/sales', { params });
    return response.data.data;
  }

  /**
   * Get performance chart data
   */
  async getPerformanceChartData(params?: {
    metric?: string;
  }): Promise<ChartData> {
    const response = await api.get('/dashboard/charts/performance', { params });
    return response.data.data;
  }

  /**
   * Get alerts
   */
  async getAlerts(params?: {
    status?: string;
    severity?: string;
  }): Promise<Alert[]> {
    const response = await api.get('/dashboard/alerts', { params });
    return response.data.data;
  }

  /**
   * Get alert by ID
   */
  async getAlertById(id: string): Promise<Alert> {
    const response = await api.get(`/dashboard/alerts/${id}`);
    return response.data.data;
  }

  /**
   * Dismiss alert
   */
  async dismissAlert(id: string): Promise<void> {
    await api.post(`/dashboard/alerts/${id}/dismiss`);
  }

  /**
   * Acknowledge alert
   */
  async acknowledgeAlert(id: string): Promise<void> {
    await api.post(`/dashboard/alerts/${id}/acknowledge`);
  }

  /**
   * Get widgets
   */
  async getWidgets(): Promise<Widget[]> {
    const response = await api.get('/dashboard/widgets');
    return response.data.data;
  }

  /**
   * Get widget data
   */
  async getWidgetData(widgetId: string): Promise<any> {
    const response = await api.get(`/dashboard/widgets/${widgetId}`);
    return response.data.data;
  }

  /**
   * Refresh widget
   */
  async refreshWidget(widgetId: string): Promise<any> {
    const response = await api.post(`/dashboard/widgets/${widgetId}/refresh`);
    return response.data.data;
  }

  /**
   * Get dashboard configuration
   */
  async getDashboardConfig(): Promise<DashboardConfig> {
    const response = await api.get('/dashboard/config');
    return response.data.data;
  }

  /**
   * Update dashboard configuration
   */
  async updateDashboardConfig(config: Partial<DashboardConfig>): Promise<DashboardConfig> {
    const response = await api.put('/dashboard/config', config);
    return response.data.data;
  }

  /**
   * Reset dashboard configuration
   */
  async resetDashboardConfig(): Promise<DashboardConfig> {
    const response = await api.post('/dashboard/config/reset');
    return response.data.data;
  }

  /**
   * Export dashboard data
   */
  async exportDashboardData(request: ExportRequest): Promise<{ exportId: string; status: string }> {
    const response = await api.post('/dashboard/export', request);
    return response.data.data;
  }

  /**
   * Get export status
   */
  async getExportStatus(exportId: string): Promise<ExportStatus> {
    const response = await api.get(`/dashboard/export/${exportId}/status`);
    return response.data.data;
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

