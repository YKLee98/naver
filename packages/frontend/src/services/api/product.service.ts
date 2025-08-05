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

export interface ShopifySearchParams {
  vendor?: string;
  limit?: number;
  includeInactive?: boolean;
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
    return apiClient.get('/products/search/naver', { 
      params: {
        keyword: params.query,
        page: params.page || 1,
        size: params.limit || 20
      }
    });
  }

  /**
   * Shopify 상품 검색 - vendor 기반
   */
  async searchShopifyProducts(params: ShopifySearchParams): Promise<AxiosResponse<ProductListResponse>> {
    return apiClient.get('/products/search/shopify', { 
      params: {
        vendor: params.vendor || 'album',
        limit: params.limit || 100,
        includeInactive: params.includeInactive || false
      }
    });
  }

  /**
   * Shopify 상품 검색 - SKU 기반 (필터링)
   */
  async searchShopifyProductsBySku(sku: string): Promise<AxiosResponse<ProductListResponse>> {
    // vendor 기반으로 전체 상품을 가져온 후 프론트엔드에서 필터링
    const response = await this.searchShopifyProducts({ 
      vendor: 'album', 
      limit: 1000,
      includeInactive: false 
    });
    
    if (response.data.success && response.data.data) {
      const filteredProducts = response.data.data.filter((product: any) => {
        // 상품 제목에 SKU가 포함되어 있는지 확인
        if (product.title?.toLowerCase().includes(sku.toLowerCase())) {
          return true;
        }
        
        // variants가 있는 경우 SKU 확인
        if (product.variants && Array.isArray(product.variants)) {
          return product.variants.some((variant: any) => 
            variant.sku?.toLowerCase().includes(sku.toLowerCase())
          );
        }
        
        return false;
      });

      return {
        ...response,
        data: {
          ...response.data,
          data: {
            products: filteredProducts,
            total: filteredProducts.length
          }
        }
      };
    }
    
    return response;
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