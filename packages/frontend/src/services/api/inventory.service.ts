// packages/frontend/src/services/api/inventory.service.ts
import { apiClient } from './config';
import { AxiosResponse } from 'axios';

export interface InventoryItem {
  _id: string;
  sku: string;
  productName: string;
  naverStock: number;
  shopifyStock: number;
  difference: number;
  status: 'normal' | 'warning' | 'error';
  lastSyncAt: string;
  syncStatus: 'synced' | 'pending' | 'error';
}

export interface InventorySummary {
  totalSku: number;
  normalCount: number;
  warningCount: number;
  errorCount: number;
}

export interface InventoryListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  stockLevel?: string;
  sortBy?: string;
  order?: 'asc' | 'desc';
}

export interface InventoryListResponse {
  success: boolean;
  data: {
    inventories: InventoryItem[];
    summary: InventorySummary;
    pagination: {
      page: number;
      limit: number;
      total: number;
      pages: number;
    };
  };
}

export interface InventoryStatus {
  sku: string;
  productName: string;
  naverStock: number;
  shopifyStock: number;
  difference: number;
  lastSync: string;
  syncStatus: string;
}

export interface InventoryHistory {
  _id: string;
  sku: string;
  timestamp: string;
  type: 'sale' | 'adjustment' | 'return' | 'sync';
  platform: 'naver' | 'shopify' | 'both';
  previousStock: number;
  change: number;
  newStock: number;
  reason?: string;
  notes?: string;
  userId?: string;
  orderId?: string;
}

export interface AdjustInventoryParams {
  sku: string;
  platform: 'naver' | 'shopify' | 'both';
  adjustType: 'set' | 'add' | 'subtract';
  naverQuantity?: number;
  shopifyQuantity?: number;
  reason: string;
  notes?: string;
}

export interface BulkAdjustParams {
  adjustments: Array<{
    sku: string;
    platform: 'naver' | 'shopify' | 'both';
    adjustType: 'set' | 'add' | 'subtract';
    quantity: number;
  }>;
  reason: string;
  notes?: string;
}

export interface LowStockProduct {
  sku: string;
  productName: string;
  naverStock: number;
  shopifyStock: number;
  threshold: number;
  category: string;
}

class InventoryService {
  /**
   * 재고 목록 조회
   */
  async getInventoryList(params?: InventoryListParams): Promise<AxiosResponse<InventoryListResponse>> {
    return apiClient.get('/inventory', { params });
  }

  /**
   * 재고 상태 조회 (단일 SKU)
   */
  async getInventoryStatus(sku: string): Promise<AxiosResponse<{ success: boolean; data: InventoryStatus }>> {
    return apiClient.get(`/inventory/${sku}/status`);
  }

  /**
   * 재고 이력 조회
   */
  async getInventoryHistory(
    sku: string,
    params?: {
      startDate?: string;
      endDate?: string;
      type?: string;
      limit?: number;
      page?: number;
    }
  ): Promise<AxiosResponse<{ success: boolean; data: { history: InventoryHistory[]; total: number } }>> {
    return apiClient.get(`/inventory/${sku}/history`, { params });
  }

  /**
   * 재고 조정
   */
  async adjustInventory(params: AdjustInventoryParams): Promise<AxiosResponse<{ success: boolean; data: InventoryStatus }>> {
    return apiClient.post(`inventory/${params.sku}/adjust`, params);
  }

  /**
   * 일괄 재고 조정
   */
  async bulkAdjustInventory(params: BulkAdjustParams): Promise<AxiosResponse<{ success: boolean; data: { adjusted: number; failed: number } }>> {
    return apiClient.post('/inventory/bulk-adjust', params);
  }

  /**
   * 재고 부족 상품 조회
   */
  async getLowStockProducts(params?: { 
    threshold?: number; 
    category?: string 
  }): Promise<AxiosResponse<{ success: boolean; data: LowStockProduct[] }>> {
    return apiClient.get('/inventory/low-stock', { params });
  }

  /**
   * 재고 실사 시작
   */
  async startInventoryCount(params: {
    skus?: string[];
    category?: string;
  }): Promise<AxiosResponse<{ success: boolean; data: { countId: string; products: any[] } }>> {
    return apiClient.post('/inventory/count/start', params);
  }

  /**
   * 재고 실사 제출
   */
  async submitInventoryCount(countId: string, data: Array<{ 
    sku: string; 
    actualStock: number 
  }>): Promise<AxiosResponse<{ success: boolean; data: { adjusted: number; discrepancies: any[] } }>> {
    return apiClient.post(`/inventory/count/${countId}/submit`, { counts: data });
  }

  /**
   * 재고 엑셀 내보내기
   */
  async exportInventory(params?: {
    search?: string;
    status?: string;
    stockLevel?: string;
  }): Promise<AxiosResponse<Blob>> {
    return apiClient.get('/inventory/export', {
      params,
      responseType: 'blob',
    });
  }

  /**
   * 재고 동기화 실행
   */
  async syncInventory(sku?: string): Promise<AxiosResponse<{ success: boolean; data: { synced: number; failed: number } }>> {
    const endpoint = sku ? `/sync/sku/${sku}` : '/sync/inventory';
    return apiClient.post(endpoint);
  }

  /**
   * 재고 알림 설정 조회
   */
  async getAlertSettings(): Promise<AxiosResponse<{ success: boolean; data: any }>> {
    return apiClient.get('/inventory/alerts/settings');
  }

  /**
   * 재고 알림 설정 업데이트
   */
  async updateAlertSettings(settings: {
    lowStockThreshold?: number;
    categoryThresholds?: Record<string, number>;
    alertMethods?: string[];
    alertFrequency?: string;
  }): Promise<AxiosResponse<{ success: boolean; data: any }>> {
    return apiClient.put('/inventory/alerts/settings', settings);
  }
}

export const inventoryService = new InventoryService();

// inventoryApi alias for Redux compatibility
export const inventoryApi = inventoryService;