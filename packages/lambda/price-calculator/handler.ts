import { SQSEvent, Context } from 'aws-lambda';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { MongoClient, Db } from 'mongodb';
import axios from 'axios';

const secretsClient = new SecretsManagerClient({ region: process.env.AWS_REGION });

let db: Db | null = null;
let cachedSecrets: any = null;
let cachedExchangeRate: { rate: number; timestamp: number } | null = null;

interface PriceUpdateMessage {
  action: 'CALCULATE_PRICE';
  sku: string;
  naverPrice: number;
  margin?: number;
}

/**
 * 환율 조회 (캐싱 적용)
 */
async function getExchangeRate(apiKey: string): Promise<number> {
  // 캐시 확인 (1시간)
  if (cachedExchangeRate && Date.now() - cachedExchangeRate.timestamp < 3600000) {
    return cachedExchangeRate.rate;
  }

  const response = await axios.get(
    `https://api.exchangerate-api.com/v4/latest/KRW`,
    {
      params: { access_key: apiKey },
    }
  );

  const rate = response.data.rates.USD;
  
  // 캐시 업데이트
  cachedExchangeRate = {
    rate,
    timestamp: Date.now(),
  };

  return rate;
}

/**
 * Shopify 가격 계산
 */
function calculateShopifyPrice(
  naverPrice: number,
  exchangeRate: number,
  margin: number = 1.15
): number {
  const usdPrice = naverPrice * exchangeRate;
  const finalPrice = usdPrice * margin;
  return Math.round(finalPrice * 100) / 100;
}

/**
 * Lambda 핸들러
 */
export const handler = async (
  event: SQSEvent,
  context: Context
): Promise<any> => {
  const results = {
    batchItemFailures: [] as { itemIdentifier: string }[],
  };

  const secrets = await getSecrets();
  const database = await getDatabase();
  
  for (const record of event.Records) {
    try {
      const message = JSON.parse(record.body) as PriceUpdateMessage;
      
      // 환율 조회
      const exchangeRate = await getExchangeRate(secrets.EXCHANGE_RATE_API_KEY);
      
      // 가격 계산
      const shopifyPrice = calculateShopifyPrice(
        message.naverPrice,
        exchangeRate,
        message.margin
      );
      
      // 가격 이력 저장
      const priceHistoryCollection = database.collection('price_history');
      await priceHistoryCollection.insertOne({
        sku: message.sku,
        naverPrice: message.naverPrice,
        exchangeRate,
        calculatedShopifyPrice: shopifyPrice,
        finalShopifyPrice: shopifyPrice,
        priceMargin: message.margin || 1.15,
        currency: 'USD',
        syncStatus: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      
      console.log(`Price calculated for ${message.sku}: ${shopifyPrice} USD`);
      
    } catch (error) {
      console.error('Failed to process price calculation:', error);
      results.batchItemFailures.push({
        itemIdentifier: record.messageId,
      });
    }
  }

  return results;
};

async function getSecrets(): Promise<any> {
  if (cachedSecrets) {
    return cachedSecrets;
  }

  const command = new GetSecretValueCommand({
    SecretId: process.env.SECRETS_ARN!,
  });
  
  const response = await secretsClient.send(command);
  cachedSecrets = JSON.parse(response.SecretString!);
  
  return cachedSecrets;
}

async function getDatabase(): Promise<Db> {
  if (db) {
    return db;
  }

  const secrets = await getSecrets();
  const client = new MongoClient(secrets.MONGODB_URI);

  await client.connect();
  db = client.db();
  
  return db;
}
