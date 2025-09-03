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
      logger.info(`🔍 [NaverProductService] Searching for SKU: ${sku}`);
      
      // POST /v1/products/search 사용 (baseURL이 /external 포함)
      const requestBody = {
        searchType: 'SELLER_MANAGEMENT_CODE',
        searchKeyword: sku,
        page: 1,
        size: 100, // Increase size to find more products
      };

      const response = await this.axiosInstance.post(
        '/v1/products/search',
        requestBody
      );

      if (response.data && response.data.contents) {
        logger.info(`Found ${response.data.contents.length} products for SKU search: ${sku}`);
        
        // Look for SKU in channelProducts and flatten the structure
        const products: any[] = [];
        
        response.data.contents.forEach((item: any) => {
          // Check if SKU matches in channelProducts
          if (item.channelProducts && item.channelProducts.length > 0) {
            item.channelProducts.forEach((channelProduct: any) => {
              if (channelProduct.sellerManagementCode === sku) {
                // Found exact match in channel product
                logger.info(`Found SKU ${sku} in channel product of originProductNo: ${item.originProductNo}`);
                products.push({
                  ...item,
                  name: channelProduct.name,
                  stockQuantity: channelProduct.stockQuantity,
                  salePrice: channelProduct.salePrice,
                  sellerManagementCode: channelProduct.sellerManagementCode,
                  channelProductNo: channelProduct.channelProductNo
                });
              }
            });
          }
          
          // Also check main product SKU
          if (item.sellerManagementCode === sku) {
            logger.info(`Found SKU ${sku} in main product: ${item.originProductNo}`);
            const channelProduct = item.channelProducts?.[0];
            products.push({
              ...item,
              name: channelProduct?.name || item.name,
              stockQuantity: channelProduct?.stockQuantity || item.stockQuantity,
              salePrice: channelProduct?.salePrice || item.salePrice,
              sellerManagementCode: item.sellerManagementCode
            });
          }
        });
        
        if (products.length > 0) {
          logger.info(`✅ Found ${products.length} products with exact SKU match for: ${sku}`);
        } else {
          logger.warn(`❌ No products found with SKU: ${sku}`);
        }
        
        return products;
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

      // searchKeyword가 있으면 추가 (기본 검색)
      if (options.searchKeyword) {
        requestBody.searchKeyword = options.searchKeyword;
        // searchType이 명시적으로 제공되지 않으면 기본값 사용하지 않음
        // Naver API가 자동으로 상품명 검색을 수행
      }

      // searchType이 명시적으로 제공된 경우에만 추가
      if (options.searchType) {
        requestBody.searchType = options.searchType;
      }

      console.log(`🔍 Naver API Request - searchProducts:`, JSON.stringify(requestBody, null, 2));

      const response = await this.axiosInstance.post(
        '/v1/products/search',
        requestBody
      );

      logger.info(`Naver API Response - searchProducts: ${response.data?.contents?.length || 0} products found`);
      
      if (response.data?.contents?.length > 0) {
        // Log original structure properly
        logger.debug(`First product raw structure:`, response.data.contents[0]);
        
        // Transform the nested structure - find matching channel product by SKU
        response.data.contents = response.data.contents.map((item: any) => {
          if (item.channelProducts && item.channelProducts.length > 0) {
            // Try to find the channel product that matches the search SKU
            let matchingChannelProduct = null;
            
            if (options.searchKeyword && options.searchType === 'SELLER_MANAGEMENT_CODE') {
              matchingChannelProduct = item.channelProducts.find(
                (cp: any) => cp.sellerManagementCode === options.searchKeyword
              );
            }
            
            // If no matching SKU found, use the first channel product as fallback
            const channelProduct = matchingChannelProduct || item.channelProducts[0];
            
            return {
              ...item,
              name: channelProduct.name,
              stockQuantity: channelProduct.stockQuantity,
              salePrice: channelProduct.salePrice,
              deliveryFee: channelProduct.deliveryFee,
              deliveryAttributeType: channelProduct.deliveryAttributeType,
              sellerManagementCode: channelProduct.sellerManagementCode || item.sellerManagementCode || options.searchKeyword,
              channelProductNo: channelProduct.channelProductNo
            };
          }
          return item;
        });
        
        logger.info(`First product sample after transform:`, {
          sellerManagementCode: response.data.contents[0].sellerManagementCode,
          name: response.data.contents[0].name,
          originProductNo: response.data.contents[0].originProductNo,
          stockQuantity: response.data.contents[0].stockQuantity
        });
      }

      if (response.status === 200 && response.data) {
        return response.data;
      }

      // 결과가 없으면 빈 결과 반환
      return { contents: [], totalElements: 0 };
    } catch (error: any) {
      const errorMessage = error?.message || 'Unknown error';
      logger.error(`Error searching products: ${errorMessage}`);
      
      if (error.response?.data) {
        logger.error(`Naver API Error Response:`, error.response.data);
      }

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
      const errorMessage = error?.message || 'Unknown error';
      logger.error(`Error listing products: ${errorMessage}`);

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
        `/v2/products/origin-products/${targetProductNo}`
      );
      return response.data;
    } catch (error: any) {
      const errorMessage = error?.message || 'Unknown error';
      logger.error(`Error getting product ${productId}: ${errorMessage}`);

      if (error.response?.status === 404) {
        return null;
      }

      throw error;
    }
  }

  /**
   * 상품 재고 조회 (개선된 버전)
   */
  async getProductStock(productId: string): Promise<number> {
    try {
      logger.debug(`📊 Getting Naver stock for product ${productId}`);
      
      // 상품 정보 조회
      const product = await this.getProduct(productId);
      
      if (!product) {
        logger.warn(`Product ${productId} not found in Naver`);
        return 0;
      }
      
      const stock = product.stockQuantity || 0;
      logger.debug(`📊 Naver stock for ${productId}: ${stock}`);
      
      return stock;
    } catch (error: any) {
      logger.error(`❌ Failed to get Naver stock for product ${productId}:`, {
        message: error.message || 'Unknown error',
        status: error.response?.status || 'N/A'
      });
      throw error;
    }
  }

  /**
   * SKU로 상품 재고 조회
   */
  async getProductStockBySku(sku: string): Promise<number> {
    try {
      logger.debug(`📊 Getting Naver stock for SKU ${sku}`);
      
      const products = await this.searchProductsBySellerManagementCode(sku);
      
      if (!products || products.length === 0) {
        logger.warn(`No products found for SKU ${sku} in Naver`);
        return 0;
      }
      
      const stock = products[0].stockQuantity || 0;
      logger.debug(`📊 Naver stock for SKU ${sku}: ${stock}`);
      
      return stock;
    } catch (error: any) {
      logger.error(`❌ Failed to get Naver stock for SKU ${sku}:`, {
        message: error.message || 'Unknown error',
        status: error.response?.status || 'N/A'
      });
      return 0;
    }
  }


  /**
   * 상품 재고만 수정 (배송정보 등 다른 설정 보존)
   */
  async updateProductStock(
    productId: string,
    quantity: number
  ): Promise<boolean> {
    try {
      logger.info(`🔄 [STOCK UPDATE] Starting Naver stock update for product ${productId} to ${quantity}`);
      
      // 하드코딩된 매핑 (실제 originProductNo 사용)
      const productMapping: { [key: string]: string } = {
        '12205978733': '12150233672', // EPR 테스트용 상품 A
        '12205984965': '12150234068', // EPR 테스트용 상품 B
      };
      
      let actualOriginProductNo = productMapping[productId];
      
      // 매핑에 없으면 API로 검색
      if (!actualOriginProductNo) {
        logger.info(`🔍 Searching for actual originProductNo using channelProductNo: ${productId}`);
        
        const searchResult = await this.searchProducts({
          searchKeyword: '',
          page: 1,
          size: 100
        });
        
        if (searchResult?.contents) {
          for (const item of searchResult.contents) {
            // channelProducts 확인
            if (item.channelProducts && Array.isArray(item.channelProducts)) {
              for (const cp of item.channelProducts) {
                if (String(cp.channelProductNo) === String(productId) || 
                    String(cp.id) === String(productId)) {
                  actualOriginProductNo = item.originProductNo;
                  logger.info(`✅ Found originProductNo: ${actualOriginProductNo} for channelProductNo: ${productId}`);
                  break;
                }
              }
            }
            
            // 직접 ID 확인
            if (!actualOriginProductNo && 
                (String(item.id) === String(productId) || 
                 String(item.channelProductNo) === String(productId))) {
              actualOriginProductNo = item.originProductNo;
              logger.info(`✅ Found originProductNo: ${actualOriginProductNo} from direct match`);
            }
            
            if (actualOriginProductNo) break;
          }
        }
      } else {
        logger.info(`📦 Using mapped originProductNo: ${actualOriginProductNo} for channelProductNo: ${productId}`);
      }
      
      // originProductNo를 찾지 못하면 입력된 ID를 그대로 사용 (fallback)
      const targetProductNo = actualOriginProductNo || productId;
      logger.info(`📦 Using product ID for update: ${targetProductNo} (original input: ${productId})`);
      
      // 1. v2 API로 상품 전체 정보 조회
      logger.info(`📋 [FETCH] Getting full product info from v2 API for originProductNo: ${targetProductNo}`);
      
      let fullProductInfo: any;
      try {
        const productResponse = await this.axiosInstance.get(
          `/v2/products/origin-products/${targetProductNo}`
        );
        
        logger.info(`✅ [FETCH SUCCESS] Retrieved product info`, {
          status: productResponse.status,
          hasData: !!productResponse.data
        });
        
        fullProductInfo = productResponse.data?.originProduct;
        
        if (!fullProductInfo) {
          logger.error(`❌ [FETCH ERROR] No originProduct in response`, productResponse.data);
          throw new Error('Product information not found in API response');
        }
        
        logger.info(`📦 [PRODUCT INFO]`, {
          name: fullProductInfo.name,
          statusType: fullProductInfo.statusType,
          currentStock: fullProductInfo.stockQuantity,
          hasDetailAttribute: !!fullProductInfo.detailAttribute,
          hasOptions: fullProductInfo.optionInfo?.optionUsable || false
        });
        
      } catch (fetchError: any) {
        logger.error(`❌ [FETCH ERROR] Failed to get product info:`, {
          status: fetchError.response?.status,
          message: fetchError.response?.data?.message || fetchError.message,
          data: fetchError.response?.data
        });
        throw new Error(`Failed to fetch product info: ${fetchError.message}`);
      }
      
      const hasOptions = fullProductInfo?.optionInfo?.optionUsable || false;
      
      // 2. 옵션 상품 처리
      if (hasOptions) {
        logger.info(`📦 [OPTIONS] Product has options, attempting option-stock update`);
        try {
          const optionsResponse = await this.axiosInstance.get(
            `/v1/products/origin-products/${targetProductNo}/options`
          );
          
          if (optionsResponse.data?.options && optionsResponse.data.options.length > 0) {
            logger.info(`📦 [OPTIONS] Found ${optionsResponse.data.options.length} options`);
            const options = optionsResponse.data.options;
            
            const optionUpdateData = {
              optionInfo: options.map((opt: any) => ({
                optionManageCode: opt.optionManageCode || opt.manageCode || opt.id,
                stockQuantity: quantity
              }))
            };
            
            logger.info(`📤 [OPTIONS UPDATE] Sending option update request:`, optionUpdateData);
            
            const response = await this.axiosInstance.put(
              `/v1/products/origin-products/${targetProductNo}/option-stock`,
              optionUpdateData
            );
            
            if (response.status === 200 || response.status === 204) {
              logger.info(`✅ [SUCCESS] Option stock updated for product ${productId}`);
              return true;
            }
          }
        } catch (optionError: any) {
          logger.error(`⚠️ [OPTIONS ERROR] Option update failed, falling back to single product:`, {
            message: optionError.response?.data?.message || optionError.message,
            status: optionError.response?.status
          });
        }
      }

      // 3. 단일 상품 처리 - 재고만 업데이트
      logger.info(`📤 [SINGLE PRODUCT] Updating stock only...`);
      
      // 방법 1: 재고 전용 API 사용 시도
      logger.info(`🔄 [METHOD 1] Trying stock-only update`);
      try {
        // 재고만 업데이트하는 간단한 요청
        const stockOnlyUpdate = {
          stockQuantity: quantity
        };
        
        // 먼저 재고 전용 엔드포인트 시도
        const stockResponse = await this.axiosInstance.patch(
          `/v1/products/origin-products/${targetProductNo}/stock`,
          stockOnlyUpdate
        );
        
        if (stockResponse.status === 200 || stockResponse.status === 204) {
          logger.info(`✅ [METHOD 1 SUCCESS] Stock-only update successful`);
          return true;
        }
      } catch (stockError: any) {
        logger.warn(`⚠️ [METHOD 1 FAILED] Stock-only update failed: ${stockError.message}`);
      }
      
      // 방법 2: 최소한의 필수 필드만 포함한 업데이트
      logger.info(`🔄 [METHOD 2] Trying minimal update with only required fields`);
      try {
        // 기존 데이터를 그대로 사용하되 재고만 변경
        const minimalUpdate = {
          originProduct: {
            ...fullProductInfo,
            stockQuantity: quantity,
            statusType: quantity > 0 ? 'SALE' : 'OUTOFSTOCK'
          }
        };
        
        // 불필요한 필드 제거 (배송정보는 유지)
        delete minimalUpdate.originProduct.channelProducts;
        delete minimalUpdate.originProduct.createdAt;
        delete minimalUpdate.originProduct.updatedAt;
        delete minimalUpdate.originProduct.id;
        delete minimalUpdate.originProduct._id;
        
        const minimalResponse = await this.axiosInstance.put(
          `/v2/products/origin-products/${targetProductNo}`,
          minimalUpdate
        );
        
        if (minimalResponse.status === 200 || minimalResponse.status === 204) {
          logger.info(`✅ [METHOD 2 SUCCESS] Minimal update successful`);
          return true;
        }
      } catch (minimalError: any) {
        logger.warn(`⚠️ [METHOD 2 FAILED] Minimal update failed: ${minimalError.message}`);
      }
      
      // 방법 3: 기존 방식 (필수 필드 포함)
      logger.info(`🔄 [METHOD 3] Trying with required fields`);
      
      // 기존 detailAttribute 추출 및 필수 필드 확인
      const existingDetailAttribute = fullProductInfo.detailAttribute || {};
      
      logger.info(`📋 [DETAIL ATTRIBUTE] Existing fields:`, {
        hasAfterServiceInfo: !!existingDetailAttribute.afterServiceInfo,
        hasOriginAreaInfo: !!existingDetailAttribute.originAreaInfo,
        hasMinorPurchasable: existingDetailAttribute.minorPurchasable !== undefined,
        hasSmartstoreChannelProduct: !!existingDetailAttribute.smartstoreChannelProduct,
        hasNaverShoppingRegistration: existingDetailAttribute.naverShoppingRegistration !== undefined,
        hasChannelNo: !!existingDetailAttribute.channelNo
      });
      
      // 필수 필드들을 모두 포함한 detailAttribute 구성
      const detailAttribute = {
        // 필수 1: afterServiceInfo
        afterServiceInfo: existingDetailAttribute.afterServiceInfo || {
          afterServiceTelephoneNumber: '02-1234-5678',
          afterServiceGuideContent: '고객센터로 문의 바랍니다.'
        },
        
        // 필수 2: originAreaInfo
        originAreaInfo: existingDetailAttribute.originAreaInfo || {
          originAreaCode: '00',
          content: '상세페이지 참조',
          plural: false
        },
        
        // 필수 3: minorPurchasable
        minorPurchasable: existingDetailAttribute.minorPurchasable !== undefined 
          ? existingDetailAttribute.minorPurchasable 
          : true,
        
        // 필수 4: smartstoreChannelProduct
        smartstoreChannelProduct: existingDetailAttribute.smartstoreChannelProduct || {
          channelProductDisplayStatusType: 'ON'
        },
        
        // 필수 5: naverShoppingRegistration
        naverShoppingRegistration: existingDetailAttribute.naverShoppingRegistration !== undefined
          ? existingDetailAttribute.naverShoppingRegistration
          : true,
        
        // 필수 6: channelNo
        channelNo: existingDetailAttribute.channelNo || 1,
        
        // 추가: 기타 기존 필드들도 보존
        ...Object.keys(existingDetailAttribute).reduce((acc, key) => {
          if (!['afterServiceInfo', 'originAreaInfo', 'minorPurchasable', 
                'smartstoreChannelProduct', 'naverShoppingRegistration', 'channelNo'].includes(key)) {
            acc[key] = existingDetailAttribute[key];
          }
          return acc;
        }, {} as any)
      };
      
      // 최종 업데이트 데이터 구성 - 기존 필수 필드들도 포함
      const updateData = {
        originProduct: {
          // 기존 필수 필드들 유지
          name: fullProductInfo.name,
          salePrice: fullProductInfo.salePrice,
          images: fullProductInfo.images || [],
          
          // 재고 관련 필드 업데이트
          stockQuantity: quantity,
          statusType: quantity > 0 ? 'SALE' : 'OUTOFSTOCK',
          
          // detailAttribute 포함
          detailAttribute: detailAttribute
        }
      };
      
      logger.info(`📤 [UPDATE REQUEST] Sending v2 update request for stock: ${quantity}`, {
        stockQuantity: updateData.originProduct.stockQuantity,
        statusType: updateData.originProduct.statusType,
        detailAttributeKeys: Object.keys(updateData.originProduct.detailAttribute)
      });
      
      // v2 API 호출
      logger.info(`📤 [API CALL] Calling PUT /v2/products/origin-products/${productId}`);
      logger.info(`📄 [REQUEST BODY] Full request data:`, JSON.stringify(updateData, null, 2));
      
      const response = await this.axiosInstance.put(
        `/v2/products/origin-products/${targetProductNo}`,
        updateData
      );

      logger.info(`📨 [RESPONSE] API Response:`, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        data: response.data
      });

      if (response.status === 200 || response.status === 204) {
        logger.info(
          `✅ [SUCCESS] Successfully updated Naver stock for product ${productId} to ${quantity}`,
          {
            responseStatus: response.status,
            responseData: response.data
          }
        );
        
        // 업데이트 검증 - 더 긴 대기 시간과 여러 번 시도
        logger.info(`⏳ [VERIFICATION] Starting verification process...`);
        
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const waitTime = attempt * 2000; // 2초, 4초, 6초 대기
            logger.info(`⏳ [VERIFICATION] Attempt ${attempt}/3 - Waiting ${waitTime}ms...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            
            const verifyResponse = await this.axiosInstance.get(
              `/v2/products/origin-products/${targetProductNo}`
            );
            
            const verifiedProduct = verifyResponse.data?.originProduct;
            const updatedStock = verifiedProduct?.stockQuantity;
            const statusType = verifiedProduct?.statusType;
            
            logger.info(`🔍 [VERIFICATION ${attempt}] Current state:`, {
              stockQuantity: updatedStock,
              statusType: statusType,
              expected: quantity
            });
            
            if (updatedStock === quantity) {
              logger.info(`✅ [VERIFIED] Stock update confirmed on attempt ${attempt}: ${updatedStock}`);
              break;
            } else if (attempt === 3) {
              logger.warn(`⚠️ [VERIFICATION FAILED] After 3 attempts - Expected: ${quantity}, Actual: ${updatedStock}`);
              
              // 채널 상품 정보도 확인
              try {
                const channelResponse = await this.axiosInstance.get(
                  `/v1/products/channel-products/${targetProductNo}`
                );
                logger.info(`🔍 [CHANNEL CHECK] Channel product stock:`, {
                  channelStock: channelResponse.data?.stockQuantity,
                  channelStatus: channelResponse.data?.statusType
                });
              } catch (channelErr) {
                logger.debug(`[CHANNEL CHECK] Could not get channel product info`);
              }
            }
          } catch (verifyError: any) {
            logger.warn(`⚠️ [VERIFICATION] Attempt ${attempt} failed:`, verifyError.message);
          }
        }
        
        return true;
      }

      logger.error(`❌ [UNEXPECTED] Unexpected response status: ${response.status}`);
      return false;
      
    } catch (error: any) {
      const errorMessage = error?.response?.data?.message || error?.message || 'Unknown error';
      const errorCode = error?.response?.data?.code || error?.response?.status || 'UNKNOWN';
      const invalidInputs = error?.response?.data?.invalidInputs;
      
      logger.error(
        `❌ [UPDATE FAILED] Failed to update Naver stock for product ${productId}`,
        {
          errorCode,
          errorMessage,
          productId,
          quantity,
          invalidInputs,
          fullError: error?.response?.data || error.message
        }
      );
      
      // 상세한 에러 메시지 생성
      let detailedError = `Failed to update Naver stock: ${errorMessage}`;
      if (invalidInputs && invalidInputs.length > 0) {
        const inputErrors = invalidInputs.map((input: any) => 
          `${input.name}: ${input.message}`
        ).join(', ');
        detailedError += ` (Invalid inputs: ${inputErrors})`;
      }
      
      throw new Error(detailedError);
    }
  }

  /**
   * 상품 가격 수정
   */
  async updateProductPrice(productId: string, price: number): Promise<boolean> {
    try {
      // PUT /v2/products/origin-products/{originProductNo} 사용
      const response = await this.axiosInstance.put(
        `/v2/products/origin-products/${targetProductNo}`,
        {
          salePrice: price,
        }
      );

      return response.status === 200;
    } catch (error) {
      const errorMessage = error?.message || 'Unknown error';
      logger.error(`Error updating product price for ${productId}: ${errorMessage}`);
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
      const errorMessage = error?.message || 'Unknown error';
      logger.error(`Error updating product status for ${productId}: ${errorMessage}`);
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
      const errorMessage = error?.message || 'Unknown error';
      logger.error(`Error getting products: ${errorMessage}`);
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
      const errorMessage = error?.message || 'Unknown error';
      logger.error(`Error getting stock history for ${productId}: ${errorMessage}`);
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
    } catch (error: any) {
      const errorMessage = error?.message || 'Unknown error';
      logger.error(`Error in bulk stock update: ${errorMessage}`);
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
      const errorMessage = error?.message || 'Unknown error';
      logger.error(`Error in bulk price update: ${errorMessage}`);
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
    } catch (error: any) {
      logger.error(`Error getting inventory for ${productId}:`, {
        message: error.message || 'Unknown error',
        status: error.response?.status || 'N/A'
      });
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
    } catch (error: any) {
      const errorMessage = error?.message || 'Unknown error';
      logger.error(`Error updating inventory for ${productId}: ${errorMessage}`);
      throw error;
    }
  }


  /**
   * 채널 상품 검색
   */
  async searchChannelProducts(keyword: string, page: number = 1, size: number = 20): Promise<any[]> {
    try {
      const searchResult = await this.searchProducts({
        searchKeyword: keyword,
        searchType: 'SELLER_MANAGEMENT_CODE',
        page,
        size
      });
      
      // 정확히 일치하는 SKU만 필터링
      if (searchResult?.contents && searchResult.contents.length > 0) {
        const exactMatches = searchResult.contents.filter((product: any) => 
          product.sellerManagementCode === keyword
        );
        
        if (exactMatches.length > 0) {
          return exactMatches;
        }
        
        logger.warn(`No exact match found for SKU: ${keyword}. Found ${searchResult.contents.length} partial matches.`);
      }
      
      return [];
    } catch (error: any) {
      logger.error(`Failed to search channel products:`, error);
      return [];
    }
  }

  /**
   * SKU로 상품 재고 업데이트
   */
  async updateProductStockBySku(sku: string, quantity: number): Promise<boolean> {
    try {
      logger.info(`📦 Starting Naver stock update for SKU ${sku} to ${quantity}`);
      
      // 상품 검색
      const searchResult = await this.searchProducts({
        searchKeyword: sku,
        searchType: 'SELLER_MANAGEMENT_CODE',
        page: 1,
        size: 10
      });
      
      if (!searchResult?.contents || searchResult.contents.length === 0) {
        logger.error(`No Naver product found for SKU: ${sku}`);
        return false;
      }
      
      // SKU가 정확히 일치하는 제품만 찾기 (부분 매칭 제외)
      const product = searchResult.contents.find((p: any) => 
        p.sellerManagementCode === sku
      );
      
      if (!product) {
        logger.error(`No exact match found for SKU: ${sku}. Found ${searchResult.contents.length} partial matches.`);
        return false;
      }
      
      const originProductNo = product.originProductNo;
      
      logger.info(`📦 Found product for SKU ${sku}: originProductNo=${originProductNo}`);
      
      if (!originProductNo) {
        logger.error(`No originProductNo found for SKU ${sku}`);
        return false;
      }
      
      // updateProductStock 메서드 사용 (이미 옵션 처리 로직 포함)
      return await this.updateProductStock(originProductNo, quantity);
      
    } catch (error: any) {
      logger.error(`Failed to update Naver stock for SKU ${sku}:`, error);
      return false;
    }
  }
}
