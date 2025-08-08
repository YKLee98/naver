// packages/backend/src/config/redis.ts
import Redis from 'ioredis';
import { logger } from '../utils/logger';

let redisClient: Redis | any = null;

// MockRedis 클래스 (Redis 연결 실패 시 사용)
class MockRedis {
  private store: Map<string, any> = new Map();
  private ttls: Map<string, number> = new Map();

  async get(key: string): Promise<string | null> {
    this.checkTTL(key);
    return this.store.get(key) || null;
  }

  async set(key: string, value: string): Promise<'OK'> {
    this.store.set(key, value);
    return 'OK';
  }

  async setex(key: string, seconds: number, value: string): Promise<'OK'> {
    this.store.set(key, value);
    this.ttls.set(key, Date.now() + (seconds * 1000));
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

  async ping(): Promise<'PONG'> {
    return 'PONG';
  }

  async flushall(): Promise<'OK'> {
    this.store.clear();
    this.ttls.clear();
    return 'OK';
  }

  private checkTTL(key: string): void {
    const expiry = this.ttls.get(key);
    if (expiry && expiry < Date.now()) {
      this.store.delete(key);
      this.ttls.delete(key);
    }
  }

  quit(): Promise<'OK'> {
    return Promise.resolve('OK');
  }
}

/**
 * Redis 초기화 - 실제 Redis 연결 시도 후 실패 시 MockRedis 사용
 */
export async function initializeRedis(): Promise<Redis | MockRedis> {
  if (redisClient) {
    return redisClient;
  }

  try {
    // 실제 Redis 연결 시도
    const client = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0', 10),
      retryStrategy: (times: number) => {
        if (times > 3) {
          logger.warn('Redis connection failed after 3 attempts');
          return null; // 연결 포기
        }
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      connectTimeout: 5000,
      lazyConnect: false,
    });

    // 연결 이벤트 핸들러
    client.on('connect', () => {
      logger.info('Redis client connected');
    });

    client.on('ready', () => {
      logger.info('Redis client ready');
    });

    client.on('error', (err) => {
      logger.error('Redis client error:', err);
    });

    // 연결 테스트
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Redis connection timeout'));
      }, 5000);

      client.ping((err, result) => {
        clearTimeout(timeout);
        if (err) {
          reject(err);
        } else {
          resolve(result);
        }
      });
    });

    redisClient = client;
    logger.info('Redis initialized successfully');
    return client;

  } catch (error) {
    logger.warn('Failed to connect to Redis, using in-memory cache instead:', error);
    
    // MockRedis 사용
    const mockClient = new MockRedis();
    redisClient = mockClient;
    logger.info('Using in-memory cache (MockRedis) for development');
    return mockClient;
  }
}

/**
 * Redis 클라이언트 가져오기
 */
export function getRedisClient(): Redis | MockRedis {
  if (!redisClient) {
    logger.warn('Redis not initialized, creating mock client');
    const mockClient = new MockRedis();
    redisClient = mockClient;
    return mockClient;
  }
  return redisClient;
}

/**
 * Redis 연결 종료
 */
export async function closeRedis(): Promise<void> {
  if (redisClient) {
    if (redisClient instanceof Redis) {
      await redisClient.quit();
    }
    redisClient = null;
    logger.info('Redis connection closed');
  }
}

/**
 * Redis 연결 상태 확인
 */
export function isRedisConnected(): boolean {
  if (!redisClient) {
    return false;
  }
  if (redisClient instanceof Redis) {
    return redisClient.status === 'ready';
  }
  return true; // MockRedis는 항상 연결됨
}

export default {
  initializeRedis,
  getRedisClient,
  closeRedis,
  isRedisConnected,
};