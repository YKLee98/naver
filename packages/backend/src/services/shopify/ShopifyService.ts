// packages/backend/src/services/shopify/ShopifyService.ts
import { shopifyApi } from '@shopify/shopify-api';
import '@shopify/shopify-api/adapters/node';
import { logger } from '../../utils/logger';
import { SystemLog } from '../../models';

export class ShopifyService {
  protected shopDomain: string;
  protected accessToken: string;
  protected shopify: ReturnType<typeof shopifyApi>;

  constructor() {
    this.shopDomain = process.env.SHOPIFY_SHOP_DOMAIN!;
    this.accessToken = process.env.SHOPIFY_ACCESS_TOKEN!;

    // Shopify API 초기화
    this.shopify = shopifyApi({
      apiKey: process.env.SHOPIFY_API_KEY!,
      apiSecretKey: process.env.SHOPIFY_API_SECRET!,
      scopes: ['read_products', 'write_products', 'read_inventory', 'write_inventory', 'read_orders'],
      hostName: process.env.HOST_NAME!,
      apiVersion: (process.env.SHOPIFY_API_VERSION as import('@shopify/shopify-api').ApiVersion) || '2025-04',
      isEmbeddedApp: false,
      isCustomStoreApp: true, // Private app 사용 시
    });
  }

  /**
   * REST API 클라이언트 생성
   */
  protected async getRestClient() {
    const session = this.shopify.session.customAppSession(this.shopDomain);
    session.accessToken = this.accessToken;
    
    return new this.shopify.clients.Rest({ session });
  }

  /**
   * GraphQL 클라이언트 생성
   */
  protected async getGraphQLClient() {
    const session = this.shopify.session.customAppSession(this.shopDomain);
    session.accessToken = this.accessToken;
    
    return new this.shopify.clients.Graphql({ session });
  }

  /**
   * REST API 호출 예제
   */
  async getProducts() {
    try {
      const client = await this.getRestClient();
      const response = await client.get({
        path: 'products',
      });
      return response.body;
    } catch (error) {
      await this.logError('getProducts', error);
      throw error;
    }
  }

  /**
   * GraphQL API 호출 예제
   */
  async getProductsGraphQL() {
    try {
      const client = await this.getGraphQLClient();
      const response = await client.query({
        data: `{
          products(first: 10) {
            edges {
              node {
                id
                title
                handle
              }
            }
          }
        }`,
      });
      return response.body;
    } catch (error) {
      await this.logError('getProductsGraphQL', error);
      throw error;
    }
  }

  /**
   * 에러 로깅
   */
  protected async logError(method: string, error: any, context?: any) {
    logger.error(`Shopify API error in ${method}`, error);
    await SystemLog.create({
      level: 'error',
      category: 'shopify-api',
      message: `Error in ${method}`,
      context: {
        service: 'ShopifyService',
        method,
        ...context,
      },
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: error.code,
      },
    });
  }
}