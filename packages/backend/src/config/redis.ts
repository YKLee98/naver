// packages/backend/src/config/redis.ts
import { Redis } from 'ioredis';
import { logger } from '../utils/logger.js';

let redisClient: Redis | null = null;
let isRealRedis: boolean = false;

/**
 * Redis configuration with enhanced error handling and fallback
 */
interface RedisConfig {
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  retryStrategy?: (times: number) => number | null;
  enableOfflineQueue?: boolean;
  maxRetriesPerRequest?: number;
  connectTimeout?: number;
  family?: 4 | 6;
  lazyConnect?: boolean;
  showFriendlyErrorStack?: boolean;
}

/**
 * Mock Redis client for development/testing
 */
class MockRedis {
  private store: Map<string, any> = new Map();
  private ttls: Map<string, NodeJS.Timeout> = new Map();
  private connected: boolean = true;
  public readonly isMock: boolean = true;

  async get(key: string): Promise<string | null> {
    return this.store.get(key) || null;
  }

  async set(key: string, value: string, ...args: any[]): Promise<'OK'> {
    this.store.set(key, value);

    // Handle TTL if provided
    if (args[0] === 'EX' && args[1]) {
      const ttl = args[1] * 1000; // Convert to milliseconds

      // Clear existing timeout if any
      if (this.ttls.has(key)) {
        clearTimeout(this.ttls.get(key)!);
      }

      // Set new timeout
      const timeout = setTimeout(() => {
        this.store.delete(key);
        this.ttls.delete(key);
      }, ttl);

      this.ttls.set(key, timeout);
    }

    return 'OK';
  }

  async setex(key: string, seconds: number, value: string): Promise<'OK'> {
    return this.set(key, value, 'EX', seconds);
  }

  async del(...keys: string[]): Promise<number> {
    let deleted = 0;
    for (const key of keys) {
      if (this.store.has(key)) {
        this.store.delete(key);
        deleted++;

        // Clear timeout if exists
        if (this.ttls.has(key)) {
          clearTimeout(this.ttls.get(key)!);
          this.ttls.delete(key);
        }
      }
    }
    return deleted;
  }

  async exists(...keys: string[]): Promise<number> {
    let count = 0;
    for (const key of keys) {
      if (this.store.has(key)) count++;
    }
    return count;
  }

  async keys(pattern: string): Promise<string[]> {
    const regex = new RegExp('^' + pattern.replace('*', '.*') + '$');
    return Array.from(this.store.keys()).filter((key) => regex.test(key));
  }

  async expire(key: string, seconds: number): Promise<number> {
    if (!this.store.has(key)) return 0;

    // Clear existing timeout if any
    if (this.ttls.has(key)) {
      clearTimeout(this.ttls.get(key)!);
    }

    // Set new timeout
    const timeout = setTimeout(() => {
      this.store.delete(key);
      this.ttls.delete(key);
    }, seconds * 1000);

    this.ttls.set(key, timeout);
    return 1;
  }

  async ttl(key: string): Promise<number> {
    // Mock implementation - return -1 (no TTL) or -2 (key doesn't exist)
    return this.store.has(key) ? -1 : -2;
  }

  async incr(key: string): Promise<number> {
    const val = parseInt(this.store.get(key) || '0', 10) + 1;
    this.store.set(key, String(val));
    return val;
  }

  async decr(key: string): Promise<number> {
    const val = parseInt(this.store.get(key) || '0', 10) - 1;
    this.store.set(key, String(val));
    return val;
  }

  async hset(key: string, field: string, value: string): Promise<number> {
    let hash = this.store.get(key) || {};
    if (typeof hash === 'string') hash = {};
    hash[field] = value;
    this.store.set(key, hash);
    return 1;
  }

  async hget(key: string, field: string): Promise<string | null> {
    const hash = this.store.get(key);
    if (!hash || typeof hash !== 'object') return null;
    return hash[field] || null;
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    const hash = this.store.get(key);
    if (!hash || typeof hash !== 'object') return {};
    return hash;
  }

