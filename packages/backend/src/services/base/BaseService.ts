// packages/backend/src/services/base/BaseService.ts
import { Redis } from 'ioredis';
import { logger } from '../../utils/logger.js';
import { EventEmitter } from 'events';
import { performance } from 'perf_hooks';

export interface ServiceConfig {
  name: string;
  version: string;
  redis?: Redis | any;
  config?: any;
}

export interface ServiceMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  lastError?: Error;
  lastErrorTime?: Date;
}

export interface CacheOptions {
  key: string;
  ttl?: number; // seconds
  compress?: boolean;
}

export abstract class BaseService extends EventEmitter {
  protected name: string;
  protected version: string;
  protected redis?: Redis | any;
  protected config: any;
  protected metrics: ServiceMetrics;
  protected isInitialized: boolean = false;
  protected retryConfig = {
    maxAttempts: 3,
    backoffMultiplier: 2,
    initialDelay: 1000,
    maxDelay: 30000
  };

  constructor(serviceConfig: ServiceConfig) {
    super();
    this.name = serviceConfig.name;
    this.version = serviceConfig.version;
    this.redis = serviceConfig.redis;
    this.config = serviceConfig.config;
    
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0
    };

    this.setupEventHandlers();
  }

  /**
   * Initialize the service
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn(`${this.name} is already initialized`);
      return;
    }

    try {
      logger.info(`Initializing ${this.name} v${this.version}...`);
      
      await this.onInitialize();
      
      this.isInitialized = true;
      this.emit('initialized', { service: this.name });
      
      logger.info(`✅ ${this.name} initialized successfully`);
    } catch (error) {
      logger.error(`Failed to initialize ${this.name}:`, error);
      this.emit('error', { service: this.name, error });
      throw error;
    }
  }

  /**
   * Abstract method for service-specific initialization
   */
  protected abstract onInitialize(): Promise<void>;

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    try {
      logger.info(`Cleaning up ${this.name}...`);
      
      await this.onCleanup();
      
      this.removeAllListeners();
      this.isInitialized = false;
      
      logger.info(`✅ ${this.name} cleaned up successfully`);
    } catch (error) {
      logger.error(`Error during ${this.name} cleanup:`, error);
      throw error;
    }
  }

  /**
   * Abstract method for service-specific cleanup
   */
  protected abstract onCleanup(): Promise<void>;

  /**
   * Execute operation with retry logic
   */
  protected async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    config = this.retryConfig
  ): Promise<T> {
    let lastError: Error | undefined;
    let delay = config.initialDelay;

    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
      try {
        logger.debug(`${this.name}: Attempting ${operationName} (attempt ${attempt}/${config.maxAttempts})`);
        
        const result = await operation();
        
        if (attempt > 1) {
          logger.info(`${this.name}: ${operationName} succeeded after ${attempt} attempts`);
        }
        
        return result;
      } catch (error) {
        lastError = error as Error;
        
        logger.warn(`${this.name}: ${operationName} failed (attempt ${attempt}/${config.maxAttempts}):`, error);
        
        if (attempt < config.maxAttempts) {
          await this.delay(delay);
          delay = Math.min(delay * config.backoffMultiplier, config.maxDelay);
        }
      }
    }

    logger.error(`${this.name}: ${operationName} failed after ${config.maxAttempts} attempts`);
    throw lastError;
  }

  /**
   * Execute operation with timeout
   */
  protected async executeWithTimeout<T>(
    operation: () => Promise<T>,
    timeoutMs: number,
    operationName: string
  ): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`${operationName} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    try {
      return await Promise.race([operation(), timeoutPromise]);
    } catch (error) {
      logger.error(`${this.name}: ${operationName} failed:`, error);
      throw error;
    }
  }

  /**
   * Execute operation with performance tracking
   */
  protected async executeWithMetrics<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    const startTime = performance.now();
    this.metrics.totalRequests++;

    try {
      const result = await operation();
      
      const duration = performance.now() - startTime;
      this.updateMetrics(true, duration);
      
      logger.debug(`${this.name}: ${operationName} completed in ${duration.toFixed(2)}ms`);
      
      this.emit('operation:success', {
        service: this.name,
        operation: operationName,
        duration
      });
      
      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      this.updateMetrics(false, duration);
      
      this.metrics.lastError = error as Error;
      this.metrics.lastErrorTime = new Date();
      
      logger.error(`${this.name}: ${operationName} failed after ${duration.toFixed(2)}ms:`, error);
      
      this.emit('operation:failure', {
        service: this.name,
        operation: operationName,
        duration,
        error
      });
      
      throw error;
    }
  }

  /**
   * Cache operations
   */
  protected async getFromCache<T>(key: string): Promise<T | null> {
    if (!this.redis) return null;

    try {
      const cached = await this.redis.get(key);
      if (!cached) return null;

      const parsed = JSON.parse(cached);
      
      logger.debug(`${this.name}: Cache hit for key ${key}`);
      return parsed;
    } catch (error) {
      logger.error(`${this.name}: Cache get error for key ${key}:`, error);
      return null;
    }
  }

  protected async setCache<T>(
    key: string,
    value: T,
    ttl: number = 3600
  ): Promise<void> {
    if (!this.redis) return;

    try {
      const serialized = JSON.stringify(value);
      
      if (ttl > 0) {
        await this.redis.setex(key, ttl, serialized);
      } else {
        await this.redis.set(key, serialized);
      }
      
      logger.debug(`${this.name}: Cached key ${key} with TTL ${ttl}s`);
    } catch (error) {
      logger.error(`${this.name}: Cache set error for key ${key}:`, error);
    }
  }

  protected async invalidateCache(pattern: string): Promise<void> {
    if (!this.redis) return;

    try {
      // Note: This is a simplified version. In production, use SCAN instead of KEYS
      const keys = await this.redis.keys(pattern);
      
      if (keys.length > 0) {
        await this.redis.del(...keys);
        logger.debug(`${this.name}: Invalidated ${keys.length} cache keys matching ${pattern}`);
      }
    } catch (error) {
      logger.error(`${this.name}: Cache invalidation error for pattern ${pattern}:`, error);
    }
  }

  /**
   * Batch operations
   */
  protected async processBatch<T, R>(
    items: T[],
    processor: (item: T) => Promise<R>,
    batchSize: number = 10,
    concurrency: number = 3
  ): Promise<R[]> {
    const results: R[] = [];
    const batches = this.createBatches(items, batchSize);
    
    logger.info(`${this.name}: Processing ${items.length} items in ${batches.length} batches`);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const batchPromises = batch.map(item => 
        processor(item).catch(error => {
          logger.error(`${this.name}: Batch item processing error:`, error);
          return null;
        })
      );

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults.filter(r => r !== null) as R[]);

      // Progress logging
      const progress = ((i + 1) / batches.length * 100).toFixed(1);
      logger.debug(`${this.name}: Batch progress: ${progress}%`);

      // Add delay between batches to avoid overwhelming the system
      if (i < batches.length - 1) {
        await this.delay(100);
      }
    }

    return results;
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{
    service: string;
    version: string;
    status: 'healthy' | 'unhealthy';
    initialized: boolean;
    metrics: ServiceMetrics;
    details?: any;
  }> {
    try {
      const details = await this.getHealthDetails();
      
      return {
        service: this.name,
        version: this.version,
        status: this.isInitialized ? 'healthy' : 'unhealthy',
        initialized: this.isInitialized,
        metrics: this.metrics,
        details
      };
    } catch (error) {
      logger.error(`${this.name}: Health check failed:`, error);
      
      return {
        service: this.name,
        version: this.version,
        status: 'unhealthy',
        initialized: this.isInitialized,
        metrics: this.metrics,
        details: { error: (error as Error).message }
      };
    }
  }

  /**
   * Override this to provide service-specific health details
   */
  protected async getHealthDetails(): Promise<any> {
    return {};
  }

  /**
   * Utility methods
   */
  protected delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  protected createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    
    return batches;
  }

  private updateMetrics(success: boolean, duration: number): void {
    if (success) {
      this.metrics.successfulRequests++;
    } else {
      this.metrics.failedRequests++;
    }

    // Update average response time
    const totalRequests = this.metrics.successfulRequests + this.metrics.failedRequests;
    this.metrics.averageResponseTime = 
      (this.metrics.averageResponseTime * (totalRequests - 1) + duration) / totalRequests;
  }

  private setupEventHandlers(): void {
    this.on('error', (error) => {
      logger.error(`${this.name}: Service error event:`, error);
    });

    this.setMaxListeners(20); // Increase max listeners if needed
  }

  /**
   * Get service info
   */
  getInfo(): {
    name: string;
    version: string;
    initialized: boolean;
    metrics: ServiceMetrics;
  } {
    return {
      name: this.name,
      version: this.version,
      initialized: this.isInitialized,
      metrics: this.metrics
    };
  }
}