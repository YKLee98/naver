// packages/frontend/src/services/api/product.service.ts
import { apiClient } from './config';
import { AxiosResponse } from 'axios';

export interface Product {
  id: string;
  sku: string;
  title: string;
  name: string;
  price: number;
  vendor?: string;
  status?: string;
  variants?: any[];
}

export interface SearchProductsParams {
  query: string;
  limit?: number;
  page?: number;
}

export interface ProductListResponse {
  success: boolean;
  data: {
    products: Product[];
    total: number;
    pagination?: {
      page: number;
      limit: number;
      pages: number;
    };
  };
}

class ProductService {
  /**
   * 네이버 상품 검색
   */
  async searchNaverProducts(params: SearchProductsParams): Promise<AxiosResponse<ProductListResponse>> {
    return apiClient.get('/products/search/naver', { params });
  }

  /**
   * Shopify 상품 검색
   */
  async searchShopifyProducts(params: SearchProductsParams): Promise<AxiosResponse<ProductListResponse>> {
    return apiClient.get('/products/search/shopify', { params });
  }

  /**
   * 매핑된 상품 목록 조회
   */
  async getMappedProducts(params?: {
    page?: number;
    limit?: number;
    vendor?: string;
    isActive?: boolean;
    syncStatus?: string;
    search?: string;
  }): Promise<AxiosResponse<ProductListResponse>> {
    return apiClient.get('/products', { params });
  }

  /**
   * SKU로 상품 조회
   */
  async getProductBySku(sku: string): Promise<AxiosResponse<{ success: boolean; data: Product }>> {
    return apiClient.get(`/products/${sku}`);
  }

  /**
   * 상품 동기화
   */
  async syncProduct(sku: string): Promise<AxiosResponse<{ success: boolean; data: any }>> {
    return apiClient.post(`/products/${sku}/sync`);
  }

  /**
   * 상품 상태 업데이트
   */
  async updateProductStatus(sku: string, status: string): Promise<AxiosResponse<{ success: boolean }>> {
    return apiClient.patch(`/products/${sku}/status`, { status });
  }
}

export const productService = new ProductService();

// productApi alias for Redux compatibility
export const productApi = productService;