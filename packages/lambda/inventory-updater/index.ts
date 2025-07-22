// packages/lambda/inventory-updater/index.ts
import { SQSEvent, SQSRecord } from 'aws-lambda';
import { MongoClient } from 'mongodb';
import axios from 'axios';

const MONGODB_URI = process.env.MONGODB_URI!;
const NAVER_API_URL = process.env.NAVER_API_URL!;
const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID!;
const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET!;
const SHOPIFY_API_URL = process.env.SHOPIFY_API_URL!;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN!;

let mongoClient: MongoClient;

async function getMongoClient(): Promise<MongoClient> {
  if (!mongoClient) {
    mongoClient = new MongoClient(MONGODB_URI);
    await mongoClient.connect();
  }
  return mongoClient;
}

export const handler = async (event: SQSEvent): Promise<void> => {
  const client = await getMongoClient();
  const db = client.db();

  for (const record of event.Records) {
    try {
      await processRecord(record, db);
    } catch (error) {
      console.error('Error processing record:', error);
      throw error; // Let Lambda retry
    }
  }
};

async function processRecord(record: SQSRecord, db: any): Promise<void> {
  const message = JSON.parse(record.body);
  const { topic, data } = message;

  console.log(`Processing webhook: ${topic}`);

  switch (topic) {
    case 'orders/create':
      await handleOrderCreate(data, db);
      break;
    case 'orders/updated':
      await handleOrderUpdate(data, db);
      break;
    case 'inventory_levels/update':
      await handleInventoryUpdate(data, db);
      break;
    default:
      console.log(`Unhandled topic: ${topic}`);
  }
}

async function handleOrderCreate(order: any, db: any): Promise<void> {
  const mappingCollection = db.collection('productmappings');
  const transactionCollection = db.collection('inventorytransactions');

  for (const lineItem of order.line_items) {
    const sku = lineItem.sku;
    const quantity = lineItem.quantity;

    // Find product mapping
    const mapping = await mappingCollection.findOne({ sku });
    if (!mapping || !mapping.isActive) {
      console.log(`No active mapping found for SKU: ${sku}`);
      continue;
    }

    // Create inventory transaction
    await transactionCollection.insertOne({
      sku,
      platform: 'shopify',
      transactionType: 'sale',
      quantity: -quantity,
      orderId: order.id.toString(),
      orderLineItemId: lineItem.id.toString(),
      performedBy: 'webhook',
      syncStatus: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Update Naver inventory
    await updateNaverInventory(mapping.naverProductId, -quantity);
  }
}

async function updateNaverInventory(productId: string, quantityChange: number): Promise<void> {
  try {
    // First, get current inventory
    const currentInventory = await axios.get(
      `${NAVER_API_URL}/external/v1/products/${productId}/inventory`,
      {
        headers: {
          'Authorization': `Bearer ${NAVER_CLIENT_ID}:${NAVER_CLIENT_SECRET}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const newQuantity = currentInventory.data.quantity + quantityChange;

    // Update inventory
    await axios.put(
      `${NAVER_API_URL}/external/v1/products/${productId}/inventory`,
      {
        quantity: Math.max(0, newQuantity),
      },
      {
        headers: {
          'Authorization': `Bearer ${NAVER_CLIENT_ID}:${NAVER_CLIENT_SECRET}`,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log(`Updated Naver inventory for product ${productId}: ${newQuantity}`);
  } catch (error) {
    console.error('Error updating Naver inventory:', error);
    throw error;
  }
}

async function handleOrderUpdate(order: any, db: any): Promise<void> {
  // Handle order updates (cancellations, refunds, etc.)
  console.log('Order updated:', order.id);
}

async function handleInventoryUpdate(data: any, db: any): Promise<void> {
  // Handle direct inventory updates from Shopify
  console.log('Inventory updated:', data);
}