  async ping(): Promise<'PONG'> {
    return 'PONG';
  }

  async quit(): Promise<'OK'> {
    // Clear all timeouts
    for (const timeout of this.ttls.values()) {
      clearTimeout(timeout);
    }
    this.store.clear();
    this.ttls.clear();
    this.connected = false;
    logger.info('MockRedis closed');
    return 'OK';
  }

  async flushall(): Promise<'OK'> {
    // Clear all timeouts
    for (const timeout of this.ttls.values()) {
      clearTimeout(timeout);
    }
    this.store.clear();
    this.ttls.clear();
    return 'OK';
  }

  async flushdb(): Promise<'OK'> {
    return this.flushall();
  }

  // Event emitter mock methods
  on(_event: string, _handler: Function): void {
    // Mock event handler
  }

  once(_event: string, _handler: Function): void {
    // Mock event handler
  }

  removeAllListeners(): void {
    // Mock implementation
  }

  disconnect(): void {
    this.connected = false;
  }

  // Status property
  get status(): string {
    return this.connected ? 'ready' : 'disconnected';
  }
}

/**
 * Parse Redis URL
 */
function parseRedisUrl(url: string): RedisConfig {
  try {
    const parsedUrl = new URL(url);
    const config: RedisConfig = {
      host: parsedUrl.hostname || 'localhost',
      port: parseInt(parsedUrl.port || '6379', 10),
    };

    if (parsedUrl.password) {
      config.password = parsedUrl.password;
    }

    if (parsedUrl.username && parsedUrl.password) {
      config.password = `${parsedUrl.username}:${parsedUrl.password}`;
    }

    const db = parsedUrl.pathname?.slice(1);
    if (db) {
      config.db = parseInt(db, 10);
    }

    return config;
  } catch (error) {
    logger.warn('Failed to parse Redis URL, using defaults');
    return {
      host: 'localhost',
      port: 6379,
    };
  }
}

/**
 * Initialize Redis connection with enhanced configuration
 */
