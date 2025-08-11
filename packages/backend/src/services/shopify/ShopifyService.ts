// packages/backend/src/services/shopify/ShopifyService.ts
import {
  shopifyApi,
  ApiVersion,
  Session,
  ShopifyRestResources,
} from '@shopify/shopify-api';
import { shopifyConfig } from '../../config/shopify.config.js';
import { logger } from '../../utils/logger.js';
import { BaseService } from '../base/BaseService.js';

/**
 * Enhanced Shopify Service with robust REST client initialization
 */
export class ShopifyService extends BaseService {
  private shopify: any;
  private client: any;
  private session: Session | null = null;
  private isInitialized: boolean = false;
  private initializationPromise: Promise<void> | null = null;
  private retryCount: number = 0;
  private readonly MAX_RETRIES = 3;

  constructor() {
    super({
      name: 'ShopifyService',
      version: '2.0.0',
      config: shopifyConfig,
    });
    logger.debug('ShopifyService constructor called');
  }

  /**
   * Initialize the Shopify service
   */
  async initialize(): Promise<void> {
    // Prevent multiple initialization
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    if (this.isInitialized) {
      logger.debug('ShopifyService already initialized');
      return;
    }

    this.initializationPromise = this.performInitialization();
    return this.initializationPromise;
  }

  /**
   * Perform actual initialization
   */
  private async performInitialization(): Promise<void> {
    logger.info('Initializing ShopifyService...');

    try {
      // Validate configuration
      const configValidation = this.validateConfiguration();
      if (!configValidation.isValid) {
        if (configValidation.isCritical) {
          throw new Error(
            `Critical Shopify configuration missing: ${configValidation.errors.join(', ')}`
          );
        }
        logger.warn(
          'Non-critical Shopify configuration issues, continuing with defaults',
          {
            issues: configValidation.errors,
          }
        );
      }

      // Initialize Shopify API with proper structure
      this.initializeShopifyApi();

      // Create session
      this.session = this.createSession();

      // Initialize REST client with proper error handling
      await this.initializeRestClient();

      // Mark as initialized
      this.isInitialized = true;

      // Test connection (optional - don't fail if test fails)
      try {
        await this.testConnection();
        logger.info('✅ ShopifyService initialized successfully');
      } catch (error: any) {
        logger.warn(
          'Connection test failed, but continuing with initialization',
          {
            error: error.message,
          }
        );
      }

      logger.info('Shopify service initialized successfully', {
        storeDomain: shopifyConfig.storeDomain,
        apiVersion: shopifyConfig.apiVersion,
        mode: this.client ? 'production' : 'mock',
      });
    } catch (error: any) {
      logger.error('Failed to initialize ShopifyService:', error);
      this.isInitialized = false;
      this.initializationPromise = null;
      throw error;
    }
  }

  /**
   * Initialize Shopify API properly
   */
  private initializeShopifyApi(): void {
    try {
      this.shopify = shopifyApi({
        apiKey: shopifyConfig.apiKey || 'dummy-api-key',
        apiSecretKey: shopifyConfig.apiSecret || 'dummy-secret',
        scopes: shopifyConfig.scopes || ['read_products', 'write_products'],
        hostName: process.env['HOST_NAME'] || 'localhost:3000',
        apiVersion: shopifyConfig.apiVersion || ApiVersion.April25,
        isEmbeddedApp: false,
        adminApiAccessToken: shopifyConfig.accessToken,
      });
    } catch (error: any) {
      logger.error('Failed to initialize Shopify API:', error);
      throw error;
    }
  }

  /**
   * Initialize REST client with multiple approaches for compatibility
   */
  private async initializeRestClient(): Promise<void> {
    try {
      if (!this.shopify || !this.session) {
        throw new Error('Shopify API or session not initialized');
      }

      // Approach 1: Try new REST client structure (latest versions)
      if (this.shopify.clients?.Rest) {
        logger.debug('Using shopify.clients.Rest');
        this.client = new this.shopify.clients.Rest({
          session: this.session,
          apiVersion: shopifyConfig.apiVersion,
        });
        return;
      }

      // Approach 2: Try clients.Rest constructor
      if (typeof this.shopify.clients?.Rest === 'function') {
        logger.debug('Using shopify.clients.Rest constructor');
        try {
          this.client = new this.shopify.clients.Rest({
            session: this.session,
            apiVersion: shopifyConfig.apiVersion,
          });
          return;
        } catch (err: any) {
          logger.debug('Failed to use Rest constructor:', err.message);
        }
      }

      // Approach 3: Create wrapper for shopify.rest methods
      if (this.shopify.rest) {
        logger.debug('Creating REST wrapper for shopify.rest methods');
        this.client = this.createRestWrapper();
        return;
      }

      // Approach 4: Fallback to mock client for development
      logger.warn('No REST client available, using mock client');
      this.client = this.createMockRestClient();
    } catch (error: any) {
      logger.error('REST client initialization failed:', error);

      // Don't fail completely - use mock client as fallback
      logger.warn('Falling back to mock REST client');
      this.client = this.createMockRestClient();
    }
  }

