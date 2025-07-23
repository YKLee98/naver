// packages/fargate/src/sync-task.ts
import { MongoClient, Db } from 'mongodb';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import axios from 'axios';
import bcrypt from 'bcrypt';
import pLimit from 'p-limit';

interface Secrets {
  MONGODB_URI: string;
  NAVER_CLIENT_ID: string;
  NAVER_CLIENT_SECRET: string;
  NAVER_API_BASE_URL: string;
  SHOPIFY_SHOP_DOMAIN: string;
  SHOPIFY_ACCESS_TOKEN: string;
  EXCHANGE_RATE_API_KEY: string;
}

interface ProductMapping {
  sku: string;
  naverProductId: string;
  shopifyProductId: string;
  shopifyVariantId: string;
  shopifyInventoryItemId: string;
  shopifyLocationId: string;
  status: string;
  priceMargin: number;
}

class SyncTask {
  private secrets: Secrets;
  private db: Db;
  private naverToken: string;
  private exchangeRate: number;
  private syncStats = {
    totalProducts: 0,
    successCount: 0,
    failureCount: 0,
    errors: [] as Array<{ sku: string; error: string }>,
  };

  async initialize(): Promise<void> {
    console.log('Initializing sync task...');
    
    // 1. AWS Secrets Manager에서 자격 증명 가져오기
    this.secrets = await this.getSecrets();
    
    // 2. MongoDB 연결
    const client = new MongoClient(this.secrets.MONGODB_URI);
    await client.connect();
    this.db = client.db();
    
    // 3. 네이버 인증 토큰 획득
    this.naverToken = await this.getNaverToken();
    
    // 4. 환율 정보 가져오기
    this.exchangeRate = await this.getExchangeRate();
    
    console.log('Initialization complete');
  }

  private async getSecrets(): Promise<Secrets> {
    const client = new SecretsManagerClient({ region: process.env.AWS_REGION });
    const command = new GetSecretValueCommand({
      SecretId: process.env.SECRETS_ARN!,
    });
    
    const response = await client.send(command);
    return JSON.parse(response.SecretString!);
  }

  private async getNaverToken(): Promise<string> {
    const timestamp = Date.now().toString();
    const password = `${this.secrets.NAVER_CLIENT_ID}_${timestamp}`;
    const hashed = await bcrypt.hash(password, this.secrets.NAVER_CLIENT_SECRET);
    const signature = Buffer.from(hashed).toString('base64');

    const params = new URLSearchParams({
      client_id: this.secrets.NAVER_CLIENT_ID,
      timestamp,
      client_secret_sign: signature,
      grant_type: 'client_credentials',
      type: 'SELF',
    });

    const response = await axios.post(
      `${this.secrets.NAVER_API_BASE_URL}/external/v1/oauth2/token`,
      params,
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }
    );

