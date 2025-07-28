// packages/frontend/src/services/api/product.service.ts
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
      data: Product[];
      total: number;
      page: number;
      totalPages: number;
    }>('/products', { params });
    return response.data;
  },

  // 상품 상세 조회
  getProduct: async (id: string) => {
    const response = await apiClient.get<Product>(`/products/${id}`);
    return response.data;
  },

  // 상품 생성
  createProduct: async (data: Partial<Product>) => {
    const response = await apiClient.post<Product>('/products', data);
    return response.data;
  },

  // 상품 수정
  updateProduct: async (id: string, data: Partial<Product>) => {
    const response = await apiClient.put<Product>(`/products/${id}`, data);
    return response.data;
  },

  // 상품 삭제
  deleteProduct: async (id: string) => {
    const response = await apiClient.delete(`/products/${id}`);
    return response.data;
  },

  // 매핑 목록 조회
  getMappings: async (params?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
  }) => {
    const response = await apiClient.get<{
      data: Mapping[];
      total: number;
      page: number;
      totalPages: number;
    }>('/mappings', { params });
    return response.data;
  },

  // 매핑 생성
  createMapping: async (data: {
    sku: string;
    naverProductId: string;
    shopifyProductId: string;
    shopifyVariantId: string;
  }) => {
    const response = await apiClient.post<Mapping>('/mappings', data);
    return response.data;
  },

  // 매핑 수정
  updateMapping: async (id: string, data: Partial<Mapping>) => {
    const response = await apiClient.put<Mapping>(`/mappings/${id}`, data);
    return response.data;
  },

  // 매핑 삭제
  deleteMapping: async (id: string) => {
    const response = await apiClient.delete(`/mappings/${id}`);
    return response.data;
  },

  // 매핑 동기화
  syncMapping: async (id: string) => {
    const response = await apiClient.post(`/mappings/${id}/sync`);
    return response.data;
  },

  // 일괄 매핑 동기화
  bulkSyncMappings: async (ids: string[]) => {
    const response = await apiClient.post('/mappings/bulk-sync', { ids });
    return response.data;
  },
};