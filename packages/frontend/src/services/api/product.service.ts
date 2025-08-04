// ===== 2. packages/frontend/src/services/api/product.service.ts =====
// API 서비스 수정 - 응답 처리 개선
import apiClient from './config';
import { Product, Mapping } from '@/types/models';

export const productApi = {
  // 상품 목록 조회
  getProducts: async (params?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
  }) => {
    const response = await apiClient.get<{
      success: boolean;
      data: Product[];
      total: number;
      page: number;
      totalPages: number;
    }>('/products', { params });
    return response.data;
  },

  // 상품 상세 조회
  getProduct: async (id: string) => {
    const response = await apiClient.get<{ success: boolean; data: Product }>(`/products/${id}`);
    return response.data.data;
  },

  // 매핑 목록 조회
  getMappings: async (params?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
  }) => {
    const response = await apiClient.get<{
      success: boolean;
      data: Mapping[];
      total: number;
      page: number;
      totalPages: number;
    }>('/mappings', { params });
    
    // 응답 구조 확인 및 처리
    if (response.data.success === false) {
      throw new Error('Failed to fetch mappings');
    }
    
    return {
      data: response.data.data || [],
      total: response.data.total || 0,
      page: response.data.page || 1,
      totalPages: response.data.totalPages || 1,
    };
  },

  // 매핑 생성
  createMapping: async (data: {
    sku: string;
    productName?: string;
    naverProductId: string;
    shopifyProductId: string;
    shopifyVariantId: string;
    vendor?: string;
    priceMargin?: number;
    isActive?: boolean;
  }) => {
    const response = await apiClient.post<{ 
      success: boolean; 
      data: Mapping;
      message?: string;
    }>('/mappings', data);
    
    if (response.data.success === false) {
      throw new Error(response.data.message || 'Failed to create mapping');
    }
    
    return response.data;
  },

  // 매핑 수정
  updateMapping: async (id: string, data: Partial<Mapping>) => {
    const response = await apiClient.put<{ 
      success: boolean; 
      data: Mapping;
      message?: string;
    }>(`/mappings/${id}`, data);
    
    if (response.data.success === false) {
      throw new Error(response.data.message || 'Failed to update mapping');
    }
    
    return response.data;
  },

  // 매핑 삭제
  deleteMapping: async (id: string) => {
    const response = await apiClient.delete<{ 
      success: boolean;
      message?: string;
    }>(`/mappings/${id}`);
    
    if (response.data.success === false) {
      throw new Error(response.data.message || 'Failed to delete mapping');
    }
    
    return response.data;
  },

  // 매핑 동기화
  syncMapping: async (id: string) => {
    const response = await apiClient.post<{
      success: boolean;
      data: any;
      message?: string;
    }>(`/mappings/${id}/sync`);
    
    if (response.data.success === false) {
      throw new Error(response.data.message || 'Failed to sync mapping');
    }
    
    return response.data;
  },
};