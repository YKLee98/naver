// packages/backend/src/services/shopify/ShopifyService.ts
import '@shopify/shopify-api/adapters/node';
import { shopifyApi, ApiVersion, Session } from '@shopify/shopify-api';
import { RestClient } from '@shopify/shopify-api/rest/admin/2025-04';
import { logger } from '../../utils/logger';
import { shopifyConfig, validateShopifyConfig } from '../../config/shopify.config';

export class ShopifyService {
  protected shopify: any;
  protected session: Session;
  protected client: any;
  private isInitialized: boolean = false;

  constructor() {
    this.initializeShopify();
  }

  private initializeShopify(): void {
    try {
      // Validate configuration
      if (!validateShopifyConfig()) {
        logger.warn('Shopify configuration is incomplete, using mock mode');
        return;
      }

      // Initialize Shopify API with correct parameter names
      this.shopify = shopifyApi({
        apiKey: shopifyConfig.apiKey || 'dummy-api-key',
        apiSecretKey: shopifyConfig.apiSecret || 'dummy-secret',
        scopes: shopifyConfig.scopes,
        hostName: 'localhost:3000',
        apiVersion: ApiVersion.April25,
        isEmbeddedApp: false,
        adminApiAccessToken: shopifyConfig.accessToken, // 이 부분이 중요!
      });

      // Create session for API calls
      this.session = this.createSession();
      
      // Create REST client
      try {
        this.client = new RestClient({
          session: this.session,
          apiVersion: ApiVersion.April25,
        });
      } catch (restError) {
        logger.warn('REST client initialization failed, using GraphQL only', restError);
      }

      this.isInitialized = true;
      logger.info('Shopify service initialized successfully', {
        storeDomain: shopifyConfig.storeDomain,
        apiVersion: shopifyConfig.apiVersion
      });
    } catch (error: any) {
      logger.error('Failed to initialize Shopify service', {
        error: error.message || error
      });
      this.isInitialized = false;
    }
  }

  private createSession(): Session {
    return new Session({
      id: `offline_${shopifyConfig.storeDomain}`,
      shop: shopifyConfig.storeDomain,
      state: 'active',
      isOnline: false,
      accessToken: shopifyConfig.accessToken,
      scope: shopifyConfig.scopes.join(','),
    });
  }

  protected async getGraphQLClient(): Promise<any> {
    if (!this.isInitialized) {
      // Return a mock client if not initialized
      return {
        request: async (query: string, options?: any) => {
          logger.warn('Using mock GraphQL client');
          return { data: {} };
        },
        query: async (options: any) => {
          logger.warn('Using mock GraphQL client query method');
          return { body: { data: {} } };
        }
      };
    }

    if (!this.shopify || !this.session) {
      throw new Error('Shopify service not initialized');
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
      
      // Return mock client on error
      return {
        request: async (query: string, options?: any) => {
          logger.warn('Using fallback mock GraphQL client');
          return { data: {} };
        },
        query: async (options: any) => {
          logger.warn('Using fallback mock GraphQL client query method');
          return { body: { data: {} } };
        }
      };
    }
  }

  protected async getRestClient(): Promise<any> {
    if (!this.client) {
      logger.warn('REST client not initialized, returning mock');
      return {
        get: async () => ({ body: {} }),
        post: async () => ({ body: {} }),
        put: async () => ({ body: {} }),
        delete: async () => ({ body: {} })
      };
    }
    return this.client;
  }

  /**
   * Error logging helper
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
        statusCode: error?.statusCode,
        response: error?.response?.data
      },
      context
    };

    logger.error(`Shopify API error in ${operation}`, errorDetails);
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
    try {
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
          }
        }
      `;

      const response = await client.request(query);
      return response?.shop;
    } catch (error) {
      await this.logError('getShopInfo', error);
      return null;
    }
  }
}