export async function initializeRedis(): Promise<Redis> {
  if (redisClient) {
    return redisClient;
  }

  // Check if we should use mock Redis
  const useMock = process.env['USE_MOCK_REDIS'] === 'true';

  if (useMock) {
    logger.warn('Using Mock Redis (USE_MOCK_REDIS=true)');
    redisClient = new MockRedis() as any;
    isRealRedis = false;
    logger.info('✅ Mock Redis initialized');
    return redisClient!;
  }

  // Try to connect to real Redis
  const redisUrl = process.env['REDIS_URL'];
  const redisHost = process.env['REDIS_HOST'] || 'localhost';
  const redisPort = parseInt(process.env['REDIS_PORT'] || '6379', 10);
  const redisPassword = process.env['REDIS_PASSWORD'];
  const redisDb = parseInt(process.env['REDIS_DB'] || '0', 10);

  let config: RedisConfig;

  if (redisUrl) {
    // Parse Redis URL
    config = parseRedisUrl(redisUrl);
    logger.info(`Connecting to Redis: ${config.host}:${config.port}`);
  } else {
    // Use individual config values
    config = {
      host: redisHost,
      port: redisPort,
      ...(redisPassword && { password: redisPassword }),
      db: redisDb,
    };
    logger.info(`Connecting to Redis: ${redisHost}:${redisPort}`);
  }

  // Optimized retry strategy for production
  config.retryStrategy = (times: number) => {
    if (times > 3) {
      logger.error(
        'Redis connection failed after 3 retries, falling back to MockRedis'
      );
      return null; // Stop retrying
    }
    // Exponential backoff with jitter
    const delay = Math.min(times * 500 + Math.random() * 500, 2000);
    logger.warn(
      `Retrying Redis connection in ${Math.round(delay)}ms... (attempt ${times}/3)`
    );
    return delay;
  };

  config.enableOfflineQueue = false; // Better performance in production
  config.maxRetriesPerRequest = 2;    // Reduced for faster failover
  config.connectTimeout = 5000;       // 5 seconds for faster detection
  config.showFriendlyErrorStack = process.env['NODE_ENV'] !== 'production';
  config.lazyConnect = true;          // Don't connect immediately
  config.keepAlive = 30000;           // Keep connection alive
  config.commandTimeout = 5000;       // Command timeout

  try {
    // Create Redis client
    redisClient = new Redis(config);

    // Setup event handlers
    redisClient.on('connect', () => {
      logger.info('📗 Redis connected successfully');
      isRealRedis = true;
    });

    redisClient.on('ready', () => {
      logger.info('✅ Redis is ready to accept commands');
    });

    redisClient.on('error', (error) => {
      logger.error('Redis error:', error);

      // If it's a connection error and we haven't connected yet, switch to mock
      if (!isRealRedis && error.message.includes('ECONNREFUSED')) {
        logger.warn('Redis connection refused, switching to MockRedis');
        redisClient = null;
      }
    });

    redisClient.on('close', () => {
      logger.warn('Redis connection closed');
      isRealRedis = false;
    });

    redisClient.on('reconnecting', (delay: number) => {
      logger.info(`Redis reconnecting in ${delay}ms...`);
    });

    redisClient.on('end', () => {
      logger.warn('Redis connection ended');
      isRealRedis = false;
    });

    // Try to connect
    await redisClient.connect();

    // Test connection
    const pong = await redisClient.ping();
    if (pong !== 'PONG') {
      throw new Error('Redis ping test failed');
    }

    logger.info('✅ Redis initialized and connected');
    isRealRedis = true;
    return redisClient;
  } catch (error: any) {
    logger.error('Failed to connect to Redis:', error.message);

    // Clean up failed connection
    if (redisClient) {
      try {
        redisClient.removeAllListeners();
        redisClient.disconnect();
      } catch {}
      redisClient = null;
    }

    // Fallback to mock Redis
    logger.warn('Falling back to Mock Redis');
    redisClient = new MockRedis() as any;
    isRealRedis = false;
    logger.info('✅ Mock Redis initialized (fallback)');
    return redisClient!;
  }
}

/**
 * Get Redis client instance
 */
export function getRedisClient(): Redis | null {
  return redisClient;
}

/**
 * Check if using real Redis
 */
export function isUsingRealRedis(): boolean {
  return isRealRedis;
}

/**
 * Get Redis status
 */
export function getRedisStatus(): {
  connected: boolean;
  type: 'real' | 'mock';
  status?: string;
  host?: string;
  port?: number;
} {
  if (!redisClient) {
    return {
      connected: false,
      type: 'mock',
    };
  }

  const isMock = (redisClient as any).isMock === true;

  if (isMock) {
    return {
      connected: true,
      type: 'mock',
      status: 'ready',
    };
  }

  return {
    connected: redisClient.status === 'ready',
    type: 'real',
    status: redisClient.status,
    host: (redisClient.options as any)?.host,
    port: (redisClient.options as any)?.port,
  };
}

/**
 * Test Redis connection
 */
export async function testRedisConnection(): Promise<boolean> {
  try {
    if (!redisClient) {
      return false;
    }

    const testKey = `test:${Date.now()}`;
    await redisClient.set(testKey, 'test', 'EX', 10);
    const value = await redisClient.get(testKey);
    await redisClient.del(testKey);

    return value === 'test';
  } catch (error) {
    logger.error('Redis connection test failed:', error);
    return false;
  }
}

/**
 * Close Redis connection
 */
export async function closeRedis(): Promise<void> {
  if (redisClient) {
    try {
      await redisClient.quit();
      logger.info('Redis connection closed gracefully');
    } catch (error) {
      logger.error('Error closing Redis connection:', error);
      // Force disconnect if quit fails
      try {
        (redisClient as any).disconnect();
      } catch {}
    }
    redisClient = null;
    isRealRedis = false;
  }
}
