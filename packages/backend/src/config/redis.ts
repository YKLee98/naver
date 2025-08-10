// packages/backend/src/config/redis.ts
import Redis from 'ioredis';
import { logger } from '../utils/logger.js';

let redisClient: Redis | null = null;

/**
 * MockRedis 클래스 - Redis 연결 실패 시 fallback
 */
class MockRedis {
  private store: Map<string, any> = new Map();
  private ttls: Map<string, number> = new Map();
  private hashes: Map<string, Map<string, string>> = new Map();
  private lists: Map<string, string[]> = new Map();

  async get(key: string): Promise<string | null> {
    this.checkTTL(key);
    return this.store.get(key) || null;
  }

  async set(key: string, value: string, mode?: string, duration?: number): Promise<'OK'> {
    this.store.set(key, value);
    if (mode === 'EX' && duration) {
      this.ttls.set(key, Date.now() + (duration * 1000));
    } else if (mode === 'PX' && duration) {
      this.ttls.set(key, Date.now() + duration);
    }
    return 'OK';
  }

  async setex(key: string, seconds: number, value: string): Promise<'OK'> {
    this.store.set(key, value);
    this.ttls.set(key, Date.now() + (seconds * 1000));
    return 'OK';
  }

  async del(...keys: string[]): Promise<number> {
    let deleted = 0;
    for (const key of keys) {
      if (this.store.has(key)) {
        this.store.delete(key);
        this.ttls.delete(key);
        deleted++;
      }
      if (this.hashes.has(key)) {
        this.hashes.delete(key);
        deleted++;
      }
      if (this.lists.has(key)) {
        this.lists.delete(key);
        deleted++;
      }
    }
    return deleted;
  }

  async exists(...keys: string[]): Promise<number> {
    let count = 0;
    for (const key of keys) {
      this.checkTTL(key);
      if (this.store.has(key) || this.hashes.has(key) || this.lists.has(key)) {
        count++;
      }
    }
    return count;
  }

  async expire(key: string, seconds: number): Promise<number> {
    if (this.store.has(key) || this.hashes.has(key) || this.lists.has(key)) {
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

  async ping(message?: string): Promise<string> {
    return message || 'PONG';
  }

  async flushall(): Promise<'OK'> {
    this.store.clear();
    this.ttls.clear();
    this.hashes.clear();
    this.lists.clear();
    return 'OK';
  }

  // Hash operations
  async hget(key: string, field: string): Promise<string | null> {
    this.checkTTL(key);
    const hash = this.hashes.get(key);
    if (!hash) return null;
    return hash.get(field) || null;
  }

  async hset(key: string, field: string, value: string): Promise<number> {
    this.checkTTL(key);
    let hash = this.hashes.get(key);
    if (!hash) {
      hash = new Map();
      this.hashes.set(key, hash);
    }
    const isNew = !hash.has(field);
    hash.set(field, value);
    return isNew ? 1 : 0;
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    this.checkTTL(key);
    const hash = this.hashes.get(key);
    if (!hash) return {};
    return Object.fromEntries(hash);
  }

  async hdel(key: string, ...fields: string[]): Promise<number> {
    this.checkTTL(key);
    const hash = this.hashes.get(key);
    if (!hash) return 0;
    let deleted = 0;
    for (const field of fields) {
      if (hash.delete(field)) deleted++;
    }
    return deleted;
  }

  // List operations
  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    this.checkTTL(key);
    const list = this.lists.get(key);
    if (!list) return [];
    const end = stop === -1 ? list.length : stop + 1;
    return list.slice(start, end);
  }

  async rpush(key: string, ...values: string[]): Promise<number> {
    this.checkTTL(key);
    let list = this.lists.get(key);
    if (!list) {
      list = [];
      this.lists.set(key, list);
    }
    list.push(...values);
    return list.length;
  }

  async lpush(key: string, ...values: string[]): Promise<number> {
    this.checkTTL(key);
    let list = this.lists.get(key);
    if (!list) {
      list = [];
      this.lists.set(key, list);
    }
    list.unshift(...values.reverse());
    return list.length;
  }

  async llen(key: string): Promise<number> {
    this.checkTTL(key);
    const list = this.lists.get(key);
    return list ? list.length : 0;
  }

  async info(): Promise<string> {
    return 'redis_version:mock\nredis_mode:standalone\nmock_redis:true';
  }

  async quit(): Promise<'OK'> {
    return 'OK';
  }

  private checkTTL(key: string): void {
    const expiry = this.ttls.get(key);
    if (expiry && expiry < Date.now()) {
      this.store.delete(key);
      this.hashes.delete(key);
      this.lists.delete(key);
      this.ttls.delete(key);
    }
  }

  // Additional properties to match Redis interface
  status: string = 'ready';
  
  on(event: string, callback: Function): void {
    // Mock event handler
  }
}

/**
 * Initialize Redis connection with proper fallback
 */
export async function initializeRedis(): Promise<Redis | MockRedis> {
  if (redisClient) {
    return redisClient;
  }

  const redisHost = process.env.REDIS_HOST || 'localhost';
  const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);
  const redisPassword = process.env.REDIS_PASSWORD;
  const redisDB = parseInt(process.env.REDIS_DB || '0', 10);
  const forceRedis = process.env.FORCE_REDIS === 'true';
  const allowMock = process.env.ALLOW_MOCK_REDIS !== 'false'; // Default true

  logger.info('Attempting to connect to Redis...', {
    host: redisHost,
    port: redisPort,
    db: redisDB,
    hasPassword: !!redisPassword
  });

