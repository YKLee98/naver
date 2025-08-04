// packages/backend/src/config/redis.ts
import Redis from 'ioredis';
import { config } from './index';
import { logger } from '../utils/logger';
import { RedisMock } from './redis.mock';

let redisClient: Redis | RedisMock | null = null;

export const initializeRedis = (): Redis | RedisMock => {
  // 개발 환경에서는 Redis Mock 사용
  if (process.env.NODE_ENV === 'development' && process.env.USE_REAL_REDIS !== 'true') {
    logger.info('Using Redis Mock for development');
    redisClient = new RedisMock();
    return redisClient;
  }

  // Production 또는 USE_REAL_REDIS=true 인 경우 실제 Redis 사용
  try {
    const client = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.db,
      retryStrategy: (times) => {
        if (times > 3) {
          logger.error('Redis connection failed after 3 attempts');
          if (process.env.NODE_ENV === 'development') {
            logger.info('Falling back to Redis Mock');
            redisClient = new RedisMock();
            return null;
          }
          throw new Error('Redis connection failed');
        }
        return Math.min(times * 50, 2000);
      },
    });

    client.on('connect', () => {
      logger.info('Redis connected successfully');
    });

    client.on('error', (err) => {
      logger.error('Redis connection error:', err);
      if (process.env.NODE_ENV === 'development' && !redisClient) {
        logger.info('Falling back to Redis Mock due to connection error');
        redisClient = new RedisMock();
      }
    });

    redisClient = client;
    return client;
  } catch (error) {
    logger.error('Failed to initialize Redis:', error);
    if (process.env.NODE_ENV === 'development') {
      logger.info('Using Redis Mock as fallback');
      redisClient = new RedisMock();
      return redisClient;
    }
    throw error;
  }
};

export const getRedisClient = (): Redis | RedisMock => {
  if (!redisClient) {
    throw new Error('Redis client not initialized. Call initializeRedis() first.');
  }
  return redisClient;
};

export const disconnectRedis = async (): Promise<void> => {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    logger.info('Redis disconnected');
  }
};