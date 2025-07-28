// packages/frontend/src/services/api/settings.service.ts
import apiClient from './config';
import { Settings } from '@/types/models';

export const settingsApi = {
  // 설정 조회
  getSettings: async (category?: string) => {
    const endpoint = category ? `/settings/${category}` : '/settings';
    const response = await apiClient.get<Settings[]>(endpoint);
    return response.data;
  },

  // API 설정 조회
  getApiSettings: async () => {
    const response = await apiClient.get('/settings/api');
    return response.data;
  },

  // API 설정 업데이트
  updateApiSettings: async (data: {
    naver?: {
      clientId?: string;
      clientSecret?: string;
      accessToken?: string;
      refreshToken?: string;
    };
    shopify?: {
      shopName?: string;
      accessToken?: string;
      apiVersion?: string;
    };
  }) => {
    const response = await apiClient.put('/settings/api', data);
    return response.data;
  },

  // 동기화 설정 조회
  getSyncSettings: async () => {
    const response = await apiClient.get('/settings/sync');
    return response.data;
  },

  // 동기화 설정 업데이트
  updateSyncSettings: async (data: {
    autoSync?: boolean;
    syncInterval?: number;
    inventorySync?: boolean;
    priceSync?: boolean;
    retryAttempts?: number;
    retryDelay?: number;
  }) => {
    const response = await apiClient.put('/settings/sync', data);
    return response.data;
  },

  // 알림 설정 조회
  getNotificationSettings: async () => {
    const response = await apiClient.get('/settings/notifications');
    return response.data;
  },

  // 알림 설정 업데이트
  updateNotificationSettings: async (data: {
    email?: {
      enabled?: boolean;
      recipients?: string[];
    };
    slack?: {
      enabled?: boolean;
      webhookUrl?: string;
      channel?: string;
    };
    events?: {
      syncError?: boolean;
      lowStock?: boolean;
      priceChange?: boolean;
      mappingError?: boolean;
    };
  }) => {
    const response = await apiClient.put('/settings/notifications', data);
    return response.data;
  },

  // API 연결 테스트
  testApiConnection: async (platform: 'naver' | 'shopify') => {
    const response = await apiClient.post(`/settings/test-connection/${platform}`);
    return response.data;
  },

  // 설정 내보내기
  exportSettings: async () => {
    const response = await apiClient.get('/settings/export', {
      responseType: 'blob',
    });
    return response.data;
  },

  // 설정 가져오기
  importSettings: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await apiClient.post('/settings/import', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  // 설정 초기화
  resetSettings: async (category?: string) => {
    const endpoint = category ? `/settings/reset/${category}` : '/settings/reset';
    const response = await apiClient.post(endpoint);
    return response.data;
  },
};