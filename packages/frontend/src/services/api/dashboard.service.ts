// packages/frontend/src/services/api/dashboard.service.ts
import apiClient from './config';
import { DashboardStats, Activity } from '@/types/models';

export const dashboardApi = {
  // 대시보드 통계 조회
  getStats: async () => {
    const response = await apiClient.get<DashboardStats>('/dashboard/stats');
    return response.data;
  },

  // 최근 활동 조회
  getRecentActivity: async (limit = 10) => {
    const response = await apiClient.get<{
      data: Activity[];
    }>('/dashboard/activity', {
      params: { limit },
    });
    return response.data;
  },

  // 판매 차트 데이터 조회
  getSalesChartData: async (params: {
    period: 'day' | 'week' | 'month' | 'year';
    startDate?: string;
    endDate?: string;
  }) => {
    const response = await apiClient.get('/dashboard/charts/sales', { params });
    return response.data;
  },

  // 재고 차트 데이터 조회
  getInventoryChartData: async () => {
    const response = await apiClient.get('/dashboard/charts/inventory');
    return response.data;
  },

  // 동기화 차트 데이터 조회
  getSyncChartData: async (params: {
    period: 'day' | 'week' | 'month';
  }) => {
    const response = await apiClient.get('/dashboard/charts/sync', { params });
    return response.data;
  },

  // 알림 조회
  getNotifications: async (params?: {
    unreadOnly?: boolean;
    limit?: number;
  }) => {
    const response = await apiClient.get('/dashboard/notifications', { params });
    return response.data;
  },

  // 알림 읽음 처리
  markNotificationAsRead: async (id: string) => {
    const response = await apiClient.put(`/dashboard/notifications/${id}/read`);
    return response.data;
  },

  // 모든 알림 읽음 처리
  markAllNotificationsAsRead: async () => {
    const response = await apiClient.put('/dashboard/notifications/read-all');
    return response.data;
  },

  // 시스템 상태 조회
  getSystemHealth: async () => {
    const response = await apiClient.get<{
      status: 'healthy' | 'degraded' | 'down';
      services: {
        api: boolean;
        database: boolean;
        redis: boolean;
        naver: boolean;
        shopify: boolean;
      };
      lastChecked: string;
    }>('/dashboard/health');
    return response.data;
  },
};