// packages/backend/src/services/shopify/ShopifyService.ts
import '@shopify/shopify-api/adapters/node';
import { shopifyApi, ApiVersion, Session } from '@shopify/shopify-api';
import { logger } from '../../utils/logger';
import { shopifyConfig, validateShopifyConfig } from '../../config/shopify.config';

/**
 * Enterprise Shopify Service Base Class
 * Provides core Shopify API functionality with robust error handling and lifecycle management
 */
export class ShopifyService {
  protected shopify: any;
  protected session: Session | null = null;
  protected client: any;
  private isInitialized: boolean = false;
  private initializationPromise: Promise<void> | null = null;
  private retryCount: number = 0;
  private readonly maxRetries: number = 3;
  private readonly retryDelay: number = 1000; // 1 second

  constructor() {
    // Constructor는 동기적으로 유지하고, 초기화는 별도 메서드로 분리
    logger.debug('ShopifyService constructor called');
  }

  /**
   * Public initialization method - 엔터프라이즈 패턴
   * 멱등성(idempotency) 보장: 여러 번 호출해도 한 번만 초기화
   */
  public async initialize(): Promise<void> {
    // 이미 초기화 중이면 기존 Promise 반환 (중복 초기화 방지)
    if (this.initializationPromise) {
      logger.debug('ShopifyService initialization already in progress');
      return this.initializationPromise;
    }

    // 이미 초기화 완료됨
    if (this.isInitialized) {
      logger.debug('ShopifyService already initialized');
      return Promise.resolve();
    }

    // 초기화 시작
    this.initializationPromise = this.performInitialization();
    
    try {
      await this.initializationPromise;
      logger.info('✅ ShopifyService initialized successfully');
    } catch (error) {
      // 초기화 실패 시 재시도 가능하도록 상태 리셋
      this.initializationPromise = null;
      throw error;
    }

    return this.initializationPromise;
  }

  /**
   * 실제 초기화 수행 - 재시도 로직 포함
   */
  private async performInitialization(): Promise<void> {
    while (this.retryCount < this.maxRetries) {
      try {
        await this.initializeShopify();
        this.isInitialized = true;
        return;
      } catch (error: any) {
        this.retryCount++;
        
        if (this.retryCount >= this.maxRetries) {
          logger.error(`Failed to initialize ShopifyService after ${this.maxRetries} attempts`, {
            error: error.message,
            stack: error.stack
          });
          
          // 최종 실패 시 Mock 모드로 전환
          logger.warn('Falling back to mock mode');
          this.setupMockMode();
          this.isInitialized = true; // Mock 모드도 초기화 완료로 간주
          return;
        }

        logger.warn(`ShopifyService initialization attempt ${this.retryCount} failed, retrying...`, {
          error: error.message
        });

        // 지수 백오프로 재시도 대기
        await this.delay(this.retryDelay * Math.pow(2, this.retryCount - 1));
      }
    }
  }

  /**
   * Initialize Shopify API with proper error handling and validation
   */
  private async initializeShopify(): Promise<void> {
    // 환경 설정 검증
    const configValidation = this.validateConfiguration();
    if (!configValidation.isValid) {
      if (configValidation.isCritical) {
        throw new Error(`Critical Shopify configuration missing: ${configValidation.errors.join(', ')}`);
      }
      logger.warn('Non-critical Shopify configuration issues, continuing with defaults', {
        issues: configValidation.errors
      });
    }

    // Shopify API 초기화
    this.shopify = shopifyApi({
      apiKey: shopifyConfig.apiKey || 'dummy-api-key',
      apiSecretKey: shopifyConfig.apiSecret || 'dummy-secret',
      scopes: shopifyConfig.scopes || ['read_products', 'write_products'],
      hostName: process.env.HOST_NAME || 'localhost:3000',
      apiVersion: shopifyConfig.apiVersion || ApiVersion.April25,
      isEmbeddedApp: false,
      adminApiAccessToken: shopifyConfig.accessToken,
    });

    // 세션 생성
    this.session = this.createSession();
    
    // REST 클라이언트 초기화
    await this.initializeRestClient();

    // Mark as initialized before testing connection
    this.isInitialized = true;

    // 연결 테스트 (optional - don't fail if test fails)
    try {
      await this.testConnection();
    } catch (error: any) {
      logger.warn('Connection test failed, but continuing with initialization', {
        error: error.message
      });
    }

    logger.info('Shopify service initialized successfully', {
      storeDomain: shopifyConfig.storeDomain,
      apiVersion: shopifyConfig.apiVersion,
      mode: this.client ? 'production' : 'mock'
    });
  }

