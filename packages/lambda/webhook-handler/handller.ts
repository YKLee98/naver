import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { MongoClient, Db } from 'mongodb';
import crypto from 'crypto';

const sqsClient = new SQSClient({ region: process.env.AWS_REGION });
const secretsClient = new SecretsManagerClient({ region: process.env.AWS_REGION });

let db: Db | null = null;
let cachedSecrets: any = null;

interface WebhookPayload {
  id: number;
  email: string;
  created_at: string;
  updated_at: string;
  line_items: Array<{
    id: number;
    variant_id: number;
    quantity: number;
    sku: string;
    price: string;
  }>;
  financial_status: string;
  name: string;
}

/**
 * 시크릿 가져오기 (캐싱 적용)
 */
async function getSecrets(): Promise<any> {
  if (cachedSecrets) {
    return cachedSecrets;
  }

  try {
    const command = new GetSecretValueCommand({
      SecretId: process.env.SECRETS_ARN!,
    });
    
    const response = await secretsClient.send(command);
    cachedSecrets = JSON.parse(response.SecretString!);
    
    return cachedSecrets;
  } catch (error) {
    console.error('Failed to retrieve secrets:', error);
    throw error;
  }
}

/**
 * MongoDB 연결 (연결 재사용)
 */
async function getDatabase(): Promise<Db> {
  if (db) {
    return db;
  }

  const secrets = await getSecrets();
  const client = new MongoClient(secrets.MONGODB_URI, {
    maxPoolSize: 1,
    serverSelectionTimeoutMS: 5000,
  });

  await client.connect();
  db = client.db();
  
  return db;
}

/**
 * Shopify 웹훅 서명 검증
 */
function verifyWebhookSignature(
  rawBody: string,
  signature: string,
  secret: string
): boolean {
  const hash = crypto
    .createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('base64');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(hash)
  );
}

/**
 * 멱등성 체크
 */
async function checkIdempotency(webhookId: string): Promise<boolean> {
  const database = await getDatabase();
  const collection = database.collection('webhook_idempotency');
  
  try {
    const result = await collection.insertOne({
      webhookId,
      processedAt: new Date(),
      ttl: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24시간 TTL
    });
    
    return result.acknowledged;
  } catch (error: any) {
    if (error.code === 11000) {
      // 중복 키 에러 - 이미 처리됨
      console.log(`Webhook ${webhookId} already processed`);
      return false;
    }
    throw error;
  }
}

/**
 * SQS로 메시지 전송
 */
async function sendToSQS(
  messageBody: any,
  messageAttributes: Record<string, any>
): Promise<void> {
  const command = new SendMessageCommand({
    QueueUrl: process.env.SQS_QUEUE_URL!,
    MessageBody: JSON.stringify(messageBody),
    MessageAttributes: Object.entries(messageAttributes).reduce((acc, [key, value]) => {
      acc[key] = {
        DataType: 'String',
        StringValue: String(value),
      };
      return acc;
    }, {} as any),
  });

  await sqsClient.send(command);
}

/**
 * Lambda 핸들러
 */
export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  console.log('Webhook received:', {
    headers: event.headers,
    path: event.path,
  });

  try {
    // 헤더 추출
    const webhookId = event.headers['x-shopify-webhook-id'];
    const topic = event.headers['x-shopify-topic'];
    const shopDomain = event.headers['x-shopify-shop-domain'];
    const hmacHeader = event.headers['x-shopify-hmac-sha256'];

    if (!webhookId || !topic || !shopDomain || !hmacHeader) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing required headers' }),
      };
    }

    // 시크릿 가져오기
    const secrets = await getSecrets();

    // 서명 검증
    const isValid = verifyWebhookSignature(
      event.body!,
      hmacHeader,
      secrets.SHOPIFY_WEBHOOK_SECRET
    );

    if (!isValid) {
      console.error('Invalid webhook signature');
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Invalid signature' }),
      };
    }

    // 멱등성 체크
    const shouldProcess = await checkIdempotency(webhookId);
    if (!shouldProcess) {
      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Already processed' }),
      };
    }

    // 웹훅 타입별 처리
    const payload = JSON.parse(event.body!) as WebhookPayload;
    
    switch (topic) {
      case 'orders/paid':
        await handleOrderPaid(payload, webhookId);
        break;
      
      case 'orders/cancelled':
        await handleOrderCancelled(payload, webhookId);
        break;
      
      case 'inventory_levels/update':
        await handleInventoryUpdate(payload, webhookId);
        break;
      
      default:
        console.log(`Unhandled webhook topic: ${topic}`);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Webhook processed' }),
    };

  } catch (error) {
    console.error('Webhook processing error:', error);
    
    // 에러가 발생해도 200 반환 (재시도 방지)
    return {
      statusCode: 200,
      body: JSON.stringify({ error: 'Internal error' }),
    };
  }
};

/**
 * 주문 결제 완료 처리
 */
async function handleOrderPaid(
  payload: WebhookPayload,
  webhookId: string
): Promise<void> {
  console.log('Processing order paid:', payload.name);

  // 각 라인 아이템에 대해 SQS 메시지 전송
  for (const item of payload.line_items) {
    if (!item.sku || item.quantity <= 0) {
      continue;
    }

    await sendToSQS(
      {
        action: 'SYNC_INVENTORY_FROM_SHOPIFY',
        orderId: payload.id.toString(),
        orderNumber: payload.name,
        lineItem: {
          variantId: item.variant_id,
          sku: item.sku,
          quantity: item.quantity,
        },
        webhookId,
        timestamp: new Date().toISOString(),
      },
      {
        webhookTopic: 'orders/paid',
        sku: item.sku,
      }
    );
  }
}

/**
 * 주문 취소 처리
 */
async function handleOrderCancelled(
  payload: any,
  webhookId: string
): Promise<void> {
  console.log('Processing order cancelled:', payload.name);

  // 재고 복원을 위한 메시지 전송
  for (const item of payload.line_items) {
    if (!item.sku || item.quantity <= 0) {
      continue;
    }

    await sendToSQS(
      {
        action: 'RESTORE_INVENTORY_FROM_CANCELLATION',
        orderId: payload.id.toString(),
        orderNumber: payload.name,
        lineItem: {
          variantId: item.variant_id,
          sku: item.sku,
          quantity: item.quantity,
        },
        webhookId,
        timestamp: new Date().toISOString(),
      },
      {
        webhookTopic: 'orders/cancelled',
        sku: item.sku,
      }
    );
  }
}

/**
 * 재고 업데이트 처리
 */
async function handleInventoryUpdate(
  payload: any,
  webhookId: string
): Promise<void> {
  console.log('Processing inventory update:', payload);

  await sendToSQS(
    {
      action: 'INVENTORY_LEVEL_UPDATE',
      inventoryUpdate: payload,
      webhookId,
      timestamp: new Date().toISOString(),
    },
    {
      webhookTopic: 'inventory_levels/update',
    }
  );
}