  try {
    // Create Redis client with configuration
    const client = new Redis({
      host: redisHost,
      port: redisPort,
      password: redisPassword,
      db: redisDB,
      
      // Connection settings
      connectTimeout: 10000, // 10 seconds
      commandTimeout: 5000,  // 5 seconds
      keepAlive: 1000,
      
      // Retry strategy
      retryStrategy: (times: number) => {
        if (times > 3) {
          logger.warn(`Redis connection failed after ${times} attempts`);
          if (forceRedis) {
            // If Redis is required, keep trying
            return 5000; // Wait 5 seconds before retry
          }
          // Otherwise, give up and use mock
          return null;
        }
        // Exponential backoff
        const delay = Math.min(times * 500, 3000);
        logger.info(`Retrying Redis connection in ${delay}ms (attempt ${times}/3)`);
        return delay;
      },
      
      // Reconnect settings
      enableReadyCheck: true,
      lazyConnect: false,
      enableOfflineQueue: true,
      
      // Error handling
      showFriendlyErrorStack: process.env.NODE_ENV !== 'production'
    });

    // Event handlers
    client.on('connect', () => {
      logger.info('✅ Redis client connected successfully');
    });

    client.on('ready', () => {
      logger.info('✅ Redis client ready to accept commands');
    });

    client.on('error', (err) => {
      logger.error('Redis client error:', err);
      if (forceRedis) {
        logger.error('Redis is required but connection failed. Please check Redis server.');
      }
    });

    client.on('close', () => {
      logger.warn('Redis connection closed');
    });

    client.on('reconnecting', (delay: number) => {
      logger.info(`Reconnecting to Redis in ${delay}ms`);
    });

    // Test connection with timeout
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Redis connection timeout after 10 seconds'));
      }, 10000);

      // Wait for ready event
      if (client.status === 'ready') {
        clearTimeout(timeout);
        resolve();
      } else {
        client.once('ready', () => {
          clearTimeout(timeout);
          resolve();
        });

        client.once('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      }
    });

    // Test with PING command
    const pingResult = await client.ping();
    if (pingResult !== 'PONG') {
      throw new Error(`Unexpected ping response: ${pingResult}`);
    }

    // Set some initial test data
    await client.set('test:connection', 'success', 'EX', 60);
    
    redisClient = client;
    logger.info('✅ Redis initialized and tested successfully');
    
    // Log Redis info
    try {
      const info = await client.info('server');
      const versionMatch = info.match(/redis_version:([^\r\n]+)/);
      if (versionMatch) {
        logger.info(`Redis version: ${versionMatch[1]}`);
      }
    } catch (infoError) {
      logger.debug('Could not get Redis info:', infoError);
    }

    return client;

  } catch (error: any) {
    logger.error('Failed to connect to Redis:', {
      error: error.message,
      host: redisHost,
      port: redisPort
    });

    if (forceRedis) {
      logger.error('FORCE_REDIS is enabled. Cannot start without Redis connection.');
      throw new Error(`Redis connection required but failed: ${error.message}`);
    }

    if (!allowMock) {
      logger.error('Mock Redis is disabled. Cannot continue without Redis.');
      throw new Error(`Redis connection failed and mock is disabled: ${error.message}`);
    }

    logger.warn('⚠️ Falling back to in-memory MockRedis for development');
    logger.warn('Note: Data will not persist between restarts');
    
    // Use MockRedis as fallback
    const mockClient = new MockRedis() as any;
    redisClient = mockClient;
    
    logger.info('✅ MockRedis initialized for development/testing');
    return mockClient;
  }
}

/**
 * Get Redis client instance
 */
export function getRedisClient(): Redis | MockRedis {
  if (!redisClient) {
    logger.warn('Redis not initialized, creating mock client');
    const mockClient = new MockRedis() as any;
    redisClient = mockClient;
    return mockClient;
  }
  return redisClient;
}

/**
 * Close Redis connection
 */
export async function closeRedis(): Promise<void> {
  if (redisClient) {
    try {
      if (redisClient instanceof Redis) {
        await redisClient.quit();
        logger.info('Redis connection closed gracefully');
      } else {
        logger.info('MockRedis closed');
      }
    } catch (error) {
      logger.error('Error closing Redis connection:', error);
    } finally {
      redisClient = null;
    }
  }
}

/**
 * Check if Redis is connected
 */
export function isRedisConnected(): boolean {
  if (!redisClient) {
    return false;
  }
  
  if (redisClient instanceof Redis) {
    return redisClient.status === 'ready';
  }
  
  // MockRedis is always "connected"
  return true;
}

/**
 * Get Redis status information
 */
export async function getRedisStatus(): Promise<{
  connected: boolean;
  type: 'real' | 'mock';
  info?: any;
}> {
  if (!redisClient) {
    return { connected: false, type: 'mock' };
  }

  const isMock = !(redisClient instanceof Redis);
  
  if (isMock) {
    return {
      connected: true,
      type: 'mock',
      info: {
        mode: 'MockRedis',
        message: 'Using in-memory storage'
      }
    };
  }

  try {
    const info = await (redisClient as Redis).info();
    const status = (redisClient as Redis).status;
    
    return {
      connected: status === 'ready',
      type: 'real',
      info: {
        status,
        version: info.match(/redis_version:([^\r\n]+)/)?.[1],
        mode: info.match(/redis_mode:([^\r\n]+)/)?.[1],
        uptime: info.match(/uptime_in_seconds:([^\r\n]+)/)?.[1]
      }
    };
  } catch (error) {
    return {
      connected: false,
      type: 'real',
      info: { error: (error as Error).message }
    };
  }
}

export default {
  initializeRedis,
  getRedisClient,
  closeRedis,
  isRedisConnected,
  getRedisStatus
};