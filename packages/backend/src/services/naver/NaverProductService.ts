// packages/backend/src/services/naver/NaverProductService.ts

import axios, { AxiosInstance } from 'axios';
import { NaverAuthService } from './NaverAuthService';
import { logger } from '../../utils/logger';
import { AppError } from '../../utils/errors';

export interface NaverProduct {
  productNo?: string;
  id?: string;
  name: string;
  sellerManagementCode?: string;
  sellerProductTag?: string;
  salePrice: number;
  stockQuantity: number;
  statusType?: string;
  status?: string;
  representativeImage?: {
    url: string;
  };
  imageUrl?: string;
}

export interface NaverProductSearchOptions {
  searchKeyword?: string;
  searchType?:
    | 'PRODUCT_NAME'
    | 'PRODUCT_TAG'
    | 'SELLER_MANAGEMENT_CODE'
    | 'PRODUCT_NO';
  page?: number;
  size?: number;
}

export class NaverProductService {
  private authService: NaverAuthService;
  private axiosInstance: AxiosInstance;
  private baseUrl: string;

  constructor(authService: NaverAuthService) {
    this.authService = authService;
    // baseURL을 /external까지 포함하도록 설정
    this.baseUrl =
      process.env['NAVER_API_URL'] || 'https://api.commerce.naver.com/external';

    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      timeout: 60000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor to add auth token
    this.axiosInstance.interceptors.request.use(
      async (config) => {
        const accessToken = await this.authService.getAccessToken();
        config.headers.Authorization = `Bearer ${accessToken}`;
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor for error handling
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 401) {
          // Token expired, try to refresh
          await this.authService.clearTokenCache();

          // Retry the original request
          const originalRequest = error.config;
          const accessToken = await this.authService.getAccessToken();
          originalRequest.headers.Authorization = `Bearer ${accessToken}`;

          return this.axiosInstance(originalRequest);
        }

        return Promise.reject(error);
      }
    );
  }

  /**
   * 판매자 관리 코드(SKU)로 상품 검색
   */
  async searchProductsBySellerManagementCode(
    sku: string
  ): Promise<NaverProduct[]> {
    try {
      // POST /v1/products/search 사용 (baseURL이 /external 포함)
      const requestBody = {
        searchType: 'SELLER_MANAGEMENT_CODE',
        searchKeyword: sku,
        page: 1,
        size: 10,
      };

      const response = await this.axiosInstance.post(
        '/v1/products/search',
        requestBody
      );

      if (response.data && response.data.contents) {
        return response.data.contents;
      }

      return [];
    } catch (error: any) {
      logger.error(
        `Error searching products by seller management code: ${sku}`,
        error
      );

      if (error.response?.status === 404) {
        return [];
      }

      throw error;
    }
  }

  /**
   * 상품 검색 (다양한 검색 옵션)
   */
  async searchProducts(options: NaverProductSearchOptions): Promise<any> {
    try {
      // POST /v1/products/search 사용 (baseURL이 /external 포함)
      const requestBody: any = {
        page: options.page || 1,
        size: options.size || 20,
      };

      if (options.searchKeyword) {
        requestBody.searchKeyword = options.searchKeyword;
      }

      if (options.searchType) {
        requestBody.searchType = options.searchType;
      }

      const response = await this.axiosInstance.post(
        '/v1/products/search',
        requestBody
      );

      if (response.status === 200 && response.data) {
        return response.data;
      }

      // 결과가 없으면 빈 결과 반환
      return { contents: [], totalElements: 0 };
    } catch (error: any) {
      logger.error('Error searching products:', error);

      if (error.response?.status === 404) {
        logger.warn('Search endpoint not found, returning empty result');
      }

      return { contents: [], totalElements: 0 };
    }
  }

  /**
   * 상품 목록 조회 (전체)
   */
  async listProducts(
    options: {
      limit?: number;
      saleStatus?: string;
      page?: number;
    } = {}
  ): Promise<any> {
    try {
      // POST /v1/products/search 사용 (baseURL이 /external 포함)
      const requestBody: any = {
        page: options.page || 1,
        size: options.limit || 100,
      };

      if (options.saleStatus) {
        requestBody.saleStatus = options.saleStatus;
      }

      const response = await this.axiosInstance.post(
        '/v1/products/search',
        requestBody
      );

      return {
        items: response.data.contents || [],
        total: response.data.totalElements || 0,
        page: response.data.page || 1,
        size: response.data.size || options.limit,
      };
    } catch (error: any) {
      logger.error('Error listing products:', error);

      if (error.response?.status === 404) {
        return { items: [], total: 0 };
      }

      throw error;
    }
  }

  /**
   * 상품 상세 조회
   */
  async getProduct(productId: string): Promise<NaverProduct | null> {
    try {
      // GET /v2/products/origin-products/{originProductNo} 사용
      const response = await this.axiosInstance.get(
        `/v2/products/origin-products/${productId}`
      );
      return response.data;
    } catch (error: any) {
      logger.error(`Error getting product ${productId}:`, error);

      if (error.response?.status === 404) {
        return null;
      }

      throw error;
    }
  }

  /**
   * 상품 재고 조회
   */
  async getProductStock(productId: string): Promise<number> {
    try {
      const product = await this.getProduct(productId);
      return product?.stockQuantity || 0;
    } catch (error) {
      logger.error(`Error getting product stock for ${productId}:`, error);
      throw error;
    }
  }

  /**
   * 상품 재고 수정
   */
  async updateProductStock(
    productId: string,
    quantity: number
  ): Promise<boolean> {
    try {
      // PUT /v1/products/origin-products/{originProductNo}/option-stock 사용
      const response = await this.axiosInstance.put(
        `/v1/products/origin-products/${productId}/option-stock`,
        {
          stockQuantity: quantity,
        }
      );

      return response.status === 200;
    } catch (error) {
      logger.error(`Error updating product stock for ${productId}:`, error);
      throw error;
    }
  }

  /**
   * 상품 가격 수정
   */
  async updateProductPrice(productId: string, price: number): Promise<boolean> {
    try {
      // PUT /v2/products/origin-products/{originProductNo} 사용
      const response = await this.axiosInstance.put(
        `/v2/products/origin-products/${productId}`,
        {
          salePrice: price,
        }
      );

      return response.status === 200;
    } catch (error) {
      logger.error(`Error updating product price for ${productId}:`, error);
      throw error;
    }
  }

  /**
   * 상품 상태 변경
   */
  async updateProductStatus(
    productId: string,
    status: 'SALE' | 'SUSPENSION' | 'OUTOFSTOCK'
  ): Promise<boolean> {
    try {
      // PUT /v1/products/origin-products/{originProductNo}/change-status 사용
      const response = await this.axiosInstance.put(
        `/v1/products/origin-products/${productId}/change-status`,
        {
          statusType: status,
        }
      );

      return response.status === 200;
    } catch (error) {
      logger.error(`Error updating product status for ${productId}:`, error);
      throw error;
    }
  }

  /**
   * 여러 상품 조회 (배치)
   */
  async getProducts(params: {
    searchKeyword?: string;
    page?: number;
    size?: number;
  }): Promise<any> {
    try {
      // POST /v1/products/search 사용 (baseURL이 /external 포함)
      const requestBody = {
        ...params,
        page: params.page || 1,
        size: params.size || 20,
      };

      const response = await this.axiosInstance.post(
        '/v1/products/search',
        requestBody
      );

      return response.data;
    } catch (error) {
      logger.error('Error getting products:', error);
      throw error;
    }
  }

  /**
   * 상품별 재고 이력 조회
   */
  async getStockHistory(
    productId: string,
    startDate: Date,
    endDate: Date
  ): Promise<any[]> {
    try {
      const response = await this.axiosInstance.get(
        `/v1/products/${productId}/stock-history`,
        {
          params: {
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
          },
        }
      );

      return response.data.contents || [];
    } catch (error) {
      logger.error(`Error getting stock history for ${productId}:`, error);
      throw error;
    }
  }

  /**
   * 대량 재고 업데이트
   */
  async bulkUpdateStock(
    updates: Array<{ productId: string; quantity: number }>
  ): Promise<any> {
    try {
      const results = await Promise.allSettled(
        updates.map((update) =>
          this.updateProductStock(update.productId, update.quantity)
        )
      );

      const success = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.filter((r) => r.status === 'rejected').length;

      return {
        total: updates.length,
        success,
        failed,
        results,
      };
    } catch (error) {
      logger.error('Error in bulk stock update:', error);
      throw error;
    }
  }

  /**
   * 대량 가격 업데이트
   */
  async bulkUpdatePrices(
    updates: Array<{ productId: string; price: number }>
  ): Promise<any> {
    try {
      const results = await Promise.allSettled(
        updates.map((update) =>
          this.updateProductPrice(update.productId, update.price)
        )
      );

      const success = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.filter((r) => r.status === 'rejected').length;

      return {
        total: updates.length,
        success,
        failed,
        results,
      };
    } catch (error) {
      logger.error('Error in bulk price update:', error);
      throw error;
    }
  }

  /**
   * 상품 재고 조회 (SKU별)
   */
  async getInventory(productId: string): Promise<number> {
    try {
      const product = await this.getProduct(productId);
      return product?.stockQuantity || 0;
    } catch (error) {
      logger.error(`Error getting inventory for ${productId}:`, error);
      throw error;
    }
  }

  /**
   * 상품 조회 (ID별)
   */
  async getProductById(productId: string): Promise<any> {
    return this.getProduct(productId);
  }

  /**
   * 재고 업데이트
   */
  async updateInventory(productId: string, quantity: number): Promise<boolean> {
    try {
      return await this.updateProductStock(productId, quantity);
    } catch (error) {
      logger.error(`Error updating inventory for ${productId}:`, error);
      throw error;
    }
  }
}