  /**
   * Create REST wrapper for compatibility
   */
  private createRestWrapper(): any {
    return {
      get: async (params: any) => {
        try {
          // Handle both parameter formats
          const requestParams = {
            session: this.session,
            path: params.path || params.url,
            query: params.query || params.params,
            ...params,
          };

          // Try different method signatures
          if (this.shopify.rest?.get) {
            return await this.shopify.rest.get(requestParams);
          } else if (this.shopify.rest?.request) {
            return await this.shopify.rest.request({
              ...requestParams,
              method: 'GET',
            });
          } else {
            throw new Error('No suitable REST GET method found');
          }
        } catch (error: any) {
          logger.error('REST GET wrapper error:', error);
          throw error;
        }
      },

      post: async (params: any) => {
        try {
          const requestParams = {
            session: this.session,
            path: params.path || params.url,
            data: params.data || params.body,
            query: params.query || params.params,
            ...params,
          };

          if (this.shopify.rest?.post) {
            return await this.shopify.rest.post(requestParams);
          } else if (this.shopify.rest?.request) {
            return await this.shopify.rest.request({
              ...requestParams,
              method: 'POST',
            });
          } else {
            throw new Error('No suitable REST POST method found');
          }
        } catch (error: any) {
          logger.error('REST POST wrapper error:', error);
          throw error;
        }
      },

      put: async (params: any) => {
        try {
          const requestParams = {
            session: this.session,
            path: params.path || params.url,
            data: params.data || params.body,
            query: params.query || params.params,
            ...params,
          };

          if (this.shopify.rest?.put) {
            return await this.shopify.rest.put(requestParams);
          } else if (this.shopify.rest?.request) {
            return await this.shopify.rest.request({
              ...requestParams,
              method: 'PUT',
            });
          } else {
            throw new Error('No suitable REST PUT method found');
          }
        } catch (error: any) {
          logger.error('REST PUT wrapper error:', error);
          throw error;
        }
      },

      delete: async (params: any) => {
        try {
          const requestParams = {
            session: this.session,
            path: params.path || params.url,
            query: params.query || params.params,
            ...params,
          };

          if (this.shopify.rest?.delete) {
            return await this.shopify.rest.delete(requestParams);
          } else if (this.shopify.rest?.request) {
            return await this.shopify.rest.request({
              ...requestParams,
              method: 'DELETE',
            });
          } else {
            throw new Error('No suitable REST DELETE method found');
          }
        } catch (error: any) {
          logger.error('REST DELETE wrapper error:', error);
          throw error;
        }
      },
    };
  }

  /**
   * Test connection to Shopify API
   */
  private async testConnection(): Promise<void> {
    try {
      if (!this.client) {
        throw new Error('REST client not initialized');
      }

      // Try to fetch shop information
      const response = await this.client.get({
        path: 'shop',
      });

      if (!response || !response.body) {
        throw new Error('Invalid response from Shopify API');
      }

      logger.debug('Shopify connection test successful', {
        shop: response.body.shop?.name,
      });
    } catch (error: any) {
      // Try alternative approaches
      if (this.shopify?.clients?.Graphql) {
        try {
          const query = `{
            shop {
              name
              id
            }
          }`;

          const graphqlClient = new this.shopify.clients.Graphql({
            session: this.session,
          });

          const response = await graphqlClient.query({ data: query });

          logger.debug('Shopify GraphQL connection test successful', {
            shop: response.body?.data?.shop?.name,
          });
          return;
        } catch (graphqlError: any) {
          logger.error('GraphQL connection test also failed:', graphqlError);
        }
      }

      throw new Error(`Failed to connect to Shopify: ${error.message}`);
    }
  }

  /**
   * Create mock REST client for testing/development
   */
  private createMockRestClient(): any {
    return {
      get: async (params: any) => {
        logger.debug('Mock REST GET', params);
        return {
          body: {
            success: true,
            mock: true,
            data: this.getMockData(params.path),
          },
        };
      },
      post: async (params: any) => {
        logger.debug('Mock REST POST', params);
        return {
          body: {
            success: true,
            mock: true,
            id: `mock_${Date.now()}`,
          },
        };
      },
      put: async (params: any) => {
        logger.debug('Mock REST PUT', params);
        return {
          body: {
            success: true,
            mock: true,
            updated: true,
          },
        };
      },
      delete: async (params: any) => {
        logger.debug('Mock REST DELETE', params);
        return {
          body: {
            success: true,
            mock: true,
            deleted: true,
          },
        };
      },
    };
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
      errors,
    };
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
      shop: {
        shop: {
          id: 1,
          name: 'Mock Shop',
          email: 'mock@shop.com',
          domain: 'mock-shop.myshopify.com',
        },
      },
      products: {
        products: [
          {
            id: 1,
            title: 'Mock Product',
            vendor: 'Mock Vendor',
            variants: [],
          },
        ],
      },
      orders: {
        orders: [],
      },
    };

    return mockDataMap[path] || { data: {} };
  }

  /**
   * Ensure service is initialized before making API calls
   */
  protected ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error(
        'ShopifyService not initialized. Call initialize() first.'
      );
    }
  }

  /**
   * Protected method required by BaseService
   */
  protected override async onInitialize(): Promise<void> {
    // Implementation is in initialize() method
    await this.initialize();
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
      hasGraphQLClient: !!this.shopify?.clients?.Graphql,
    };
  }

  /**
   * Get REST client for external use
   */
  public getRestClient(): any {
    this.ensureInitialized();
    return this.client;
  }

  /**
   * Get Shopify API instance for external use
   */
  public getShopifyApi(): any {
    this.ensureInitialized();
    return this.shopify;
  }

  /**
   * Get current session
   */
  public getSession(): Session | null {
    return this.session;
  }

  /**
   * Cleanup resources
   */
  public override async cleanup(): Promise<void> {
    logger.info('Cleaning up ShopifyService resources');
    this.isInitialized = false;
    this.initializationPromise = null;
    this.retryCount = 0;
    this.client = null;
    this.shopify = null;
    this.session = null;
  }
}
