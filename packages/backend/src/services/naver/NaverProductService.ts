// packages/backend/src/services/naver/NaverProductService.ts
import axios, { AxiosInstance } from 'axios';
import { NaverAuthService } from './NaverAuthService';
import { NaverRateLimiter } from './NaverRateLimiter';
import { logger } from '@/utils/logger';
import { AppError } from '@/utils/errors';

interface NaverProduct {
  productId: string;
  name: string;
  salePrice: number;
  stockQuantity: number;
  productStatusType: string;
  saleStartDate: string;
  saleEndDate: string;
  images: {
    imageUrl: string;
    imageOrder: number;
  }[];
}

interface NaverInventoryUpdate {
  productId: string;
  stockQuantity: number;
}

export class NaverProductService {
  private authService: NaverAuthService;
  private rateLimiter: NaverRateLimiter;
  private apiClient: AxiosInstance;

  constructor(authService: NaverAuthService) {
    this.authService = authService;
    this.rateLimiter = new NaverRateLimiter();
    
    this.apiClient = axios.create({
      baseURL: 'https://api.commerce.naver.com/external/v2',
      timeout: 30000,
    });

    // 요청 인터셉터 - 인증 헤더 추가
    this.apiClient.interceptors.request.use(async (config) => {
      const headers = await this.authService.getAuthHeaders();
      config.headers = { ...config.headers, ...headers };
      return config;
    });

    // 응답 인터셉터 - 에러 처리
    this.apiClient.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 401) {
          // 토큰 갱신 후 재시도
          await this.authService.refreshAccessToken();
          const originalRequest = error.config;
          const headers = await this.authService.getAuthHeaders();
          originalRequest.headers = { ...originalRequest.headers, ...headers };
          return this.apiClient(originalRequest);
        }
        throw error;
      }
    );
  }

  /**
   * 상품 목록 조회
   */
  async getProducts(params?: {
    page?: number;
    size?: number;
    productStatusType?: string;
  }): Promise<{
    contents: NaverProduct[];
    total: number;
    page: number;
    size: number;
  }> {
    await this.rateLimiter.consume();

    try {
      const response = await this.apiClient.get('/products', {
        params: {
          page: params?.page || 1,
          size: params?.size || 100,
          productStatusType: params?.productStatusType || 'SALE',
        },
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to fetch Naver products:', error);
      throw new AppError('Failed to fetch products from Naver', 500);
    }
  }

  /**
   * 상품 상세 조회
   */
  async getProduct(productId: string): Promise<NaverProduct> {
    await this.rateLimiter.consume();

    try {
      const response = await this.apiClient.get(`/products/${productId}`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to fetch Naver product ${productId}:`, error);
      throw new AppError('Failed to fetch product from Naver', 500);
    }
  }

  /**
   * 재고 수량 조회
   */
  async getInventory(productIds: string[]): Promise<Map<string, number>> {
    await this.rateLimiter.consume();

    try {
      const response = await this.apiClient.post('/products/stock-quantities', {
        productIds,
      });

      const inventoryMap = new Map<string, number>();
      response.data.forEach((item: any) => {
        inventoryMap.set(item.productId, item.stockQuantity);
      });

      return inventoryMap;
    } catch (error) {
      logger.error('Failed to fetch Naver inventory:', error);
      throw new AppError('Failed to fetch inventory from Naver', 500);
    }
  }

  /**
   * 재고 수량 업데이트
   */
  async updateInventory(updates: NaverInventoryUpdate[]): Promise<void> {
    await this.rateLimiter.consume();

    try {
      await this.apiClient.put('/products/stock-quantities', {
        stockQuantities: updates,
      });

      logger.info(`Updated inventory for ${updates.length} products on Naver`);
    } catch (error) {
      logger.error('Failed to update Naver inventory:', error);
      throw new AppError('Failed to update inventory on Naver', 500);
    }
  }

  /**
   * 상품 가격 업데이트
   */
  async updatePrice(productId: string, price: number): Promise<void> {
    await this.rateLimiter.consume();

    try {
      await this.apiClient.put(`/products/${productId}`, {
        salePrice: price,
      });

      logger.info(`Updated price for product ${productId} on Naver to ${price}`);
    } catch (error) {
      logger.error(`Failed to update Naver price for ${productId}:`, error);
      throw new AppError('Failed to update price on Naver', 500);
    }
  }

  /**
   * 상품 상태 변경
   */
  async updateProductStatus(
    productId: string,
    status: 'SALE' | 'SUSPENSION' | 'OUTOFSTOCK'
  ): Promise<void> {
    await this.rateLimiter.consume();

    try {
      await this.apiClient.put(`/products/${productId}/status`, {
        productStatusType: status,
      });

      logger.info(`Updated status for product ${productId} on Naver to ${status}`);
    } catch (error) {
      logger.error(`Failed to update Naver product status for ${productId}:`, error);
      throw new AppError('Failed to update product status on Naver', 500);
    }
  }

  /**
   * 판매 종료일 업데이트
   */
  async updateSaleEndDate(productId: string, endDate: string): Promise<void> {
    await this.rateLimiter.consume();

    try {
      await this.apiClient.put(`/products/${productId}`, {
        saleEndDate: endDate,
      });

      logger.info(`Updated sale end date for product ${productId} on Naver`);
    } catch (error) {
      logger.error(`Failed to update sale end date for ${productId}:`, error);
      throw new AppError('Failed to update sale end date on Naver', 500);
    }
  }

  /**
   * 배치 재고 업데이트 (청크 단위로 처리)
   */
  async batchUpdateInventory(
    updates: NaverInventoryUpdate[],
    chunkSize = 100
  ): Promise<void> {
    const chunks = [];
    for (let i = 0; i < updates.length; i += chunkSize) {
      chunks.push(updates.slice(i, i + chunkSize));
    }

    for (const chunk of chunks) {
      await this.updateInventory(chunk);
      // 청크 간 지연 (rate limit 고려)
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}