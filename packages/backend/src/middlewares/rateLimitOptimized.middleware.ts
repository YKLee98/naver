// packages/backend/src/middlewares/rateLimitOptimized.middleware.ts
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { Redis } from 'ioredis';
import { getRedisClient } from '../config/redis.js';
import { logger } from '../utils/logger.js';
import { Request, Response } from 'express';

/**
 * Rate limit configuration for different endpoints
 */
interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  message?: string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (req: Request) => string;
}

/**
 * Create optimized rate limiter with Redis store
 */
function createRateLimiter(config: RateLimitConfig) {
  const redis = getRedisClient();
  
  const baseConfig = {
    windowMs: config.windowMs,
    max: config.maxRequests,
    message: config.message || 'Too many requests, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: config.skipSuccessfulRequests || false,
    skipFailedRequests: config.skipFailedRequests || false,
    keyGenerator: config.keyGenerator || ((req: Request) => {
      // Use IP + User ID for authenticated requests
      const userId = (req as any).user?.id;
      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      return userId ? `${ip}:${userId}` : ip;
    }),
    handler: (req: Request, res: Response) => {
      logger.warn(`Rate limit exceeded for ${req.ip} on ${req.path}`);
      res.status(429).json({
        success: false,
        error: 'Too many requests',
        message: config.message,
        retryAfter: res.getHeader('Retry-After'),
      });
    },
  };

  // Use Redis store if available, otherwise use memory store
  if (redis && !(redis as any).isMock) {
    return rateLimit({
      ...baseConfig,
      store: new RedisStore({
        client: redis as any,
        prefix: 'rate-limit:',
      }),
    });
  } else {
    logger.warn('Using in-memory rate limiting (Redis not available)');
    return rateLimit(baseConfig);
  }
}

/**
 * General API rate limiter
 */
export const generalRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 100,
  message: 'Too many API requests, please try again later.',
});

/**
 * Strict rate limiter for authentication endpoints
 */
export const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 5,
  message: 'Too many authentication attempts, please try again later.',
  skipSuccessfulRequests: true, // Don't count successful logins
});

/**
 * Rate limiter for sync operations
 */
export const syncRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 2,
  message: 'Sync operations are rate limited. Please wait before trying again.',
});

/**
 * Rate limiter for bulk operations
 */
export const bulkOperationRateLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000, // 5 minutes
  maxRequests: 5,
  message: 'Bulk operations are rate limited. Please wait before trying again.',
});

/**
 * Rate limiter for webhook endpoints
 */
export const webhookRateLimiter = createRateLimiter({
  windowMs: 1000, // 1 second
  maxRequests: 10,
  message: 'Webhook rate limit exceeded.',
  keyGenerator: (req: Request) => {
    // Use webhook source identifier if available
    const source = req.get('X-Webhook-Source') || req.get('X-Shopify-Shop-Domain');
    return source || req.ip || 'unknown';
  },
});

/**
 * Rate limiter for data export endpoints
 */
export const exportRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 10,
  message: 'Export operations are rate limited. Please try again later.',
});

/**
 * Dynamic rate limiter based on user tier
 */
export function createTieredRateLimiter(tiers: Record<string, RateLimitConfig>) {
  return (req: Request, res: Response, next: Function) => {
    const userTier = (req as any).user?.tier || 'basic';
    const config = tiers[userTier] || tiers.basic;
    
    const limiter = createRateLimiter({
      ...config,
      keyGenerator: (req: Request) => {
        const userId = (req as any).user?.id;
        return userId ? `tier:${userTier}:${userId}` : req.ip || 'unknown';
      },
    });
    
    limiter(req, res, next);
  };
}

/**
 * Example tiered rate limiter
 */
export const tieredApiRateLimiter = createTieredRateLimiter({
  basic: {
    windowMs: 15 * 60 * 1000,
    maxRequests: 50,
  },
  premium: {
    windowMs: 15 * 60 * 1000,
    maxRequests: 200,
  },
  enterprise: {
    windowMs: 15 * 60 * 1000,
    maxRequests: 1000,
  },
});

/**
 * Sliding window rate limiter for more accurate limiting
 */
export class SlidingWindowRateLimiter {
  private redis: Redis | null;
  private windowMs: number;
  private maxRequests: number;
  private prefix: string;

  constructor(windowMs: number, maxRequests: number, prefix: string = 'sliding:') {
    this.redis = getRedisClient();
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
    this.prefix = prefix;
  }

  async isAllowed(key: string): Promise<boolean> {
    if (!this.redis || (this.redis as any).isMock) {
      // Fallback to simple counting if Redis not available
      return true;
    }

    const now = Date.now();
    const windowStart = now - this.windowMs;
    const redisKey = `${this.prefix}${key}`;

    try {
      // Use Redis sorted set for sliding window
      const pipeline = this.redis.pipeline();
      
      // Remove old entries
      pipeline.zremrangebyscore(redisKey, '-inf', windowStart);
      
      // Count current entries
      pipeline.zcard(redisKey);
      
      // Add current request
      pipeline.zadd(redisKey, now, `${now}:${Math.random()}`);
      
      // Set expiry
      pipeline.expire(redisKey, Math.ceil(this.windowMs / 1000));
      
      const results = await pipeline.exec();
      
      if (!results) return true;
      
      const count = results[1]?.[1] as number;
      return count < this.maxRequests;
    } catch (error) {
      logger.error('Sliding window rate limit error:', error);
      return true; // Allow on error
    }
  }

  middleware() {
    return async (req: Request, res: Response, next: Function) => {
      const key = (req as any).user?.id || req.ip || 'unknown';
      
      const allowed = await this.isAllowed(key);
      
      if (!allowed) {
        res.status(429).json({
          success: false,
          error: 'Rate limit exceeded',
          message: 'Too many requests, please slow down.',
        });
        return;
      }
      
      next();
    };
  }
}

/**
 * Create sliding window rate limiter for critical endpoints
 */
export const criticalEndpointLimiter = new SlidingWindowRateLimiter(
  60000,  // 1 minute window
  10      // 10 requests max
).middleware();

/**
 * IP-based rate limiter with ban functionality
 */
export class IPRateLimiter {
  private redis: Redis | null;
  private banDuration: number = 3600000; // 1 hour default ban
  private banThreshold: number = 50; // Ban after 50 violations

  constructor() {
    this.redis = getRedisClient();
  }

  async isBanned(ip: string): Promise<boolean> {
    if (!this.redis || (this.redis as any).isMock) return false;
    
    const banKey = `ban:${ip}`;
    const banned = await this.redis.get(banKey);
    return banned === 'true';
  }

  async recordViolation(ip: string): Promise<void> {
    if (!this.redis || (this.redis as any).isMock) return;
    
    const violationKey = `violations:${ip}`;
    const count = await this.redis.incr(violationKey);
    await this.redis.expire(violationKey, 3600); // Reset after 1 hour
    
    if (count >= this.banThreshold) {
      await this.ban(ip);
    }
  }

  async ban(ip: string): Promise<void> {
    if (!this.redis || (this.redis as any).isMock) return;
    
    const banKey = `ban:${ip}`;
    await this.redis.setex(banKey, this.banDuration / 1000, 'true');
    logger.warn(`IP ${ip} has been banned for ${this.banDuration / 1000} seconds`);
  }

  middleware() {
    return async (req: Request, res: Response, next: Function) => {
      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      
      if (await this.isBanned(ip)) {
        res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: 'Your IP has been temporarily banned due to excessive requests.',
        });
        return;
      }
      
      next();
    };
  }
}

export const ipBanMiddleware = new IPRateLimiter().middleware();