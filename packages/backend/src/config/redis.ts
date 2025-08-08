// packages/backend/src/config/redis.ts

import Redis from 'ioredis';
import { logger } from '../utils/logger';

let redisClient: Redis | null = null;
let isRedisConnected = false;

// Mock Redis 클라이언트 (Redis가 없을 때 사용)
class MockRedis {
  private store: Map<string, any> = new Map();
  private ttls: Map<string, number> = new Map();

  async get(key: string): Promise<string | null> {
    this.checkTTL(key);
    return this.store.get(key) || null;
  }

  async set(key: string, value: string, mode?: string, duration?: number): Promise<'OK'> {
    this.store.set(key, value);
    if (mode === 'EX' && duration) {
      this.ttls.set(key, Date.now() + (duration * 1000));
    }
    return 'OK';
  }

  async del(key: string): Promise<number> {
    const existed = this.store.has(key);
    this.store.delete(key);
    this.ttls.delete(key);
    return existed ? 1 : 0;
  }

  async exists(key: string): Promise<number> {
    this.checkTTL(key);
    return this.store.has(key) ? 1 : 0;
  }

  async expire(key: string, seconds: number): Promise<number> {
    if (this.store.has(key)) {
      this.ttls.set(key, Date.now() + (seconds * 1000));
      return 1;
    }
    return 0;
  }

  async ttl(key: string): Promise<number> {
    const expiry = this.ttls.get(key);
    if (!expiry) return -1;
    const remaining = Math.floor((expiry - Date.now()) / 1000);
    return remaining > 0 ? remaining : -2;
  }

  async keys(pattern: string): Promise<string[]> {
    const keys = Array.from(this.store.keys());
    if (pattern === '*') return keys;
    
    const regex = new RegExp(pattern.replace('*', '.*'));
    return keys.filter(key => regex.test(key));
  }

  async flushall(): Promise<'OK'> {
    this.store.clear();
    this.ttls.clear();
    return 'OK';
  }

  async ping(): Promise<'PONG'> {
    return 'PONG';
  }

  private checkTTL(key: string): void {
    const expiry = this.ttls.get(key);
    if (expiry && expiry < Date.now()) {
      this.store.delete(key);
      this.ttls.delete(key);
    }
  }

  on(event: string, callback: Function): void {
    // Mock event handling
    if (event === 'connect') {
      setTimeout(() => callback(), 0);
    }
  }

  disconnect(): void {
    // Mock disconnect
  }

  quit(): Promise<'OK'> {
    return Promise.resolve('OK');
  }
}

export async function initializeRedis(): Promise<Redis | MockRedis> {
  if (redisClient) {
    return redisClient;
  }

  const redisConfig = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    retryStrategy: (times: number) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
  };

  try {
    // Try to connect to real Redis
    const client = new Redis(redisConfig);
    
    // Set up event handlers
    client.on('connect', () => {
      logger.info('Redis client connected');
      isRedisConnected = true;
    });

    client.on('error', (err) => {
      logger.error('Redis client error:', err);
      isRedisConnected = false;
    });

    client.on('ready', () => {
      logger.info('Redis client ready');
      isRedisConnected = true;
    });

    // Test connection with timeout
    await Promise.race([
      client.ping(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Redis connection timeout')), 5000)
      )
    ]);

    redisClient = client;
    isRedisConnected = true;
    logger.info('Redis initialized successfully');
    return client;

  } catch (error) {
    logger.warn('Failed to connect to Redis, using in-memory cache instead:', error);
    
    // Use mock Redis if real Redis is not available
    const mockClient = new MockRedis() as any;
    redisClient = mockClient;
    isRedisConnected = true; // Mock is always "connected"
    
    logger.info('Using in-memory cache (MockRedis) for development');
    return mockClient;
  }
}

export function getRedisClient(): Redis | MockRedis {
  if (!redisClient) {
    // Return a mock client if Redis is not initialized
    logger.warn('Redis not initialized, creating mock client');
    const mockClient = new MockRedis() as any;
    redisClient = mockClient;
    isRedisConnected = true;
    return mockClient;
  }
  return redisClient;
}

export function isRedisHealthy(): boolean {
  return isRedisConnected;
}

export async function closeRedis(): Promise<void> {
  if (redisClient && redisClient instanceof Redis) {
    await redisClient.quit();
    redisClient = null;
    isRedisConnected = false;
    logger.info('Redis connection closed');
  }
}

// Auto-initialize in development mode
if (process.env.NODE_ENV === 'development') {
  initializeRedis().catch(err => {
    logger.error('Failed to auto-initialize Redis:', err);
  });
}

export default {
  initializeRedis,
  getRedisClient,
  isRedisHealthy,
  closeRedis,
};