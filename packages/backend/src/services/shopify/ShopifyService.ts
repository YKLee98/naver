// packages/backend/src/services/shopify/ShopifyService.ts
import '@shopify/shopify-api/adapters/node';
import { shopifyApi, ApiVersion, Session } from '@shopify/shopify-api';
import { logger } from '../../utils/logger';
import { shopifyConfig, validateShopifyConfig } from '../../config/shopify.config';

/**
 * Enterprise Shopify Service Base Class
 * Provides core Shopify API functionality with robust error handling
 */
export class ShopifyService {
  protected shopify: any;
  protected session: Session;
  protected client: any;
  private isInitialized: boolean = false;
  private retryCount: number = 0;
  private maxRetries: number = 3;

  constructor() {
    this.initializeShopify();
  }

  /**
   * Initialize Shopify API with proper error handling and fallbacks
   */
  private initializeShopify(): void {
    try {
      // Validate configuration
      if (!validateShopifyConfig()) {
        logger.warn('Shopify configuration is incomplete, using mock mode');
        this.setupMockMode();
        return;
      }

      // Initialize Shopify API
      this.shopify = shopifyApi({
        apiKey: shopifyConfig.apiKey || 'dummy-api-key',
        apiSecretKey: shopifyConfig.apiSecret || 'dummy-secret',
        scopes: shopifyConfig.scopes,
        hostName: process.env.HOST_NAME || 'localhost:3000',
        apiVersion: ApiVersion.April25,
        isEmbeddedApp: false,
        adminApiAccessToken: shopifyConfig.accessToken,
      });

      // Create session for API calls
      this.session = this.createSession();
      
      // Initialize REST client using the new API structure
      this.initializeRestClient();

      this.isInitialized = true;
      logger.info('Shopify service initialized successfully', {
        storeDomain: shopifyConfig.storeDomain,
        apiVersion: shopifyConfig.apiVersion
      });
    } catch (error: any) {
      logger.error('Failed to initialize Shopify service', {
        error: error.message || error,
        stack: error.stack
      });
      this.setupMockMode();
    }
  }

  /**
   * Initialize REST client with proper error handling
   */
  private initializeRestClient(): void {
    try {
      // The new Shopify API structure uses clients property
      if (this.shopify && this.shopify.rest) {
        // For newer versions, REST client is accessed differently
        this.client = {
          get: async (params: any) => {
            return await this.shopify.rest.get({
              session: this.session,
              ...params
            });
          },
          post: async (params: any) => {
            return await this.shopify.rest.post({
              session: this.session,
              ...params
            });
          },
          put: async (params: any) => {
            return await this.shopify.rest.put({
              session: this.session,
              ...params
            });
          },
          delete: async (params: any) => {
            return await this.shopify.rest.delete({
              session: this.session,
              ...params
            });
          }
        };
      } else {
        // Fallback for older API versions or when REST is not available
        logger.warn('REST client not available in current Shopify API version, using GraphQL only');
        this.client = null;
      }
    } catch (error: any) {
      logger.warn('REST client initialization failed, using GraphQL only', {
        error: error.message
      });
      this.client = null;
    }
  }

  /**
   * Setup mock mode for development/testing
   */
  private setupMockMode(): void {
    logger.info('Setting up Shopify service in mock mode');
    this.isInitialized = false;
    
    // Create mock clients
    this.client = this.createMockRestClient();
    this.shopify = {
      clients: {
        Graphql: class {
          constructor() {}
          async request(query: string, options?: any) {
            logger.debug('Mock GraphQL request:', { query, options });
            return { data: {} };
          }
          async query(options: any) {
            logger.debug('Mock GraphQL query:', options);
            return { body: { data: {} } };
          }
        }
      }
    };
  }

  /**
   * Create a valid session for API calls
   */
  private createSession(): Session {
    return new Session({
      id: `offline_${shopifyConfig.storeDomain}`,
      shop: shopifyConfig.storeDomain,
      state: 'active',
      isOnline: false,
      accessToken: shopifyConfig.accessToken || '',
      scope: shopifyConfig.scopes.join(','),
    });
  }

  /**
   * Create mock REST client for development
   */
  private createMockRestClient(): any {
    return {
      get: async (params: any) => {
        logger.debug('Mock REST GET:', params);
        return { body: this.getMockResponse('get', params) };
      },
      post: async (params: any) => {
        logger.debug('Mock REST POST:', params);
        return { body: this.getMockResponse('post', params) };
      },
      put: async (params: any) => {
        logger.debug('Mock REST PUT:', params);
        return { body: this.getMockResponse('put', params) };
      },
      delete: async (params: any) => {
        logger.debug('Mock REST DELETE:', params);
        return { body: { success: true } };
      }
    };
  }

  /**
   * Generate mock responses based on request type
   */
  private getMockResponse(method: string, params: any): any {
    const path = params.path || '';
    
    if (path.includes('products')) {
      return {
        products: [
          {
            id: 1,
            title: 'Mock Product',
            vendor: 'Mock Vendor',
            variants: [{
              id: 1,
              sku: 'MOCK-SKU-001',
              price: '10.00',
              inventory_quantity: 100
            }]
          }
        ]
      };
    }
    
    if (path.includes('inventory')) {
      return {
        inventory_levels: [{
          inventory_item_id: 1,
          location_id: 1,
          available: 100,
          updated_at: new Date().toISOString()
        }]
      };
    }
    
    return { success: true, data: {} };
  }

