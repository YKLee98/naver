// packages/frontend/src/services/api/sync.service.ts
import apiClient from './config';
import { SyncJob } from '@/types/models';

export const syncApi = {
  // 동기화 작업 목록 조회
  getSyncJobs: async (params?: {
    type?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }) => {
    const response = await apiClient.get<{
      data: SyncJob[];
      total: number;
      page: number;
      totalPages: number;
    }>('/sync/jobs', { params });
    return response.data;
  },

  // 동기화 작업 상세 조회
  getSyncJob: async (id: string) => {
    const response = await apiClient.get<SyncJob>(`/sync/jobs/${id}`);
    return response.data;
  },

  // 전체 동기화 시작
  startFullSync: async () => {
    const response = await apiClient.post<SyncJob>('/sync/full');
    return response.data;
  },

  // 재고 동기화 시작
  startInventorySync: async (skus?: string[]) => {
    const response = await apiClient.post<SyncJob>('/sync/inventory', { skus });
    return response.data;
  },

  // 가격 동기화 시작
  startPriceSync: async (skus?: string[]) => {
    const response = await apiClient.post<SyncJob>('/sync/price', { skus });
    return response.data;
  },

  // 매핑 동기화 시작
  startMappingSync: async () => {
    const response = await apiClient.post<SyncJob>('/sync/mapping');
    return response.data;
  },

  // 동기화 작업 취소
  cancelSyncJob: async (id: string) => {
    const response = await apiClient.post(`/sync/jobs/${id}/cancel`);
    return response.data;
  },

  // 동기화 작업 재시도
  retrySyncJob: async (id: string) => {
    const response = await apiClient.post(`/sync/jobs/${id}/retry`);
    return response.data;
  },

  // 동기화 상태 조회
  getSyncStatus: async () => {
    const response = await apiClient.get<{
      isRunning: boolean;
      currentJob?: SyncJob;
      lastSync?: {
        type: string;
        completedAt: string;
        status: string;
        stats: {
          processed: number;
          success: number;
          failed: number;
        };
      };
      nextScheduledSync?: {
        type: string;
        scheduledAt: string;
      };
    }>('/sync/status');
    return response.data;
  },

  // 동기화 스케줄 설정
  setSyncSchedule: async (data: {
    type: 'full' | 'inventory' | 'price';
    enabled: boolean;
    interval: 'hourly' | 'daily' | 'weekly';
    time?: string;
    dayOfWeek?: number;
  }) => {
    const response = await apiClient.post('/sync/schedule', data);
    return response.data;
  },

  // 동기화 스케줄 조회
  getSyncSchedules: async () => {
    const response = await apiClient.get('/sync/schedules');
    return response.data;
  },

  // 동기화 로그 조회
  getSyncLogs: async (jobId: string, params?: {
    level?: 'info' | 'warning' | 'error';
    page?: number;
    limit?: number;
  }) => {
    const response = await apiClient.get(`/sync/jobs/${jobId}/logs`, { params });
    return response.data;
  },
};