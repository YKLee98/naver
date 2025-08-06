// ===== 4. packages/backend/src/middlewares/health.middleware.ts =====
import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { getRedisClient } from '../config/redis';
import { logger } from '../utils/logger';

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Date;
  uptime: number;
  services: {
    database: {
      status: 'connected' | 'disconnected';
      latency?: number;
    };
    redis: {
      status: 'connected' | 'disconnected';
      latency?: number;
    };
  };
  memory: {
    used: string;
    total: string;
    percentage: string;
  };
}

/**
 * 헬스 체크 미들웨어
 */
export const healthCheck = async (req: Request, res: Response): Promise<void> => {
  try {
    const healthStatus: HealthStatus = {
      status: 'healthy',
      timestamp: new Date(),
      uptime: process.uptime(),
      services: {
        database: {
          status: 'disconnected',
        },
        redis: {
          status: 'disconnected',
        },
      },
      memory: {
        used: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
        total: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB`,
        percentage: `${Math.round((process.memoryUsage().heapUsed / process.memoryUsage().heapTotal) * 100)}%`,
      },
    };

    // MongoDB 체크
    try {
      const dbStart = Date.now();
      if (mongoose.connection.readyState === 1) {
        await mongoose.connection.db.admin().ping();
        healthStatus.services.database = {
          status: 'connected',
          latency: Date.now() - dbStart,
        };
      }
    } catch (error) {
      logger.error('Database health check failed:', error);
      healthStatus.status = 'degraded';
    }

    // Redis 체크
    try {
      const redisStart = Date.now();
      const redis = getRedisClient();
      await redis.ping();
      healthStatus.services.redis = {
        status: 'connected',
        latency: Date.now() - redisStart,
      };
    } catch (error) {
      logger.error('Redis health check failed:', error);
      healthStatus.status = 'degraded';
    }

    // 모든 서비스가 다운된 경우
    if (
      healthStatus.services.database.status === 'disconnected' &&
      healthStatus.services.redis.status === 'disconnected'
    ) {
      healthStatus.status = 'unhealthy';
    }

    const statusCode = healthStatus.status === 'healthy' ? 200 : 
                       healthStatus.status === 'degraded' ? 200 : 503;

    res.status(statusCode).json(healthStatus);
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date(),
      error: 'Health check failed',
    });
  }
};

/**
 * 간단한 헬스 체크 (로드 밸런서용)
 */
export const simpleHealthCheck = (req: Request, res: Response): void => {
  res.status(200).send('OK');
};

/**
 * Readiness 체크 (쿠버네티스용)
 */
export const readinessCheck = async (req: Request, res: Response): Promise<void> => {
  try {
    // 데이터베이스 연결 확인
    if (mongoose.connection.readyState !== 1) {
      throw new Error('Database not ready');
    }

    // Redis 연결 확인
    const redis = getRedisClient();
    await redis.ping();

    res.status(200).json({ ready: true });
  } catch (error) {
    res.status(503).json({ ready: false, error: (error as Error).message });
  }
};

/**
 * Liveness 체크 (쿠버네티스용)
 */
export const livenessCheck = (req: Request, res: Response): void => {
  res.status(200).json({ alive: true });
};