// packages/frontend/src/services/api/dashboard.service.ts
import { apiClient } from './config';
import { AxiosResponse } from 'axios';

export interface DashboardStats {
  totalInventory: number;
  todaySales: number;
  syncStatus: 'normal' | 'warning' | 'error';
  alertCount: number;
  inventoryValue: number;
  lowStockCount: number;
  outOfStockCount: number;
  syncSuccessRate: number;
}

export interface ActivityItem {
  id: string;
  timestamp: string;
  type: 'order' | 'sync' | 'price' | 'alert';
  message: string;
  status: 'success' | 'warning' | 'error';
  details?: string;
}

export interface ChartDataPoint {
  time: string;
  value: number;
  [key: string]: any;
}

export interface InventoryDistribution {
  name: string;
  value: number;
  percentage: number;
}

class DashboardService {
  /**
   * 대시보드 통계 조회
   */
  async getStatistics(): Promise<AxiosResponse<{ success: boolean; data: DashboardStats }>> {
    return apiClient.get('/api/v1/dashboard/statistics');
  }

  /**
   * 최근 활동 조회
   */
  async getRecentActivities(params?: {
    limit?: number;
    types?: string[];
  }): Promise<AxiosResponse<{ success: boolean; data: { activities: ActivityItem[]; total: number } }>> {
    return apiClient.get('/api/v1/dashboard/activities', { params });
  }

  /**
   * 판매 차트 데이터 조회
   */
  async getSalesChartData(params?: {
    period?: 'hour' | 'day' | 'week' | 'month';
    startDate?: string;
    endDate?: string;
  }): Promise<AxiosResponse<{ success: boolean; data: ChartDataPoint[] }>> {
    return apiClient.get('/api/v1/dashboard/charts/price', { params });
  }

  /**
   * 재고 차트 데이터 조회
   */
  async getInventoryChartData(params?: {
    groupBy?: 'category' | 'vendor' | 'status';
  }): Promise<AxiosResponse<{ success: boolean; data: InventoryDistribution[] }>> {
    return apiClient.get('/api/v1/dashboard/charts/inventory', { params });
  }

  /**
   * 동기화 현황 조회
   */
  async getSyncStatus(): Promise<AxiosResponse<{ 
    success: boolean; 
    data: {
      status: 'normal' | 'warning' | 'error';
      lastSync: string;
      successRate: number;
      recentErrors: Array<{
        timestamp: string;
        error: string;
        sku?: string;
      }>;
    }
  }>> {
    return apiClient.get('/api/v1/sync/status');
  }

  /**
   * 알림 목록 조회
   */
  async getNotifications(params?: {
    unreadOnly?: boolean;
    limit?: number;
  }): Promise<AxiosResponse<{ 
    success: boolean; 
    data: {
      notifications: Array<{
        id: string;
        type: string;
        title: string;
        message: string;
        timestamp: string;
        read: boolean;
        severity: 'info' | 'warning' | 'error';
      }>;
      unreadCount: number;
    }
  }>> {
    return apiClient.get('/api/v1/notifications', { params });
  }

  /**
   * 알림 읽음 처리
   */
  async markNotificationAsRead(notificationId: string): Promise<AxiosResponse<{ success: boolean }>> {
    return apiClient.put(`/api/v1/notifications/${notificationId}/read`);
  }

  /**
   * 모든 알림 읽음 처리
   */
  async markAllNotificationsAsRead(): Promise<AxiosResponse<{ success: boolean }>> {
    return apiClient.put('/api/v1/notifications/read-all');
  }

  /**
   * 빠른 통계 조회 (위젯용)
   */
  async getQuickStats(): Promise<AxiosResponse<{ 
    success: boolean; 
    data: {
      totalSku: number;
      activeSync: number;
      todayOrders: number;
      pendingAlerts: number;
    }
  }>> {
    return apiClient.get('/api/v1/dashboard/quick-stats');
  }
}

export const dashboardService = new DashboardService();