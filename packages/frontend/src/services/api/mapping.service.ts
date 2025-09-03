// packages/frontend/src/services/api/mapping.service.ts

import { apiClient, get, post, put, del } from './config';
import { AxiosResponse } from 'axios';

export interface MappingData {
  _id?: string;
  sku: string;
  naverProductId: string;
  shopifyProductId: string;
  shopifyVariantId?: string;
  productName?: string;
  vendor?: string;
  priceMargin: number;
  isActive: boolean;
  status?: string;
  syncStatus?: string;
  lastSyncAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface MappingListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  isActive?: boolean;
  sortBy?: string;
  order?: 'asc' | 'desc';
}

export interface MappingListResponse {
  mappings: MappingData[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  stats?: {
    total: number;
    active: number;
    inactive: number;
    error: number;
    pending: number;
    syncNeeded: number;
  };
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  naverProduct?: any;
  shopifyProduct?: any;
}

export interface AutoDiscoverOptions {
  matchBySku?: boolean;
  matchByName?: boolean;
  nameSimilarity?: number;
  priceDifference?: number;
}

export interface BulkUploadResult {
  total: number;
  success: Array<{ row: number; sku: string }>;
  errors: Array<{ row: number; sku: string; error: string }>;
  skipped: Array<{ row: number; sku: string; reason: string }>;
}

export interface SkuSearchResult {
  sku: string;
  naver: {
    found: boolean;
    products: Array<{
      id: string;
      name: string;
      sku: string;
      price: number;
      imageUrl?: string;
      stockQuantity?: number;
      status?: string;
      similarity?: number;
    }>;
    message?: string;
    error?: string;
  };
  shopify: {
    found: boolean;
    products: Array<{
      id: string;
      variantId: string;
      title: string;
      variantTitle?: string;
      sku: string;
      price: string;
      imageUrl?: string;
      inventoryQuantity?: number;
      vendor?: string;
      similarity?: number;
    }>;
    message?: string;
    error?: string;
  };
  recommendations?: {
    autoMappingPossible: boolean;
    confidence: number;
  };
}

export interface DiscoveredMapping {
  sku: string;
  naverProduct: {
    id: string;
    name: string;
    price: number;
  };
  shopifyMatches: Array<{
    id: string;
    title: string;
    price: string;
    similarity: number;
  }>;
}

class MappingService {
  /**
   * SKU로 네이버와 Shopify 상품 자동 검색
   */
  async searchProductsBySku(sku: string): Promise<AxiosResponse<{ success: boolean; data: SkuSearchResult }>> {
    const data = await get('/mappings/search-by-sku', { params: { sku } });
    return { data: { success: true, data } } as any;
  }

  /**
   * 매핑 목록 조회
   */
  async getMappings(params?: MappingListParams): Promise<any> {
    try {
      const response = await apiClient.get('/mappings', { params });
      console.log('🗺️ Mapping service full response:', response);
      console.log('🗺️ Mapping service response data:', response.data);
      
      // Backend returns { success: true, data: { mappings: [...], pagination: {...} } }
      let mappingData = [];
      let pagination = null;
      let stats = null;
      
      if (response.data) {
        if (response.data.success && response.data.data) {
          // Handle { success: true, data: { mappings: [...] } } format
          console.log('🗺️ Processing success/data format');
          mappingData = response.data.data.mappings || [];
          pagination = response.data.data.pagination;
          stats = response.data.data.stats;
        } else if (Array.isArray(response.data)) {
          // Handle direct array format
          console.log('🗺️ Processing array of mapping items:', response.data.length);
          mappingData = response.data;
        } else if (response.data.mappings) {
          // Handle { mappings: [...] } format
          console.log('🗺️ Processing mappings wrapper format');
          mappingData = response.data.mappings;
          pagination = response.data.pagination;
          stats = response.data.stats;
        }
      }
      
      console.log('🗺️ Extracted mappings:', mappingData.length, 'items');
      
      return {
        data: {
          success: true,
          data: {
            mappings: mappingData,
            pagination: pagination || { 
              page: params?.page || 1, 
              limit: params?.limit || 20, 
              total: mappingData.length, 
              totalPages: Math.ceil(mappingData.length / (params?.limit || 20))
            },
            stats: stats || {
              total: mappingData.length,
              active: mappingData.filter((m: any) => m.isActive).length,
              inactive: mappingData.filter((m: any) => !m.isActive).length,
              error: mappingData.filter((m: any) => m.status === 'error').length,
              pending: mappingData.filter((m: any) => m.status === 'pending').length,
              syncNeeded: mappingData.filter((m: any) => m.syncStatus === 'needed').length
            }
          }
        }
      };
    } catch (error) {
      console.error('Error in getMappings:', error);
      // 에러 발생시 빈 데이터 반환
      return {
        data: {
          success: true,
          data: {
            mappings: [],
            pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
            stats: { total: 0, active: 0, inactive: 0, error: 0, pending: 0, syncNeeded: 0 }
          }
        }
      };
    }
  }