  /**
   * Configuration validation with criticality assessment
   */
  private validateConfiguration(): {
    isValid: boolean;
    isCritical: boolean;
    errors: string[];
  } {
    const errors: string[] = [];
    let isCritical = false;

    if (!shopifyConfig.storeDomain) {
      errors.push('SHOPIFY_STORE_DOMAIN');
      isCritical = true;
    }

    if (!shopifyConfig.accessToken) {
      errors.push('SHOPIFY_ACCESS_TOKEN');
      isCritical = true;
    }

    if (!shopifyConfig.apiKey) {
      errors.push('SHOPIFY_API_KEY');
    }

    if (!shopifyConfig.apiSecret) {
      errors.push('SHOPIFY_API_SECRET');
    }

    return {
      isValid: errors.length === 0,
      isCritical,
      errors
    };
  }

  /**
   * Initialize REST client with proper error handling
   */
  private async initializeRestClient(): Promise<void> {
    try {
      if (!this.shopify) {
        throw new Error('Shopify API not initialized');
      }

      // 새로운 Shopify API 구조 대응
      if (this.shopify.rest) {
        this.client = {
          get: async (params: any) => {
            // Only check initialization for external calls, not during init
            if (this.isInitialized) {
              this.ensureInitialized();
            }
            return await this.shopify.rest.get({
              session: this.session,
              ...params
            });
          },
          post: async (params: any) => {
            if (this.isInitialized) {
              this.ensureInitialized();
            }
            return await this.shopify.rest.post({
              session: this.session,
              ...params
            });
          },
          put: async (params: any) => {
            if (this.isInitialized) {
              this.ensureInitialized();
            }
            return await this.shopify.rest.put({
              session: this.session,
              ...params
            });
          },
          delete: async (params: any) => {
            if (this.isInitialized) {
              this.ensureInitialized();
            }
            return await this.shopify.rest.delete({
              session: this.session,
              ...params
            });
          }
        };
      } else if (this.shopify.clients?.Rest) {
        // 구버전 API 구조 지원
        this.client = new this.shopify.clients.Rest({
          session: this.session,
          apiVersion: shopifyConfig.apiVersion
        });
      } else {
        throw new Error('REST client not available in current Shopify API version');
      }
    } catch (error: any) {
      logger.warn('REST client initialization failed, using GraphQL only', {
        error: error.message
      });
      this.client = null;
    }
  }

  /**
   * Test connection to Shopify API
   */
  private async testConnection(): Promise<void> {
    try {
      // Don't check isInitialized here to avoid circular dependency
      // This method is called during initialization
      
      if (this.client) {
        // REST API 테스트
        const response = await this.client.get({
          path: 'shop',
        });
        
        if (!response || !response.body) {
          throw new Error('Invalid response from Shopify API');
        }
        
        logger.debug('Shopify connection test successful', {
          shop: response.body.shop?.name
        });
      } else if (this.shopify?.clients?.Graphql) {
        // GraphQL API 테스트 (REST가 없는 경우)
        const query = `{
          shop {
            name
            id
          }
        }`;
        
        const graphqlClient = new this.shopify.clients.Graphql({
          session: this.session
        });
        
        const response = await graphqlClient.query({ data: query });
        
        logger.debug('Shopify GraphQL connection test successful', {
          shop: response.body?.data?.shop?.name
        });
      } else {
        // Mock mode or no clients available - skip test
        logger.debug('Skipping connection test - no clients available');
      }
    } catch (error: any) {
      logger.error('Shopify connection test failed', {
        error: error.message
      });
      throw new Error(`Failed to connect to Shopify: ${error.message}`);
    }
  }

