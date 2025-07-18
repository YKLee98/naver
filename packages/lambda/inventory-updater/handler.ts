import { SQSEvent, SQSRecord, Context } from 'aws-lambda';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { MongoClient, Db } from 'mongodb';
import axios from 'axios';
import crypto from 'crypto';

const secretsClient = new SecretsManagerClient({ region: process.env.AWS_REGION });

let db: Db | null = null;
let cachedSecrets: any = null;

interface InventoryUpdateMessage {
  action: string;
  orderId: string;
  orderNumber: string;
  lineItem: {
    variantId: number;
    sku: string;
    quantity: number;
  };
  webhookId: string;
  timestamp: string;
}

/**
 * 시크릿 가져오기
 */
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

/**
 * MongoDB 연결
 */
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

/**
 * 네이버 전자서명 생성
 */
async function generateNaverSignature(
  clientId: string,
  clientSecret: string,
  timestamp: string
): Promise<string> {
  const bcrypt = require('bcryptjs');
  const password = `${clientId}_${timestamp}`;
  const hashed = await bcrypt.hash(password, clientSecret);
  return Buffer.from(hashed).toString('base64');
}

/**
 * 네이버 액세스 토큰 획득
 */
async function getNaverAccessToken(secrets: any): Promise<string> {
  const timestamp = Date.now().toString();
  const signature = await generateNaverSignature(
    secrets.NAVER_CLIENT_ID,
    secrets.NAVER_CLIENT_SECRET,
    timestamp
  );

  const params = new URLSearchParams({
    client_id: secrets.NAVER_CLIENT_ID,
    timestamp,
    client_secret_sign: signature,
    grant_type: 'client_credentials',
    type: 'SELF',
  });

  const response = await axios.post(
    `${secrets.NAVER_API_BASE_URL}/external/v1/oauth2/token`,
    params,
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  );

  return response.data.access_token;
}

/**
 * 재고 업데이트 처리
 */
async function processInventoryUpdate(
  message: InventoryUpdateMessage
): Promise<void> {
  console.log('Processing inventory update:', message);

  const database = await getDatabase();
  const mappingCollection = database.collection('product_mappings');
  const transactionCollection = database.collection('inventory_transactions');

  // SKU로 매핑 정보 조회
  const mapping = await mappingCollection.findOne({ sku: message.lineItem.sku });
  
  if (!mapping) {
    console.error(`Mapping not found for SKU: ${message.lineItem.sku}`);
    throw new Error(`Mapping not found for SKU: ${message.lineItem.sku}`);
  }

  // 멱등성 체크
  const existingTransaction = await transactionCollection.findOne({
    orderId: message.orderId,
    orderLineItemId: message.lineItem.variantId.toString(),
    transactionType: 'sale',
  });

  if (existingTransaction) {
    console.log('Transaction already processed:', message.orderId);
    return;
  }

  // 네이버 재고 차감
  const secrets = await getSecrets();
  const accessToken = await getNaverAccessToken(secrets);

  const operationType = message.action === 'RESTORE_INVENTORY_FROM_CANCELLATION' 
    ? 'ADD' 
    : 'SUBTRACT';

  await axios.put(
    `${secrets.NAVER_API_BASE_URL}/external/v1/products/${mapping.naverProductId}/stock`,
    {
      stockQuantity: message.lineItem.quantity,
      operationType,
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  // 트랜잭션 기록
  await transactionCollection.insertOne({
    sku: message.lineItem.sku,
    platform: 'shopify',
    transactionType: 'sale',
    quantity: operationType === 'ADD' ? message.lineItem.quantity : -message.lineItem.quantity,
    previousQuantity: 0, // TODO: 실제 이전 수량 조회
    newQuantity: 0, // TODO: 새 수량 계산
    orderId: message.orderId,
    orderLineItemId: message.lineItem.variantId.toString(),
    performedBy: 'webhook',
    syncStatus: 'completed',
    syncedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  console.log(`Inventory updated for SKU ${message.lineItem.sku}`);
}

/**
 * Lambda 핸들러
 */
export const handler = async (
  event: SQSEvent,
  context: Context
): Promise<any> => {
  console.log(`Processing ${event.Records.length} messages`);

  const results = {
    batchItemFailures: [] as { itemIdentifier: string }[],
  };

  for (const record of event.Records) {
    try {
      const message = JSON.parse(record.body) as InventoryUpdateMessage;
      await processInventoryUpdate(message);
      
    } catch (error) {
      console.error('Failed to process message:', error);
      results.batchItemFailures.push({
        itemIdentifier: record.messageId,
      });
    }
  }

  return results;
};