  /**
   * 매핑 생성
   */
  async createMapping(mappingData: Partial<MappingData> & { autoSearch?: boolean }): Promise<AxiosResponse<{ success: boolean; data: MappingData }>> {
    const data = await post('/mappings', mappingData);
    return { data: { success: true, data } } as any;
  }

  /**
   * 매핑 수정
   */
  async updateMapping(id: string, mappingData: Partial<MappingData>): Promise<AxiosResponse<{ success: boolean; data: MappingData }>> {
    const data = await put(`/mappings/${id}`, mappingData);
    return { data: { success: true, data } } as any;
  }

  /**
   * 매핑 삭제
   */
  async deleteMapping(id: string): Promise<AxiosResponse<{ success: boolean; message: string }>> {
    const data = await del(`/mappings/${id}`);
    return { data: { success: true, ...data } } as any;
  }

  /**
   * 매핑 검증
   */
  async validateMapping(id: string): Promise<AxiosResponse<{ success: boolean; data: ValidationResult }>> {
    return apiClient.post(`/mappings/${id}/validate`);
  }

  /**
   * 매핑 데이터 검증 (생성 전)
   */
  async validateMappingData(data: { sku: string; naverProductId: string; shopifyProductId: string }): Promise<AxiosResponse<{ success: boolean; data: ValidationResult }>> {
    return apiClient.post('/mappings/validate', data);
  }

  /**
   * 자동 매핑 탐색
   */
  async autoDiscoverMappings(options: AutoDiscoverOptions): Promise<AxiosResponse<{ success: boolean; data: { found: number; mappings: DiscoveredMapping[] } }>> {
    return apiClient.post('/mappings/auto-discover', options);
  }

  /**
   * 엑셀 대량 업로드
   */
  async bulkUpload(formData: FormData): Promise<AxiosResponse<{ success: boolean; data: BulkUploadResult }>> {
    return apiClient.post('/mappings/bulk', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  }

  /**
   * 엑셀 템플릿 다운로드
   */
  async downloadTemplate(): Promise<AxiosResponse<Blob>> {
    return apiClient.get('/mappings/template', {
      responseType: 'blob',
    });
  }

  /**
   * 매핑 일괄 활성화/비활성화
   */
  async toggleMappings(ids: string[], isActive: boolean): Promise<AxiosResponse<{ success: boolean; updated: number }>> {
    return apiClient.put('/mappings/bulk-toggle', {
      ids,
      isActive,
    });
  }

  /**
   * 매핑 일괄 삭제
   */
  async bulkDelete(ids: string[]): Promise<AxiosResponse<{ success: boolean; deleted: number }>> {
    return apiClient.post('/mappings/bulk-delete', { ids });
  }

  /**
   * 매핑 내보내기 (엑셀)
   */
  async exportMappings(params?: MappingListParams): Promise<AxiosResponse<Blob>> {
    return apiClient.get('/mappings/export', {
      params,
      responseType: 'blob',
    });
  }

  /**
   * 매핑 상태 일괄 업데이트
   */
  async bulkUpdateStatus(updates: Array<{ id: string; status: string }>): Promise<AxiosResponse<{ success: boolean; updated: number }>> {
    return apiClient.put('/mappings/bulk-status', { updates });
  }

  /**
   * 매핑 통계 조회
   */
  async getMappingStatistics(): Promise<AxiosResponse<{ 
    success: boolean; 
    data: {
      total: number;
      active: number;
      inactive: number;
      error: number;
      pending: number;
      syncNeeded: number;
    }
  }>> {
    return apiClient.get('/mappings/stats');
  }

  /**
   * 단일 매핑 조회
   */
  async getMapping(id: string): Promise<AxiosResponse<{ success: boolean; data: MappingData }>> {
    return apiClient.get(`/mappings/${id}`);
  }

  /**
   * SKU로 매핑 조회
   */
  async getMappingBySku(sku: string): Promise<AxiosResponse<{ success: boolean; data: MappingData }>> {
    return apiClient.get(`/mappings/sku/${sku}`);
  }

  /**
   * 매핑 동기화
   */
  async syncMapping(id: string): Promise<AxiosResponse<{ success: boolean; message: string }>> {
    return apiClient.post(`/mappings/${id}/sync`);
  }

  /**
   * PENDING 매핑 재시도
   */
  async retryPendingMapping(id: string): Promise<AxiosResponse<{ success: boolean; data: MappingData }>> {
    return apiClient.post(`/mappings/${id}/retry`);
  }

  /**
   * 매핑 가져오기 (import)
   */
  async importMappings(data: any, format: string = 'json'): Promise<AxiosResponse<{ success: boolean; data: BulkUploadResult }>> {
    return apiClient.post('/mappings/import', { data, format });
  }
}

export const mappingService = new MappingService();