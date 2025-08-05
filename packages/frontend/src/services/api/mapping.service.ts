// packages/frontend/src/services/api/mapping.service.ts
import { apiClient } from './config';
import { AxiosResponse } from 'axios';

export interface MappingData {
  _id?: string;
  sku: string;
  naverProductId: string;
  shopifyProductId: string;
  shopifyVariantId?: string;
  productName?: string;
  priceMargin: number;
  isActive: boolean;
  status?: string;
  syncStatus?: string;
  lastSyncAt?: string;
  updatedAt?: string;
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
  success: boolean;
  data: {
    mappings: MappingData[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      pages: number;
    };
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

class MappingService {
  /**
   * 매핑 목록 조회
   */
  async getMappings(params?: MappingListParams): Promise<AxiosResponse<MappingListResponse>> {
    return apiClient.get('/mappings', { params });
  }

  /**
   * 매핑 생성
   */
  async createMapping(data: Partial<MappingData>): Promise<AxiosResponse<{ success: boolean; data: { mapping: MappingData; validation: ValidationResult } }>> {
    return apiClient.post('/mappings', data);
  }

  /**
   * 매핑 수정
   */
  async updateMapping(id: string, data: Partial<MappingData>): Promise<AxiosResponse<{ success: boolean; data: { mapping: MappingData; validation: ValidationResult } }>> {
    return apiClient.put(`/mappings/${id}`, data);
  }

  /**
   * 매핑 삭제
   */
  async deleteMapping(id: string): Promise<AxiosResponse<{ success: boolean; message: string }>> {
    return apiClient.delete(`/mappings/${id}`);
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
  async autoDiscoverMappings(options: AutoDiscoverOptions): Promise<AxiosResponse<{ success: boolean; data: { found: number; mappings: any[] } }>> {
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
}

export const mappingService = new MappingService();