// packages/backend/src/services/naver/NaverOrderService.ts
import { AxiosInstance } from 'axios';
import { NaverAuthService } from './NaverAuthService';
import { NaverRateLimiter } from './NaverRateLimiter';
import { logger } from '@/utils/logger';
import { retry } from '@/utils/retry';
import axios from 'axios';

interface NaverOrder {
  orderId: string;
  orderNo: string;
  paymentDate: string;
  orderStatus: string;
  totalPaymentAmount: number;
  orderItems: Array<{
    productOrderId: string;
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    sellerProductCode: string;
  }>;
}

interface NaverOrderListResponse {
  timestamp: string;
  totalCount: number;
  lastChangeStatuses: NaverOrder[];
}

export class NaverOrderService {
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

    // 인터셉터 설정
    this.axiosInstance.interceptors.request.use(async (config) => {
      const headers = await this.authService.getAuthHeaders();
      config.headers = { ...config.headers, ...headers };
      return config;
    });
  }

  /**
   * 주문 목록 조회
   */
  async getOrders(params: {
    lastChangedFrom: Date;
    lastChangedTo: Date;
    lastChangedType?: 'PAYED' | 'DELIVERED' | 'CANCELED';
    page?: number;
    size?: number;
  }): Promise<NaverOrderListResponse> {
    await this.rateLimiter.consume();

    const queryParams = new URLSearchParams({
      lastChangedFrom: params.lastChangedFrom.toISOString(),
      lastChangedTo: params.lastChangedTo.toISOString(),
      ...(params.lastChangedType && { lastChangedType: params.lastChangedType }),
      page: (params.page || 1).toString(),
      size: (params.size || 100).toString(),
    });

    try {
      const response = await retry(
        () => this.axiosInstance.get(`/external/v1/pay-order/seller/orders?${queryParams}`),
        {
          retries: 3,
          minTimeout: 1000,
          maxTimeout: 5000,
        }
      );

      return response.data;
    } catch (error) {
      logger.error('Failed to fetch Naver orders', error);
      throw error;
    }
  }

  /**
   * 주문 상세 조회
   */
  async getOrder(orderId: string): Promise<NaverOrder> {
    await this.rateLimiter.consume();

    try {
      const response = await retry(
        () => this.axiosInstance.get(`/external/v1/pay-order/seller/orders/${orderId}`),
        {
          retries: 3,
          minTimeout: 1000,
          maxTimeout: 5000,
        }
      );

      return response.data;
    } catch (error) {
      logger.error(`Failed to fetch Naver order: ${orderId}`, error);
      throw error;
    }
  }

  /**
   * 발주 확인
   */
  async acknowledgeOrder(productOrderId: string): Promise<void> {
    await this.rateLimiter.consume();

    try {
      await retry(
        () => this.axiosInstance.post(
          `/external/v1/pay-order/seller/product-orders/${productOrderId}/acknowledge`
        ),
        {
          retries: 3,
          minTimeout: 1000,
          maxTimeout: 5000,
        }
      );

      logger.info(`Naver order acknowledged: ${productOrderId}`);
    } catch (error) {
      logger.error(`Failed to acknowledge Naver order: ${productOrderId}`, error);
      throw error;
    }
  }

  /**
   * 최근 결제 완료 주문 조회
   */
  async getRecentPaidOrders(since: Date): Promise<NaverOrder[]> {
    const now = new Date();
    const orders: NaverOrder[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await this.getOrders({
        lastChangedFrom: since,
        lastChangedTo: now,
        lastChangedType: 'PAYED',
        page,
        size: 100,
      });

      orders.push(...response.lastChangeStatuses);
      hasMore = response.lastChangeStatuses.length === 100;
      page++;

      // Rate limit 고려
      if (hasMore) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    return orders;
  }
}