    return response.data.access_token;
  }

  private async getExchangeRate(): Promise<number> {
    try {
      // 먼저 DB에서 캐시된 환율 확인
      const rateDoc = await this.db.collection('exchange_rates').findOne({
        fromCurrency: 'KRW',
        toCurrency: 'USD',
        validFrom: { $lte: new Date() },
        validUntil: { $gte: new Date() },
      });

      if (rateDoc) {
        console.log('Using cached exchange rate:', rateDoc.rate);
        return rateDoc.rate;
      }

      // API에서 새로운 환율 가져오기
      const response = await axios.get(
        `https://api.exchangerate-api.com/v4/latest/KRW`,
        {
          params: { access_key: this.secrets.EXCHANGE_RATE_API_KEY },
        }
      );

      const rate = response.data.rates.USD;
      
      // 환율 캐싱 (24시간)
      await this.db.collection('exchange_rates').insertOne({
        fromCurrency: 'KRW',
        toCurrency: 'USD',
        rate,
        source: 'exchangerate-api',
        validFrom: new Date(),
        validUntil: new Date(Date.now() + 24 * 60 * 60 * 1000),
        createdAt: new Date(),
      });

      return rate;
    } catch (error) {
      console.error('Failed to get exchange rate:', error);
      // 폴백 환율 사용
      return 0.00075; // 1 KRW = 0.00075 USD (대략적인 값)
    }
  }

  async syncProducts(): Promise<void> {
    console.log('Starting product sync...');
    
    // 활성 상품 매핑 조회
    const mappings = await this.db
      .collection<ProductMapping>('product_mappings')
      .find({ status: 'ACTIVE', vendor: 'album' })
      .toArray();

    this.syncStats.totalProducts = mappings.length;
    console.log(`Found ${mappings.length} products to sync`);

    // 동시 실행 제한 (네이버 API rate limit 준수)
    const limit = pLimit(2); // 동시에 2개씩만 처리
    
    // 배치 처리를 위한 데이터 수집
    const bulkUpdates: any[] = [];
    
    for (const mapping of mappings) {
      try {
        await limit(async () => {
          // 네이버 상품 정보 조회
          const naverProduct = await this.getNaverProduct(mapping.naverProductId);
          
          if (!naverProduct) {
            throw new Error('Naver product not found');
          }

          // 가격 계산 (KRW -> USD + 마진)
          const shopifyPrice = naverProduct.salePrice * this.exchangeRate * mapping.priceMargin;
          
          // Shopify 업데이트 데이터 준비
          bulkUpdates.push({
            sku: mapping.sku,
            variantId: mapping.shopifyVariantId,
            inventoryItemId: mapping.shopifyInventoryItemId,
            locationId: mapping.shopifyLocationId,
            price: Math.round(shopifyPrice * 100) / 100, // 소수점 2자리
            inventory: naverProduct.stockQuantity,
          });

          // 가격 이력 저장
          await this.savePriceHistory(mapping.sku, {
            naverPrice: naverProduct.salePrice,
            exchangeRate: this.exchangeRate,
            calculatedShopifyPrice: shopifyPrice,
            finalShopifyPrice: Math.round(shopifyPrice * 100) / 100,
            priceMargin: mapping.priceMargin,
          });

          this.syncStats.successCount++;
          
          // Rate limit 준수를 위한 지연
          await this.delay(500);
        });
      } catch (error: any) {
        console.error(`Failed to sync ${mapping.sku}:`, error.message);
        this.syncStats.failureCount++;
        this.syncStats.errors.push({
          sku: mapping.sku,
          error: error.message,
        });
      }
    }

    // Shopify 대량 업데이트 실행
    if (bulkUpdates.length > 0) {
      await this.updateShopifyBulk(bulkUpdates);
    }

    console.log('Product sync completed:', this.syncStats);
  }

  private async getNaverProduct(productId: string): Promise<any> {
    try {
      const response = await axios.get(
        `${this.secrets.NAVER_API_BASE_URL}/external/v1/products/${productId}`,
        {
          headers: {
            Authorization: `Bearer ${this.naverToken}`,
          },
        }
      );
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 401) {
        // 토큰 갱신 후 재시도
        this.naverToken = await this.getNaverToken();
        return this.getNaverProduct(productId);
      }
      throw error;
    }
  }

  private async updateShopifyBulk(updates: any[]): Promise<void> {
    console.log(`Updating ${updates.length} products in Shopify...`);
    
    // GraphQL 뮤테이션 생성
    const mutation = `
      mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
          product {
            id
          }
          productVariants {
            id
            price
            inventoryItem {
              id
              inventoryLevels(first: 1) {
                edges {
                  node {
                    available
                  }
                }
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    // 제품별로 그룹화
    const productGroups = new Map<string, any[]>();
    updates.forEach(update => {
      const productId = `gid://shopify/Product/${update.productId}`;
      if (!productGroups.has(productId)) {
        productGroups.set(productId, []);
      }
      productGroups.get(productId)!.push(update);
    });

    // 각 제품에 대해 업데이트 실행
    for (const [productId, variants] of productGroups) {
      try {
        const variables = {
          productId,
          variants: variants.map(v => ({
            id: `gid://shopify/ProductVariant/${v.variantId}`,
            price: v.price.toString(),
          })),
        };

        await axios.post(
          `https://${this.secrets.SHOPIFY_SHOP_DOMAIN}/admin/api/2024-01/graphql.json`,
          { query: mutation, variables },
          {
            headers: {
              'X-Shopify-Access-Token': this.secrets.SHOPIFY_ACCESS_TOKEN,
              'Content-Type': 'application/json',
            },
          }
        );

        // 재고 업데이트
        for (const variant of variants) {
          await this.updateShopifyInventory(
            variant.inventoryItemId,
            variant.locationId,
            variant.inventory
          );
        }
      } catch (error) {
        console.error(`Failed to update Shopify product ${productId}:`, error);
      }
    }
  }

  private async updateShopifyInventory(
    inventoryItemId: string,
    locationId: string,
    quantity: number
  ): Promise<void> {
    const mutation = `
      mutation inventorySetOnHandQuantities($input: InventorySetOnHandQuantitiesInput!) {
        inventorySetOnHandQuantities(input: $input) {
          inventoryAdjustmentGroup {
            createdAt
            reason
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const variables = {
      input: {
        reason: "Sync from Naver",
        setQuantities: [{
          inventoryItemId: `gid://shopify/InventoryItem/${inventoryItemId}`,
          locationId: `gid://shopify/Location/${locationId}`,
          quantity,
        }],
      },
    };

    await axios.post(
      `https://${this.secrets.SHOPIFY_SHOP_DOMAIN}/admin/api/2024-01/graphql.json`,
      { query: mutation, variables },
      {
        headers: {
          'X-Shopify-Access-Token': this.secrets.SHOPIFY_ACCESS_TOKEN,
          'Content-Type': 'application/json',
        },
      }
    );
  }

  private async savePriceHistory(sku: string, data: any): Promise<void> {
    await this.db.collection('price_histories').insertOne({
      sku,
      ...data,
      currency: 'USD',
      syncStatus: 'completed',
      syncedAt: new Date(),
      createdAt: new Date(),
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async syncNaverOrders(): Promise<void> {
    console.log('Starting Naver order sync...');
    
    try {
      // 마지막 동기화 시간 조회
      const lastSync = await this.db.collection('system_settings').findOne({ key: 'lastOrderSync' });
      const lastSyncTime = lastSync?.value || new Date(Date.now() - 24 * 60 * 60 * 1000); // 기본값: 24시간 전

      // 네이버 주문 조회
      const response = await axios.get(
        `${this.secrets.NAVER_API_BASE_URL}/external/v1/pay-order/seller/orders`,
        {
          params: {
            lastChangedFrom: lastSyncTime.toISOString(),
            lastChangedType: 'PAYED',
            limitCount: 300,
          },
          headers: {
            Authorization: `Bearer ${this.naverToken}`,
          },
        }
      );

      const orders = response.data.data || [];
      console.log(`Found ${orders.length} new orders`);

      for (const order of orders) {
        for (const item of order.orderItems || []) {
          try {
            // SKU로 매핑 찾기
            const mapping = await this.db.collection('product_mappings').findOne({
              sku: item.sellerManagementCode,
            });

            if (!mapping) {
              console.warn(`Mapping not found for SKU: ${item.sellerManagementCode}`);
              continue;
            }

            // Shopify 재고 차감
            await this.updateShopifyInventory(
              mapping.shopifyInventoryItemId,
              mapping.shopifyLocationId,
              -item.quantity // 음수로 차감
            );

            // 트랜잭션 기록
            await this.db.collection('inventory_transactions').insertOne({
              sku: item.sellerManagementCode,
              platform: 'naver',
              transactionType: 'sale',
              quantity: -item.quantity,
              orderId: order.orderId,
              orderLineItemId: item.orderItemId,
              performedBy: 'system',
              syncStatus: 'completed',
              syncedAt: new Date(),
              createdAt: new Date(),
            });
          } catch (error) {
            console.error(`Failed to process order item ${item.orderItemId}:`, error);
          }
        }
      }

      // 마지막 동기화 시간 업데이트
      await this.db.collection('system_settings').updateOne(
        { key: 'lastOrderSync' },
        { $set: { value: new Date() } },
        { upsert: true }
      );

    } catch (error) {
      console.error('Failed to sync Naver orders:', error);
    }
  }

  async run(): Promise<void> {
    try {
      await this.initialize();
      
      // 1. 상품 가격/재고 동기화
      await this.syncProducts();
      
      // 2. 네이버 주문 처리
      await this.syncNaverOrders();
      
      // 3. 결과 저장
      await this.db.collection('sync_logs').insertOne({
        type: 'full_sync',
        stats: this.syncStats,
        exchangeRate: this.exchangeRate,
        completedAt: new Date(),
        createdAt: new Date(),
      });

      console.log('Sync task completed successfully');
      process.exit(0);
    } catch (error) {
      console.error('Sync task failed:', error);
      process.exit(1);
    }
  }
}

// 실행
const task = new SyncTask();
task.run();