  /**
   * Get GraphQL client with retry logic
   */
  protected async getGraphQLClient(): Promise<any> {
    if (!this.isInitialized && !this.shopify) {
      return this.createMockGraphQLClient();
    }

    try {
      const client = new this.shopify.clients.Graphql({
        session: this.session,
        apiVersion: ApiVersion.April25,
      });

      return client;
    } catch (error: any) {
      logger.error('Failed to create GraphQL client', {
        error: error.message || error
      });
      
      return this.createMockGraphQLClient();
    }
  }

  /**
   * Create mock GraphQL client
   */
  private createMockGraphQLClient(): any {
    return {
      request: async (query: string, options?: any) => {
        logger.debug('Mock GraphQL request:', { query, options });
        return { data: {} };
      },
      query: async (options: any) => {
        logger.debug('Mock GraphQL query:', options);
        return { body: { data: {} } };
      }
    };
  }

  /**
   * Get REST client
   */
  protected async getRestClient(): Promise<any> {
    if (!this.client) {
      logger.warn('REST client not initialized, returning mock');
      return this.createMockRestClient();
    }
    return this.client;
  }

  /**
   * Execute API call with retry logic
   */
  protected async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T | null> {
    let lastError: any;
    
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await operation();
        this.retryCount = 0; // Reset on success
        return result;
      } catch (error: any) {
        lastError = error;
        
        // Check if error is retryable
        if (this.isRetryableError(error)) {
          const delay = this.calculateRetryDelay(attempt);
          logger.warn(`Retrying ${operationName} after ${delay}ms`, {
            attempt: attempt + 1,
            maxRetries: this.maxRetries,
            error: error.message
          });
          
          await this.delay(delay);
        } else {
          // Non-retryable error, log and return null
          await this.logError(operationName, error);
          return null;
        }
      }
    }
    
    // Max retries exceeded
    await this.logError(operationName, lastError, {
      maxRetriesExceeded: true
    });
    return null;
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: any): boolean {
    const retryableStatusCodes = [429, 500, 502, 503, 504];
    const statusCode = error?.response?.status || error?.statusCode;
    
    if (retryableStatusCodes.includes(statusCode)) {
      return true;
    }
    
    // Check for network errors
    if (error.code === 'ECONNRESET' || 
        error.code === 'ETIMEDOUT' || 
        error.code === 'ENOTFOUND') {
      return true;
    }
    
    return false;
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private calculateRetryDelay(attempt: number): number {
    const baseDelay = 1000; // 1 second
    const maxDelay = 30000; // 30 seconds
    const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
    
    // Add jitter to prevent thundering herd
    const jitter = Math.random() * 1000;
    return delay + jitter;
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Enhanced error logging
   */
  protected async logError(
    operation: string,
    error: any,
    context?: Record<string, any>
  ): Promise<void> {
    const errorDetails = {
      service: 'ShopifyService',
      operation,
      error: {
        message: error?.message || 'Unknown error',
        code: error?.code,
        statusCode: error?.statusCode || error?.response?.status,
        response: error?.response?.data,
        stack: error?.stack
      },
      context,
      timestamp: new Date().toISOString()
    };

    logger.error(`Shopify API error in ${operation}`, errorDetails);

    // TODO: Send to monitoring service
    // await this.sendToMonitoring(errorDetails);
  }

  /**
   * Check if service is properly configured
   */
  public isConfigured(): boolean {
    return this.isInitialized && !!(
      shopifyConfig.storeDomain &&
      shopifyConfig.accessToken &&
      this.shopify &&
      this.session
    );
  }

  /**
   * Get shop information
   */
  public async getShopInfo(): Promise<any> {
    return this.executeWithRetry(async () => {
      const client = await this.getGraphQLClient();
      
      const query = `
        query getShop {
          shop {
            id
            name
            email
            currencyCode
            primaryDomain {
              url
            }
            plan {
              displayName
              partnerDevelopment
              shopifyPlus
            }
            features {
              avalaraAvatax
              eligibleForSubscriptions
              giftCards
              harmonizedSystemCode
              internationalDomains
              internationalPriceOverrides
              internationalPriceRules
              multiLocation
              reports
              sellsSubscriptions
              shopifyPlus
              showMetrics
              storefront
            }
          }
        }
      `;

      const response = await client.request(query);
      return response?.data?.shop;
    }, 'getShopInfo');
  }

  /**
   * Health check for Shopify connection
   */
  public async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    details: any;
  }> {
    try {
      const shopInfo = await this.getShopInfo();
      
      if (shopInfo) {
        return {
          status: 'healthy',
          details: {
            shop: shopInfo.name,
            configured: this.isConfigured(),
            initialized: this.isInitialized
          }
        };
      }
      
      return {
        status: 'degraded',
        details: {
          configured: this.isConfigured(),
          initialized: this.isInitialized,
          message: 'Could not fetch shop info'
        }
      };
    } catch (error: any) {
      return {
        status: 'unhealthy',
        details: {
          configured: this.isConfigured(),
          initialized: this.isInitialized,
          error: error.message
        }
      };
    }
  }
}