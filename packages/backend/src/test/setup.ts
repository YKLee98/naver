// packages/backend/src/test/setup.ts
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { createClient } from 'redis-mock';

let mongoServer: MongoMemoryServer;

// MongoDB setup
beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

// Redis mock setup
jest.mock('redis', () => ({
  createClient: jest.fn(() => createClient()),
}));

// Environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';
process.env.NAVER_CLIENT_ID = 'test-client-id';
process.env.NAVER_CLIENT_SECRET = 'test-client-secret';
process.env.SHOPIFY_SHOP_DOMAIN = 'test-shop.myshopify.com';
process.env.SHOPIFY_ACCESS_TOKEN = 'test-access-token';

