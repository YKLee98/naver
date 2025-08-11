// packages/backend/src/services/cache/CacheService.ts
import { Redis } from 'ioredis';
import { logger } from '../../utils/logger.js';
import crypto from 'crypto';

/**
 * Cache options interface
 */
interface CacheOptions {
  ttl?: number;           // Time to live in seconds
  prefix?: string;        // Key prefix
  compress?: boolean;     // Enable compression for large values
  useTagging?: boolean;   // Enable cache tagging
}

/**
 * Cache statistics
 */
interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  hitRate: number;
}

/**
 * Enterprise-grade Cache Service with advanced features
 */
export class CacheService {
  private redis: Redis;
  private defaultTTL: number = 3600; // 1 hour default
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    hitRate: 0,
  };
  private taggedKeys: Map<string, Set<string>> = new Map();

  constructor(redis: Redis) {
    this.redis = redis;
  }

  /**
   * Generate cache key with optional prefix
   */
  private generateKey(key: string, prefix?: string): string {
    const finalPrefix = prefix || 'cache';
    return `${finalPrefix}:${key}`;
  }

  /**
   * Generate hash for complex objects
   */
  private generateHash(data: any): string {
    const str = JSON.stringify(data);
    return crypto.createHash('md5').update(str).digest('hex');
  }

  /**
   * Get value from cache with statistics tracking
   */
  async get<T = any>(
    key: string,
    options: CacheOptions = {}
  ): Promise<T | null> {
    try {
      const fullKey = this.generateKey(key, options.prefix);
      const value = await this.redis.get(fullKey);

      if (value) {
        this.stats.hits++;
        this.updateHitRate();
        
        // Parse JSON if needed
        try {
          return JSON.parse(value) as T;
        } catch {
          return value as T;
        }
      }

      this.stats.misses++;
      this.updateHitRate();
      return null;
    } catch (error) {
      logger.error('Cache get error:', error);
      return null;
    }
  }

  /**
   * Set value in cache with optional TTL
   */
  async set(
    key: string,
    value: any,
    options: CacheOptions = {}
  ): Promise<boolean> {
    try {
      const fullKey = this.generateKey(key, options.prefix);
      const ttl = options.ttl || this.defaultTTL;
      
      // Serialize value
      const serialized = typeof value === 'string' 
        ? value 
        : JSON.stringify(value);

      // Set with TTL
      await this.redis.setex(fullKey, ttl, serialized);
      
      // Handle tagging if enabled
      if (options.useTagging && options.prefix) {
        this.addToTag(options.prefix, fullKey);
      }

      this.stats.sets++;
      return true;
    } catch (error) {
      logger.error('Cache set error:', error);
      return false;
    }
  }

  /**
   * Get or set cache value (cache-aside pattern)
   */
  async getOrSet<T = any>(
    key: string,
    fetcher: () => Promise<T>,
    options: CacheOptions = {}
  ): Promise<T> {
    // Try to get from cache
    const cached = await this.get<T>(key, options);
    if (cached !== null) {
      return cached;
    }

    // Fetch fresh data
    const freshData = await fetcher();
    
    // Store in cache
    await this.set(key, freshData, options);
    
    return freshData;
  }

  /**
   * Delete value from cache
   */
  async delete(key: string, prefix?: string): Promise<boolean> {
    try {
      const fullKey = this.generateKey(key, prefix);
      const result = await this.redis.del(fullKey);
      
      this.stats.deletes++;
      return result > 0;
    } catch (error) {
      logger.error('Cache delete error:', error);
      return false;
    }
  }

  /**
   * Delete all keys matching a pattern (use with caution)
   */
  async deletePattern(pattern: string): Promise<number> {
    try {
      // Use SCAN instead of KEYS for better performance
      const keys = await this.scanKeys(pattern);
      
      if (keys.length === 0) {
        return 0;
      }

      // Delete in batches using pipeline
      const pipeline = this.redis.pipeline();
      for (const key of keys) {
        pipeline.del(key);
      }
      
      const results = await pipeline.exec();
      const deleted = results?.filter(r => r[0] === null).length || 0;
      
      this.stats.deletes += deleted;
      return deleted;
    } catch (error) {
      logger.error('Cache delete pattern error:', error);
      return 0;
    }
  }

  /**
   * Scan keys using cursor (more efficient than KEYS)
   */
  private async scanKeys(pattern: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor = '0';
    
    do {
      const [nextCursor, batch] = await this.redis.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100
      );
      
      keys.push(...batch);
      cursor = nextCursor;
    } while (cursor !== '0');
    
    return keys;
  }

  /**
   * Clear all cache (use with extreme caution)
   */
  async flush(): Promise<boolean> {
    try {
      await this.redis.flushdb();
      this.resetStats();
      this.taggedKeys.clear();
      return true;
    } catch (error) {
      logger.error('Cache flush error:', error);
      return false;
    }
  }

  /**
   * Invalidate cache by tag
   */
  async invalidateTag(tag: string): Promise<number> {
    const keys = this.taggedKeys.get(tag);
    if (!keys || keys.size === 0) {
      return 0;
    }

    const pipeline = this.redis.pipeline();
    for (const key of keys) {
      pipeline.del(key);
    }
    
    const results = await pipeline.exec();
    const deleted = results?.filter(r => r[0] === null).length || 0;
    
    // Clear tag
    this.taggedKeys.delete(tag);
    this.stats.deletes += deleted;
    
    return deleted;
  }

  /**
   * Add key to tag for bulk invalidation
   */
  private addToTag(tag: string, key: string): void {
    if (!this.taggedKeys.has(tag)) {
      this.taggedKeys.set(tag, new Set());
    }
    this.taggedKeys.get(tag)!.add(key);
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      hitRate: 0,
    };
  }

  /**
   * Update hit rate calculation
   */
  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
  }

  /**
   * Implement cache warming for critical data
   */
  async warmCache(
    keys: Array<{ key: string; fetcher: () => Promise<any>; ttl?: number }>
  ): Promise<void> {
    logger.info(`Warming cache with ${keys.length} keys...`);
    
    const promises = keys.map(async ({ key, fetcher, ttl }) => {
      try {
        const data = await fetcher();
        await this.set(key, data, { ttl });
      } catch (error) {
        logger.error(`Failed to warm cache for key ${key}:`, error);
      }
    });
    
    await Promise.all(promises);
    logger.info('Cache warming completed');
  }

  /**
   * Multi-get for batch operations
   */
  async mget<T = any>(
    keys: string[],
    prefix?: string
  ): Promise<Map<string, T | null>> {
    const fullKeys = keys.map(k => this.generateKey(k, prefix));
    const values = await this.redis.mget(...fullKeys);
    
    const result = new Map<string, T | null>();
    keys.forEach((key, index) => {
      const value = values[index];
      if (value) {
        this.stats.hits++;
        try {
          result.set(key, JSON.parse(value) as T);
        } catch {
          result.set(key, value as T);
        }
      } else {
        this.stats.misses++;
        result.set(key, null);
      }
    });
    
    this.updateHitRate();
    return result;
  }

  /**
   * Multi-set for batch operations
   */
  async mset(
    entries: Array<{ key: string; value: any; ttl?: number }>,
    prefix?: string
  ): Promise<boolean> {
    try {
      const pipeline = this.redis.pipeline();
      
      for (const { key, value, ttl } of entries) {
        const fullKey = this.generateKey(key, prefix);
        const serialized = typeof value === 'string' 
          ? value 
          : JSON.stringify(value);
        const finalTTL = ttl || this.defaultTTL;
        
        pipeline.setex(fullKey, finalTTL, serialized);
      }
      
      await pipeline.exec();
      this.stats.sets += entries.length;
      
      return true;
    } catch (error) {
      logger.error('Cache mset error:', error);
      return false;
    }
  }

  /**
   * Check if key exists in cache
   */
  async exists(key: string, prefix?: string): Promise<boolean> {
    const fullKey = this.generateKey(key, prefix);
    const exists = await this.redis.exists(fullKey);
    return exists === 1;
  }

  /**
   * Get remaining TTL for a key
   */
  async ttl(key: string, prefix?: string): Promise<number> {
    const fullKey = this.generateKey(key, prefix);
    return await this.redis.ttl(fullKey);
  }

  /**
   * Extend TTL for a key
   */
  async touch(key: string, ttl?: number, prefix?: string): Promise<boolean> {
    const fullKey = this.generateKey(key, prefix);
    const finalTTL = ttl || this.defaultTTL;
    const result = await this.redis.expire(fullKey, finalTTL);
    return result === 1;
  }
}