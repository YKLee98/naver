// packages/backend/src/controllers/HealthController.ts
import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { getRedisClient } from '../config/redis';
import { logger } from '../utils/logger';
import os from 'os';

export class HealthController {
  /**
   * 기본 헬스 체크
   */
  check = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const healthStatus = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development',
      };

      res.status(200).json({
        success: true,
        data: healthStatus,
      });
    } catch (error) {
      logger.error('Health check failed:', error);
      res.status(503).json({
        success: false,
        message: 'Service unavailable',
      });
    }
  };

  /**
   * 상세 헬스 체크
   */
  detailed = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const checks = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development',
        version: process.env.npm_package_version || '1.0.0',
        node: {
          version: process.version,
          memory: process.memoryUsage(),
          pid: process.pid,
        },
        system: {
          platform: os.platform(),
          release: os.release(),
          totalMemory: os.totalmem(),
          freeMemory: os.freemem(),
          cpus: os.cpus().length,
          loadAverage: os.loadavg(),
        },
        services: {
          database: 'unknown',
          redis: 'unknown',
          naver: 'unknown',
          shopify: 'unknown',
        },
      };

      // MongoDB 상태 확인
      try {
        const dbState = mongoose.connection.readyState;
        checks.services.database = dbState === 1 ? 'connected' : 'disconnected';
      } catch (error) {
        checks.services.database = 'error';
        logger.error('MongoDB health check failed:', error);
      }

      // Redis 상태 확인
      try {
        const redis = getRedisClient();
        const pong = await redis.ping();
        checks.services.redis = pong === 'PONG' ? 'connected' : 'disconnected';
      } catch (error) {
        checks.services.redis = 'error';
        logger.error('Redis health check failed:', error);
      }

      // 외부 서비스 상태 확인 (캐시된 값 사용)
      try {
        const redis = getRedisClient();
        const naverHealth = await redis.get('health:naver');
        const shopifyHealth = await redis.get('health:shopify');

        checks.services.naver = naverHealth || 'unknown';
        checks.services.shopify = shopifyHealth || 'unknown';
      } catch (error) {
        logger.error('External service health check failed:', error);
      }

      // 전체 상태 결정
      const servicesArray = Object.values(checks.services);
      if (
        servicesArray.includes('error') ||
        servicesArray.includes('disconnected')
      ) {
        checks.status = 'degraded';
      }

      const statusCode = checks.status === 'healthy' ? 200 : 503;

      res.status(statusCode).json({
        success: true,
        data: checks,
      });
    } catch (error) {
      logger.error('Detailed health check failed:', error);
      res.status(503).json({
        success: false,
        message: 'Service unavailable',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  /**
   * 준비 상태 체크 (Kubernetes readiness probe용)
   */
  ready = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      // 필수 서비스 확인
      const isMongoReady = mongoose.connection.readyState === 1;

      let isRedisReady = false;
      try {
        const redis = getRedisClient();
        await redis.ping();
        isRedisReady = true;
      } catch (error) {
        isRedisReady = false;
      }

      const isReady = isMongoReady && isRedisReady;

      if (isReady) {
        res.status(200).json({
          success: true,
          ready: true,
        });
      } else {
        res.status(503).json({
          success: false,
          ready: false,
          services: {
            mongodb: isMongoReady,
            redis: isRedisReady,
          },
        });
      }
    } catch (error) {
      logger.error('Readiness check failed:', error);
      res.status(503).json({
        success: false,
        ready: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  /**
   * 라이브니스 체크 (Kubernetes liveness probe용)
   */
  live = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      // 기본적인 앱 동작 확인
      const memoryUsage = process.memoryUsage();
      const heapUsed = memoryUsage.heapUsed / memoryUsage.heapTotal;

      // 메모리 사용률이 95% 이상이면 unhealthy
      if (heapUsed > 0.95) {
        throw new Error('Memory usage too high');
      }

      res.status(200).json({
        success: true,
        live: true,
        memory: {
          usage: `${(heapUsed * 100).toFixed(2)}%`,
          heapUsed: memoryUsage.heapUsed,
          heapTotal: memoryUsage.heapTotal,
        },
      });
    } catch (error) {
      logger.error('Liveness check failed:', error);
      res.status(503).json({
        success: false,
        live: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  /**
   * 메트릭스 조회
   */
  metrics = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const metrics = {
        timestamp: new Date().toISOString(),
        process: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          cpu: process.cpuUsage(),
        },
        system: {
          loadAverage: os.loadavg(),
          freeMemory: os.freemem(),
          totalMemory: os.totalmem(),
          memoryUsage:
            (((os.totalmem() - os.freemem()) / os.totalmem()) * 100).toFixed(
              2
            ) + '%',
        },
        nodejs: {
          version: process.version,
          versions: process.versions,
        },
      };

      // Redis 메트릭스 추가
      try {
        const redis = getRedisClient();
        const info = await redis.info();
        metrics['redis'] = {
          connected: true,
          info: info.split('\n').slice(0, 10).join('\n'), // 처음 10줄만
        };
      } catch (error) {
        metrics['redis'] = {
          connected: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }

      res.json({
        success: true,
        data: metrics,
      });
    } catch (error) {
      logger.error('Metrics collection failed:', error);
      next(error);
    }
  };
}
