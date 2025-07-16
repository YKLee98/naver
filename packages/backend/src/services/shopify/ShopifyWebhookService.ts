// packages/backend/src/services/shopify/ShopifyWebhookService.ts
import { ShopifyService } from './ShopifyService';
import crypto from 'crypto';
import { logger } from '../../utils/logger';

interface WebhookValidation {
  isValid: boolean;
  topic?: string;
  shopDomain?: string;
}

interface Webhook {
  id: number;
  address: string;
  topic: string;
  created_at: string;
  updated_at: string;
  format: string;
  fields: string[];
  metafield_namespaces: string[];
  api_version: string;
}

export class ShopifyWebhookService extends ShopifyService {
  private webhookSecret: string;

  constructor() {
    super();
    this.webhookSecret = process.env.SHOPIFY_WEBHOOK_SECRET!;
  }

  /**
   * 웹훅 서명 검증
   */
  validateWebhook(rawBody: string, headers: any): WebhookValidation {
    const hmacHeader = headers['x-shopify-hmac-sha256'];
    const topic = headers['x-shopify-topic'];
    const shopDomain = headers['x-shopify-shop-domain'];

    if (!hmacHeader || !topic || !shopDomain) {
      return { isValid: false };
    }

    const hash = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(rawBody, 'utf8')
      .digest('base64');

    const isValid = hash === hmacHeader;

    if (!isValid) {
      logger.warn('Invalid webhook signature', { shopDomain, topic });
    }

    return {
      isValid,
      topic,
      shopDomain,
    };
  }

  /**
   * 웹훅 등록
   */
  async registerWebhook(topic: string, address: string): Promise<Webhook> {
    const client = await this.getRestClient();

    try {
      const response = await client.post({
        path: 'webhooks',
        data: {
          webhook: {
            topic,
            address,
            format: 'json',
          },
        },
      });

      logger.info(`Webhook registered: ${topic} -> ${address}`);
      return response.body.webhook as Webhook;
    } catch (error) {
      await this.logError('registerWebhook', error, { topic, address });
      throw error;
    }
  }

  /**
   * 웹훅 목록 조회
   */
  async listWebhooks(): Promise<Webhook[]> {
    const client = await this.getRestClient();

    try {
      const response = await client.get({
        path: 'webhooks',
      });

      return response.body.webhooks as Webhook[];
    } catch (error) {
      await this.logError('listWebhooks', error);
      throw error;
    }
  }

  /**
   * 웹훅 삭제
   */
  async deleteWebhook(webhookId: string): Promise<void> {
    const client = await this.getRestClient();

    try {
      await client.delete({
        path: `webhooks/${webhookId}`,
      });

      logger.info(`Webhook deleted: ${webhookId}`);
    } catch (error) {
      await this.logError('deleteWebhook', error, { webhookId });
      throw error;
    }
  }

  /**
   * 웹훅 업데이트
   */
  async updateWebhook(webhookId: string, address: string): Promise<Webhook> {
    const client = await this.getRestClient();

    try {
      const response = await client.put({
        path: `webhooks/${webhookId}`,
        data: {
          webhook: {
            address,
          },
        },
      });

      logger.info(`Webhook updated: ${webhookId}`);
      return response.body.webhook as Webhook;
    } catch (error) {
      await this.logError('updateWebhook', error, { webhookId, address });
      throw error;
    }
  }

  /**
   * 필수 웹훅 설정
   */
  async setupRequiredWebhooks(baseUrl: string): Promise<void> {
    const requiredWebhooks = [
      { topic: 'orders/paid', path: '/webhooks/orders/paid' },
      { topic: 'orders/cancelled', path: '/webhooks/orders/cancelled' },
      { topic: 'inventory_levels/update', path: '/webhooks/inventory/update' },
      { topic: 'products/update', path: '/webhooks/products/update' },
      { topic: 'products/delete', path: '/webhooks/products/delete' },
    ];

    try {
      const existingWebhooks = await this.listWebhooks();

      for (const webhook of requiredWebhooks) {
        const existingWebhook = existingWebhooks.find(w => w.topic === webhook.topic);
        const webhookUrl = `${baseUrl}${webhook.path}`;
        
        if (!existingWebhook) {
          // 새 웹훅 등록
          await this.registerWebhook(webhook.topic, webhookUrl);
        } else if (existingWebhook.address !== webhookUrl) {
          // 주소가 다른 경우 업데이트
          await this.updateWebhook(existingWebhook.id.toString(), webhookUrl);
        }
      }

      logger.info('Required webhooks setup completed');
    } catch (error) {
      logger.error('Failed to setup webhooks', error);
      throw error;
    }
  }

  /**
   * 모든 웹훅 제거
   */
  async removeAllWebhooks(): Promise<void> {
    try {
      const webhooks = await this.listWebhooks();
      
      for (const webhook of webhooks) {
        await this.deleteWebhook(webhook.id.toString());
      }

      logger.info('All webhooks removed');
    } catch (error) {
      logger.error('Failed to remove webhooks', error);
      throw error;
    }
  }
}