// packages/backend/src/config/redis.ts
import Redis from 'ioredis';
import { logger } from '../utils/logger.js';
import { config } from './index.js';

let redisClient: Redis | MockRedis | null = null;

/**
 * MockRedis class for development/testing when Redis is not available
 */
export class MockRedis {
  private store: Map<string, any> = new Map();
  private ttls: Map<string, number> = new Map();
  private hashes: Map<string, Map<string, string>> = new Map();
  public status: string = 'ready';

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

  async setex(key: string, seconds: number, value: string): Promise<'OK'> {
    this.store.set(key, value);
    this.ttls.set(key, Date.now() + (seconds * 1000));
    return 'OK';
  }

  async del(...keys: string[]): Promise<number> {
    let count = 0;
    for (const key of keys) {
      if (this.store.has(key)) {
        this.store.delete(key);
        this.ttls.delete(key);
        count++;
      }
    }
    return count;
  }

  async exists(...keys: string[]): Promise<number> {
    let count = 0;
    for (const key of keys) {
      this.checkTTL(key);
      if (this.store.has(key)) count++;
    }
    return count;
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
    this.hashes.clear();
    return 'OK';
  }

  // Hash operations
  async hget(key: string, field: string): Promise<string | null> {
    const hash = this.hashes.get(key);
    if (!hash) return null;
    return hash.get(field) || null;
  }

  async hset(key: string, field: string, value: string): Promise<number> {
    let hash = this.hashes.get(key);
    if (!hash) {
      hash = new Map();
      this.hashes.set(key, hash);
    }
    const existed = hash.has(field);
    hash.set(field, value);
    return existed ? 0 : 1;
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    const hash = this.hashes.get(key);
    if (!hash) return {};
    return Object.fromEntries(hash);
  }

  async hdel(key: string, ...fields: string[]): Promise<number> {
    const hash = this.hashes.get(key);
    if (!hash) return 0;
    
    let count = 0;
    for (const field of fields) {
      if (hash.delete(field)) count++;
    }
    return count;
  }

  // List operations
  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    const list = this.store.get(key);
    if (!Array.isArray(list)) return [];
    const end = stop === -1 ? list.length : stop + 1;
    return list.slice(start, end);
  }

  async rpush(key: string, ...values: string[]): Promise<number> {
    let list = this.store.get(key);
    if (!Array.isArray(list)) {
      list = [];
    }
    list.push(...values);
    this.store.set(key, list);
    return list.length;
  }

  async lpush(key: string, ...values: string[]): Promise<number> {
    let list = this.store.get(key);
    if (!Array.isArray(list)) {
      list = [];
    }
    list.unshift(...values);
    this.store.set(key, list);
    return list.length;
  }

  async llen(key: string): Promise<number> {
    const list = this.store.get(key);
    if (!Array.isArray(list)) return 0;
    return list.length;
  }

  // Set operations
  async sadd(key: string, ...members: string[]): Promise<number> {
    let set = this.store.get(key);
    if (!(set instanceof Set)) {
      set = new Set();
    }
    const prevSize = set.size;
    members.forEach(member => set.add(member));
    this.store.set(key, set);
    return set.size - prevSize;
  }

  async smembers(key: string): Promise<string[]> {
    const set = this.store.get(key);
    if (!(set instanceof Set)) return [];
    return Array.from(set);
  }

  async sismember(key: string, member: string): Promise<number> {
    const set = this.store.get(key);
    if (!(set instanceof Set)) return 0;
    return set.has(member) ? 1 : 0;
  }

  // Utility methods
  private checkTTL(key: string): void {
    const expiry = this.ttls.get(key);
    if (expiry && expiry < Date.now()) {
      this.store.delete(key);
      this.ttls.delete(key);
      this.hashes.delete(key);
    }
  }

  async quit(): Promise<'OK'> {
    this.status = 'end';
    return 'OK';
  }

  async info(): Promise<string> {
    return `# Mock Redis
redis_version:mock
redis_mode:standalone
used_memory:${this.store.size}
connected_clients:1`;
  }

  on(event: string, callback: Function): void {
    // Mock event handler
    if (event === 'ready') {
      setTimeout(() => callback(), 0);
    }
  }
}

/**
 * Initialize Redis connection
 */
export async function initializeRedis(): Promise<Redis | MockRedis> {
  if (redisClient) {
    return redisClient;
  }

  try {
    // Skip Redis in test environment
    if (config.isTest) {
      logger.info('🔧 Using MockRedis for test environment');
      redisClient = new MockRedis();
      return redisClient;
    }

    // Try to connect to actual Redis
    logger.info('🔌 Connecting to Redis...');
    
    const client = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.db,
      retryStrategy: (times: number) => {
        if (times > 3) {
          logger.warn('Redis connection failed after 3 attempts, falling back to MockRedis');
          return null; // Stop retrying
        }
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      connectTimeout: 5000,
      lazyConnect: false,
    });

    // Set up event handlers
    client.on('connect', () => {
      logger.info('✅ Redis client connected');
    });

    client.on('ready', () => {
      logger.info('✅ Redis client ready');
    });

    client.on('error', (err) => {
      logger.error('❌ Redis client error:', err);
    });

    client.on('end', () => {
      logger.info('Redis client disconnected');
    });

    // Test the connection
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Redis connection timeout'));
      }, 5000);

      client.ping((err, result) => {
        clearTimeout(timeout);
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });

    redisClient = client;
    logger.info('✅ Redis initialized successfully');
    return client;

  } catch (error) {
    logger.warn('⚠️  Failed to connect to Redis, using MockRedis instead:', error);
    
    // Use MockRedis as fallback
    redisClient = new MockRedis();
    logger.info('✅ MockRedis initialized for development');
    return redisClient;
  }
}

/**
 * Get Redis client instance
 */
export function getRedisClient(): Redis | MockRedis {
  if (!redisClient) {
    logger.warn('Redis not initialized, creating mock client');
    redisClient = new MockRedis();
  }
  return redisClient;
}

/**
 * Close Redis connection
 */
export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    logger.info('Redis connection closed');
  }
}

/**
 * Check if Redis is connected
 */
export function isRedisConnected(): boolean {
  if (!redisClient) {
    return false;
  }
  
  if (redisClient instanceof MockRedis) {
    return redisClient.status === 'ready';
  }
  
  return (redisClient as Redis).status === 'ready';
}

/**
 * Get Redis info
 */
export async function getRedisInfo(): Promise<string> {
  const client = getRedisClient();
  return await client.info();
}

export default {
  initializeRedis,
  getRedisClient,
  closeRedis,
  isRedisConnected,
  getRedisInfo,
  MockRedis,
};