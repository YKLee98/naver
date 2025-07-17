import Redis from 'ioredis';
import { logger } from '../utils/logger';

let redisClient: Redis;

export function connectRedis(): Redis {
  if (redisClient) {
    return redisClient;
  }

  const redisConfig = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0', 10),
    // 재연결 설정
    retryStrategy: (times: number) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    // 연결 설정
    connectTimeout: 10000,
    maxRetriesPerRequest: 3,
    // 성능 설정
    enableReadyCheck: true,
    enableOfflineQueue: true,
  };

  redisClient = new Redis(redisConfig);

  // 이벤트 리스너
  redisClient.on('connect', () => {
    logger.info('Redis client connected');
  });

  redisClient.on('ready', () => {
    logger.info('Redis client ready');
  });

  redisClient.on('error', (error) => {
    logger.error('Redis client error:', error);
  });

  redisClient.on('close', () => {
    logger.warn('Redis client closed');
  });

  redisClient.on('reconnecting', () => {
    logger.info('Redis client reconnecting');
  });

  // Graceful shutdown
  process.on('SIGINT', async () => {
    await redisClient.quit();
    logger.info('Redis connection closed through app termination');
  });

  return redisClient;
}

export function getRedisClient(): Redis {
  if (!redisClient) {
    throw new Error('Redis client not initialized. Call connectRedis() first.');
  }
  return redisClient;
}

export async function disconnectRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    logger.info('Redis connection closed');
  }
}

// Redis 헬퍼 함수들
export async function cacheGet<T>(key: string): Promise<T | null> {
  const client = getRedisClient();
  const value = await client.get(key);
  
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return value as unknown as T;
  }
}

export async function cacheSet(
  key: string,
  value: any,
  ttl?: number
): Promise<void> {
  const client = getRedisClient();
  const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
  
  if (ttl) {
    await client.setex(key, ttl, stringValue);
  } else {
    await client.set(key, stringValue);
  }
}

export async function cacheDel(key: string): Promise<void> {
  const client = getRedisClient();
  await client.del(key);
}

export async function cacheExists(key: string): Promise<boolean> {
  const client = getRedisClient();
  const exists = await client.exists(key);
  return exists === 1;
}



