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
  orderer: {
    name: string;
    email: string;
    safeNumber?: string;
    phoneNumber: string;
  };
  delivery: {
    receiverName: string;
    receiverTel1: string;
    receiverZipCode: string;
    receiverAddress1: string;
    receiverAddress2: string;
    deliveryMessage?: string;
  };
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

    // 응답 인터셉터 - 에러 처리
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 401) {
          // 토큰 갱신 후 재시도
          logger.warn('Naver API token expired, refreshing...');
          await this.authService.refreshToken();
          return this.axiosInstance.request(error.config);
        }
        throw error;
      }
    );
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

      logger.debug(`Fetched ${response.data.lastChangeStatuses.length} orders`);
      return response.data;
    } catch (error) {
      logger.error('Failed to fetch Naver orders', error);
      throw error;
    }
  }

  /**
   * 최근 결제 완료 주문 조회
   */
  async getRecentPaidOrders(since: Date): Promise<NaverOrder[]> {
    const orders: NaverOrder[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await this.getOrders({
        lastChangedFrom: since,
        lastChangedTo: new Date(),
        lastChangedType: 'PAYED',
        page,
        size: 100,
      });

      orders.push(...response.lastChangeStatuses);

      hasMore = response.lastChangeStatuses.length === 100;
      page++;

      // Rate limiting을 위한 딜레이
      if (hasMore) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    return orders;
  }

  /**
   * 주문 상세 조회
   */
  async getOrderDetail(orderId: string): Promise<NaverOrder> {
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
      logger.error(`Failed to fetch order detail: ${orderId}`, error);
      throw error;
    }
  }

  /**
   * 발송 처리
   */
  async dispatchOrder(params: {
    productOrderIds: string[];
    deliveryCompanyCode: string;
    trackingNumber: string;
    dispatchDate?: Date;
  }): Promise<void> {
    await this.rateLimiter.consume();

    try {
      await retry(
        () => this.axiosInstance.put('/external/v1/pay-order/seller/dispatch', {
          dispatchProductOrders: params.productOrderIds.map(id => ({
            productOrderId: id,
            deliveryCompanyCode: params.deliveryCompanyCode,
            trackingNumber: params.trackingNumber,
            dispatchDate: (params.dispatchDate || new Date()).toISOString(),
          })),
        }),
        {
          retries: 3,
          minTimeout: 1000,
          maxTimeout: 5000,
        }
      );

      logger.info(`Dispatched orders: ${params.productOrderIds.join(', ')}`);
    } catch (error) {
      logger.error('Failed to dispatch orders', error);
      throw error;
    }
  }

  /**
   * 주문 취소 승인
   */
  async approveCancellation(productOrderId: string): Promise<void> {
    await this.rateLimiter.consume();

    try {
      await retry(
        () => this.axiosInstance.post(`/external/v1/pay-order/seller/cancel/approve`, {
          productOrderId,
        }),
        {
          retries: 3,
          minTimeout: 1000,
          maxTimeout: 5000,
        }
      );

      logger.info(`Approved cancellation for order: ${productOrderId}`);
    } catch (error) {
      logger.error(`Failed to approve cancellation: ${productOrderId}`, error);
      throw error;
    }
  }

  /**
   * 주문 취소 거부
   */
  async rejectCancellation(productOrderId: string, rejectReason: string): Promise<void> {
    await this.rateLimiter.consume();

    try {
      await retry(
        () => this.axiosInstance.post(`/external/v1/pay-order/seller/cancel/reject`, {
          productOrderId,
          rejectReason,
        }),
        {
          retries: 3,
          minTimeout: 1000,
          maxTimeout: 5000,
        }
      );

      logger.info(`Rejected cancellation for order: ${productOrderId}`);
    } catch (error) {
      logger.error(`Failed to reject cancellation: ${productOrderId}`, error);
      throw error;
    }
  }

  /**
   * 반품 승인
   */
  async approveReturn(productOrderId: string, collectDeliveryCompanyCode?: string): Promise<void> {
    await this.rateLimiter.consume();

    try {
      await retry(
        () => this.axiosInstance.post(`/external/v1/pay-order/seller/return/approve`, {
          productOrderId,
          ...(collectDeliveryCompanyCode && { collectDeliveryCompanyCode }),
        }),
        {
          retries: 3,
          minTimeout: 1000,
          maxTimeout: 5000,
        }
      );

      logger.info(`Approved return for order: ${productOrderId}`);
    } catch (error) {
      logger.error(`Failed to approve return: ${productOrderId}`, error);
      throw error;
    }
  }

  /**
   * 반품 거부
   */
  async rejectReturn(productOrderId: string, rejectReason: string): Promise<void> {
    await this.rateLimiter.consume();

    try {
      await retry(
        () => this.axiosInstance.post(`/external/v1/pay-order/seller/return/reject`, {
          productOrderId,
          rejectReason,
        }),
        {
          retries: 3,
          minTimeout: 1000,
          maxTimeout: 5000,
        }
      );

      logger.info(`Rejected return for order: ${productOrderId}`);
    } catch (error) {
      logger.error(`Failed to reject return: ${productOrderId}`, error);
      throw error;
    }
  }

  /**
   * 교환 승인
   */
  async approveExchange(params: {
    productOrderId: string;
    collectDeliveryCompanyCode?: string;
    reDeliveryCompanyCode: string;
    reDeliveryTrackingNumber: string;
  }): Promise<void> {
    await this.rateLimiter.consume();

    try {
      await retry(
        () => this.axiosInstance.post(`/external/v1/pay-order/seller/exchange/approve`, params),
        {
          retries: 3,
          minTimeout: 1000,
          maxTimeout: 5000,
        }
      );

      logger.info(`Approved exchange for order: ${params.productOrderId}`);
    } catch (error) {
      logger.error(`Failed to approve exchange: ${params.productOrderId}`, error);
      throw error;
    }
  }

  /**
   * 교환 거부
   */
  async rejectExchange(productOrderId: string, rejectReason: string): Promise<void> {
    await this.rateLimiter.consume();

    try {
      await retry(
        () => this.axiosInstance.post(`/external/v1/pay-order/seller/exchange/reject`, {
          productOrderId,
          rejectReason,
        }),
        {
          retries: 3,
          minTimeout: 1000,
          maxTimeout: 5000,
        }
      );

      logger.info(`Rejected exchange for order: ${productOrderId}`);
    } catch (error) {
      logger.error(`Failed to reject exchange: ${productOrderId}`, error);
      throw error;
    }
  }

  /**
   * 주문별 SKU 추출
   */
  extractSkusFromOrder(order: NaverOrder): Array<{ sku: string; quantity: number }> {
    return order.orderItems.map(item => ({
      sku: item.sellerProductCode,
      quantity: item.quantity,
    }));
  }

  /**
   * 주문 상태 확인
   */
  isOrderPaid(order: NaverOrder): boolean {
    return order.orderStatus === 'PAYED';
  }

  /**
   * 주문 취소 여부 확인
   */
  isOrderCanceled(order: NaverOrder): boolean {
    return ['CANCELED', 'RETURNED', 'EXCHANGED'].includes(order.orderStatus);
  }
}