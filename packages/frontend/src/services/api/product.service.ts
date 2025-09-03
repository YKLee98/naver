// packages/frontend/src/services/api/product.service.ts
import { apiClient, get, post, patch } from './config';
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
   * Shopify SKU로 검색
   */
  async searchShopifyBySku(sku: string): Promise<AxiosResponse<any>> {
    return await apiClient.get('/products/search/shopify-sku', {
      params: { sku }
    });
  }

  /**
   * 네이버 상품명으로 검색
   */
  async searchNaverByName(name: string, limit: number = 50): Promise<AxiosResponse<any>> {
    const response = await apiClient.get('/products/search/naver-name', {
      params: { name, limit }
    });
    
    // API 응답 구조 정규화
    if (response.data && response.data.success && response.data.data) {
      return { ...response, data: response.data.data };
    }
    
    return response;
  }

  /**
   * 네이버 상품 검색
   */
  async searchNaverProducts(params: SearchProductsParams): Promise<AxiosResponse<ProductListResponse>> {
    // SKU 형식 체크 (숫자로만 이루어진 경우 SKU로 판단)
    const isSkuFormat = /^\d+$/.test(params.query);
    
    const data = await get('/products/search/naver', { 
      params: {
        ...(isSkuFormat ? { sku: params.query } : { keyword: params.query }),
        page: params.page || 1,
        limit: params.limit || 20
      }
    });
    return { data: { success: true, data } } as any;
  }

  /**
   * Shopify 상품 검색 - vendor 기반
   */
  async searchShopifyProducts(params: ShopifySearchParams): Promise<AxiosResponse<ProductListResponse>> {
    const data = await get('/products/search/shopify', { 
      params: {
        vendor: params.vendor || 'album',
        limit: params.limit || 100,
        includeInactive: params.includeInactive || false
      }
    });
    return { data: { success: true, data } } as any;
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
    const data = await get('/products', { params });
    return { data: { success: true, data } } as any;
  }

  /**
   * SKU로 상품 조회
   */
  async getProductBySku(sku: string): Promise<AxiosResponse<{ success: boolean; data: Product }>> {
    const data = await get(`/products/${sku}`);
    return { data: { success: true, data } } as any;
  }

  /**
   * 상품 동기화
   */
  async syncProduct(sku: string): Promise<AxiosResponse<{ success: boolean; data: any }>> {
    const data = await post(`/products/${sku}/sync`);
    return { data: { success: true, data } } as any;
  }

  /**
   * 상품 상태 업데이트
   */
  async updateProductStatus(sku: string, status: string): Promise<AxiosResponse<{ success: boolean }>> {
    const data = await patch(`/products/${sku}/status`, { status });
    return { data: { success: true, ...data } } as any;
  }
}

export const productService = new ProductService();

// productApi alias for Redux compatibility
export const productApi = productService;