// packages/backend/src/services/naver/NaverProductService.ts
import axios, { AxiosInstance } from 'axios';
import { NaverAuthService } from './NaverAuthService';
import { NaverRateLimiter } from './NaverRateLimiter';
import { logger } from '@/utils/logger';
import { SystemLog } from '@/models';
import { retry } from '@/utils/retry';

interface NaverProduct {
  productId: string;
  name: string;
  salePrice: number;
  stockQuantity: number;
  sellerManagementCode: string;
  statusType: string;
  saleStatus: string;
}

interface NaverProductListResponse {
  timestamp: string;
  totalCount: number;
  products: NaverProduct[];
}

export class NaverProductService {
  private authService: NaverAuthService;
  private rateLimiter: NaverRateLimiter;
  private apiBaseUrl: string;
  private axiosInstance: AxiosInstance;

  constructor(authService: NaverAuthService) {
    this.authService = authService;
    this.rateLimiter = new NaverRateLimiter();
    this.apiBaseUrl = process.env.NAVER_API_BASE_URL!;
    
    this.axiosInstance = axios.create({
      baseURL: this.apiBaseUrl,
      timeout: 30000,
    });

    // 요청 인터셉터 - 인증 헤더 추가
    this.axiosInstance.interceptors.request.use(async (config) => {
      const headers = await this.authService.getAuthHeaders();
      config.headers = { ...config.headers, ...headers };
      return config;
    });

    // 응답 인터셉터 - 에러 처리
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 401) {
          // 토큰 갱신 후 재시도
          logger.warn('Naver API token expired, refreshing...');
          await this.authService.getAccessToken();
          return this.axiosInstance.request(error.config);
        }
        throw error;
      }
    );
  }

  /**
   * 상품 목록 조회
   */
  async getProducts(params: {
    page?: number;
    size?: number;
    searchKeyword?: string;
  } = {}): Promise<NaverProductListResponse> {
    await this.rateLimiter.consume();

    const queryParams = new URLSearchParams({
      page: (params.page || 1).toString(),
      size: (params.size || 100).toString(),
      ...(params.searchKeyword && { searchKeyword: params.searchKeyword }),
    });

    try {
      const response = await retry(
        () => this.axiosInstance.get(`/external/v1/products?${queryParams}`),
        {
          retries: 3,
          minTimeout: 1000,
          maxTimeout: 5000,
        }
      );

      return response.data;
    } catch (error) {
      logger.error('Failed to fetch Naver products', error);
      throw error;
    }
  }

  /**
   * 상품 상세 조회
   */
  async getProduct(productId: string): Promise<NaverProduct> {
    await this.rateLimiter.consume();

    try {
      const response = await retry(
        () => this.axiosInstance.get(`/external/v1/products/${productId}`),
        {
          retries: 3,
          minTimeout: 1000,
          maxTimeout: 5000,
        }
      );

      return response.data;
    } catch (error) {
      logger.error(`Failed to fetch Naver product: ${productId}`, error);
      throw error;
    }
  }

  /**
   * 재고 수량 업데이트
   */
  async updateStock(productId: string, quantity: number, operationType: 'SET' | 'ADD' | 'SUBTRACT'): Promise<void> {
    await this.rateLimiter.consume();

    try {
      await retry(
        () => this.axiosInstance.put(`/external/v1/products/${productId}/stock`, {
          stockQuantity: quantity,
          operationType,
        }),
        {
          retries: 3,
          minTimeout: 1000,
          maxTimeout: 5000,
        }
      );

      logger.info(`Naver stock updated: ${productId}, ${operationType} ${quantity}`);
    } catch (error) {
      logger.error(`Failed to update Naver stock: ${productId}`, error);
      await SystemLog.create({
        level: 'error',
        category: 'naver-product',
        message: 'Failed to update stock',
        context: {
          service: 'NaverProductService',
          method: 'updateStock',
          productId,
        },
        error: {
          name: error.name,
          message: error.message,
        },
        metadata: { quantity, operationType },
      });
      throw error;
    }
  }

  /**
   * 전체 상품 목록 조회 (페이지네이션 처리)
   */
  async *getAllProducts(batchSize = 100): AsyncGenerator<NaverProduct[]> {
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await this.getProducts({ page, size: batchSize });
      
      yield response.products;

      hasMore = response.products.length === batchSize;
      page++;

      // Rate limit을 고려한 딜레이
      if (hasMore) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  }

  /**
   * SKU로 상품 찾기
   */
  async findProductBySku(sku: string): Promise<NaverProduct | null> {
    try {
      const response = await this.getProducts({ searchKeyword: sku });
      
      // sellerManagementCode(SKU)가 정확히 일치하는 상품 찾기
      const product = response.products.find(p => p.sellerManagementCode === sku);
      
      return product || null;
    } catch (error) {
      logger.error(`Failed to find Naver product by SKU: ${sku}`, error);
      return null;
    }
  }
}
