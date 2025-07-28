// packages/frontend/src/services/api/inventory.service.ts
import apiClient from './config';
import { InventoryStatus, InventoryTransaction } from '@/types/models';

export const inventoryApi = {
  // 재고 현황 조회
  getInventoryStatus: async (params?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
  }) => {
    const response = await apiClient.get<{
      data: InventoryStatus[];
      total: number;
      page: number;
      totalPages: number;
    }>('/inventory/status', { params });
    return response.data;
  },

  // SKU별 재고 상세 조회
  getInventoryBySku: async (sku: string) => {
    const response = await apiClient.get<InventoryStatus>(`/inventory/sku/${sku}`);
    return response.data;
  },

  // 재고 거래 내역 조회
  getTransactions: async (params?: {
    sku?: string;
    platform?: string;
    transactionType?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }) => {
    const response = await apiClient.get<{
      data: InventoryTransaction[];
      total: number;
      page: number;
      totalPages: number;
    }>('/inventory/transactions', { params });
    return response.data;
  },

  // 재고 동기화
  syncInventory: async (sku?: string) => {
    const endpoint = sku ? `/inventory/sync/${sku}` : '/inventory/sync';
    const response = await apiClient.post(endpoint);
    return response.data;
  },

  // 재고 수동 조정
  adjustInventory: async (data: {
    sku: string;
    platform: 'naver' | 'shopify';
    quantity: number;
    reason: string;
  }) => {
    const response = await apiClient.post('/inventory/adjust', data);
    return response.data;
  },

  // 재고 차이 분석
  getInventoryDiscrepancies: async () => {
    const response = await apiClient.get<{
      data: Array<{
        sku: string;
        productName: string;
        naverQuantity: number;
        shopifyQuantity: number;
        difference: number;
        percentageDiff: number;
      }>;
    }>('/inventory/discrepancies');
    return response.data;
  },

  // 재고 부족 알림 설정
  setLowStockAlert: async (data: {
    sku: string;
    threshold: number;
    enabled: boolean;
  }) => {
    const response = await apiClient.post('/inventory/alerts/low-stock', data);
    return response.data;
  },

  // 재고 보고서 생성
  generateInventoryReport: async (params: {
    startDate: string;
    endDate: string;
    format: 'excel' | 'pdf' | 'csv';
  }) => {
    const response = await apiClient.post('/inventory/reports', params, {
      responseType: 'blob',
    });
    return response.data;
  },
};