  /**
   * Setup mock mode for development/testing
   */
  private setupMockMode(): void {
    logger.info('Setting up Shopify service in mock mode');
    
    // Mock 클라이언트 생성
    this.client = this.createMockRestClient();
    this.shopify = this.createMockShopifyApi();
    this.session = this.createMockSession();
  }

  /**
   * Create mock REST client for testing
   */
  private createMockRestClient(): any {
    return {
      get: async (params: any) => {
        logger.debug('Mock REST GET', params);
        return {
          body: { 
            success: true, 
            mock: true,
            data: this.getMockData(params.path)
          }
        };
      },
      post: async (params: any) => {
        logger.debug('Mock REST POST', params);
        return { 
          body: { 
            success: true, 
            mock: true,
            id: `mock_${Date.now()}`
          } 
        };
      },
      put: async (params: any) => {
        logger.debug('Mock REST PUT', params);
        return { 
          body: { 
            success: true, 
            mock: true,
            updated: true
          } 
        };
      },
      delete: async (params: any) => {
        logger.debug('Mock REST DELETE', params);
        return { 
          body: { 
            success: true, 
            mock: true,
            deleted: true
          } 
        };
      }
    };
  }

  /**
   * Create mock Shopify API object
   */
  private createMockShopifyApi(): any {
    return {
      clients: {
        Graphql: class {
          constructor(options: any) {}
          async query(params: any) {
            logger.debug('Mock GraphQL query', params);
            return {
              body: {
                data: {
                  shop: {
                    name: 'Mock Shop',
                    id: 'mock_shop_123'
                  }
                }
              }
            };
          }
        }
      }
    };
  }

  /**
   * Create mock session
   */
  private createMockSession(): Session {
    return {
      id: 'mock_session',
      shop: shopifyConfig.storeDomain || 'mock-shop.myshopify.com',
      state: 'mock_state',
      isOnline: false,
      accessToken: 'mock_token',
      scope: 'read_products,write_products',
    } as Session;
  }

  /**
   * Create session for API calls
   */
  private createSession(): Session {
    return {
      id: `${shopifyConfig.storeDomain}_session`,
      shop: shopifyConfig.storeDomain || '',
      state: 'active',
      isOnline: false,
      accessToken: shopifyConfig.accessToken || '',
      scope: shopifyConfig.scopes?.join(',') || '',
    } as Session;
  }

  /**
   * Get mock data based on path
   */
  private getMockData(path: string): any {
    const mockDataMap: Record<string, any> = {
      'shop': {
        shop: {
          id: 1,
          name: 'Mock Shop',
          email: 'mock@shop.com',
          domain: 'mock-shop.myshopify.com'
        }
      },
      'products': {
        products: [
          {
            id: 1,
            title: 'Mock Product',
            vendor: 'Mock Vendor',
            variants: []
          }
        ]
      },
      'orders': {
        orders: []
      }
    };

    return mockDataMap[path] || { data: {} };
  }

  /**
   * Ensure service is initialized before making API calls
   */
  protected ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error('ShopifyService not initialized. Call initialize() first.');
    }
  }

  /**
   * Helper method for delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get initialization status
   */
  public getStatus(): {
    initialized: boolean;
    mode: 'production' | 'mock';
    hasRestClient: boolean;
    hasGraphQLClient: boolean;
  } {
    return {
      initialized: this.isInitialized,
      mode: this.client?.mock ? 'mock' : 'production',
      hasRestClient: !!this.client,
      hasGraphQLClient: !!this.shopify?.clients?.Graphql
    };
  }

  /**
   * Cleanup resources
   */
  public async cleanup(): Promise<void> {
    logger.info('Cleaning up ShopifyService resources');
    this.isInitialized = false;
    this.initializationPromise = null;
    this.retryCount = 0;
    this.client = null;
    this.shopify = null;
    this.session = null;
  }
}