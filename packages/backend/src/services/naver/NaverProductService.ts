// packages/backend/src/services/naver/NaverProductService.ts
import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { NaverAuthService } from './NaverAuthService';
import { NaverRateLimiter } from './NaverRateLimiter';
import { logger } from '../../utils/logger';
import { AppError } from '../../utils/errors';

interface NaverProduct {
  productId: string;
  name: string;
  salePrice: number;
  stockQuantity: number;
  productStatusType: string;
  saleStartDate: string;
  saleEndDate: string;
  sellerManagementCode?: string;
  images: {
    imageUrl: string;
    imageOrder: number;
  }[];
}

interface NaverInventoryUpdate {
  productId: string;
  stockQuantity: number;
}

interface NaverProductListResponse {
  contents: NaverProduct[];
  total: number;
  page: number;
  size: number;
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
    this.apiClient.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
      const headers = await this.authService.getAuthHeaders();
      
      // 헤더 병합을 위한 안전한 방식
      Object.keys(headers).forEach(key => {
        config.headers[key] = headers[key];
      });
      
      return config;
    });

    // 응답 인터셉터 - 에러 처리
    this.apiClient.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 401) {
          // 토큰 갱신 후 재시도
          logger.warn('Naver API token expired, refreshing...');
          await this.authService.refreshToken();
          
          const originalRequest = error.config;
          const headers = await this.authService.getAuthHeaders();
          
          // 재시도 요청에 새 헤더 적용
          Object.keys(headers).forEach(key => {
            originalRequest.headers[key] = headers[key];
          });
          
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
    searchKeyword?: string;
  }): Promise<NaverProductListResponse> {
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
 * SKU로 상품 검색
 */
async searchProductsBySku(sku: string): Promise<any[]> {
  try {
    const headers = await this.authService.getAuthHeaders();
    
    // 네이버 상품 조회 API
    const response = await axios.get(
      `${this.apiBaseUrl}/external/v2/products`,
      {
        headers,
        params: {
          // 판매자 관리 코드(SKU)로 검색
          sellerManagementCode: sku,
        },
      }
    );

    if (response.data.contents && response.data.contents.length > 0) {
      return response.data.contents;
    }

    // 부분 일치 검색
    const allProductsResponse = await axios.get(
      `${this.apiBaseUrl}/external/v2/products`,
      {
        headers,
        params: {
          page: 1,
          size: 100,
        },
      }
    );

    // SKU가 포함된 상품 필터링
    const filteredProducts = allProductsResponse.data.contents.filter((product: any) => 
      product.sellerManagementCode && 
      product.sellerManagementCode.toLowerCase().includes(sku.toLowerCase())
    );

    return filteredProducts;
  } catch (error) {
    logger.error('Failed to search products by SKU:', error);
    throw new Error('Failed to search Naver products');
  }
}

/**
 * 상품 재고 조회
 */
async getProductStock(productNo: string): Promise<number> {
  try {
    const headers = await this.authService.getAuthHeaders();
    
    const response = await axios.get(
      `${this.apiBaseUrl}/external/v2/products/${productNo}`,
      { headers }
    );

    return response.data.stockQuantity || 0;
  } catch (error) {
    logger.error('Failed to get product stock:', error);
    throw new Error('Failed to get product stock');
  }
}

/**
 * 재고 업데이트
 */
async updateStock(productNo: string, quantity: number): Promise<void> {
  try {
    const headers = await this.authService.getAuthHeaders();
    
    await axios.put(
      `${this.apiBaseUrl}/external/v2/products/${productNo}/stock`,
      {
        stockQuantity: quantity
      },
      { headers }
    );

    logger.info(`Updated stock for product ${productNo} to ${quantity}`);
  } catch (error) {
    logger.error('Failed to update stock:', error);
    throw new Error('Failed to update stock');
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
   * 재고 수량 업데이트 (단일 상품)
   */
  async updateStock(
    productId: string,
    quantity: number,
    operation: 'ADD' | 'SUBTRACT' | 'SET'
  ): Promise<void> {
    await this.rateLimiter.consume();

    try {
      // 현재 재고 조회 (SET이 아닌 경우)
      let newQuantity = quantity;
      
      if (operation !== 'SET') {
        const currentStock = await this.getInventory([productId]);
        const currentQuantity = currentStock.get(productId) || 0;
        
        if (operation === 'ADD') {
          newQuantity = currentQuantity + quantity;
        } else if (operation === 'SUBTRACT') {
          newQuantity = Math.max(0, currentQuantity - quantity);
        }
      }

      await this.updateInventory([
        {
          productId,
          stockQuantity: newQuantity,
        },
      ]);

      logger.info(`Updated stock for product ${productId}: ${operation} ${quantity} (new: ${newQuantity})`);
    } catch (error) {
      logger.error(`Failed to update stock for ${productId}:`, error);
      throw new AppError('Failed to update stock on Naver', 500);
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

  /**
   * 상품 검색 (키워드 기반)
   * 네이버 API가 직접적인 검색을 지원하지 않는 경우 클라이언트 측 필터링
   */
  async searchProducts(
    keyword: string,
    params?: {
      page?: number;
      size?: number;
    }
  ): Promise<NaverProductListResponse> {
    const products = await this.getProducts({
      ...params,
      searchKeyword: keyword,
    });

    // 클라이언트 측 필터링 (API가 검색을 지원하지 않는 경우)
    if (keyword && products.contents) {
      const filtered = products.contents.filter(product => 
        product.name.toLowerCase().includes(keyword.toLowerCase()) ||
        product.productId.includes(keyword) ||
        product.sellerManagementCode?.includes(keyword)
      );

      return {
        ...products,
        contents: filtered,
        total: filtered.length,
      };
    }

    return products;
  }
}