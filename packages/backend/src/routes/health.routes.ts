// packages/backend/src/routes/health.routes.ts
import { Router, Request, Response } from 'express';
import { getRedisClient } from '../config/redis';
import { logger } from '../utils/logger';
import mongoose from 'mongoose';

const router = Router();

// 기본 헬스 체크
router.get('/', async (req: Request, res: Response) => {
  try {
    const healthCheck = {
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      status: 'ok',
      message: 'Server is healthy'
    };

    res.status(200).json(healthCheck);
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(503).json({
      status: 'error',
      message: 'Server is unhealthy'
    });
  }
});

// 상세 헬스 체크
router.get('/detailed', async (req: Request, res: Response) => {
  try {
    // MongoDB 상태 체크
    const mongoStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
    
    // Redis 상태 체크
    let redisStatus = 'disconnected';
    try {
      const redis = getRedisClient();
      await redis.ping();
      redisStatus = 'connected';
    } catch (error) {
      logger.error('Redis health check failed:', error);
      redisStatus = 'error';
    }

    // 메모리 사용량
    const memoryUsage = process.memoryUsage();

    const detailedHealth = {
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      status: mongoStatus === 'connected' && redisStatus === 'connected' ? 'healthy' : 'degraded',
      services: {
        mongodb: mongoStatus,
        redis: redisStatus
      },
      memory: {
        rss: `${Math.round(memoryUsage.rss / 1024 / 1024)} MB`,
        heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)} MB`,
        heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB`,
        external: `${Math.round(memoryUsage.external / 1024 / 1024)} MB`
      },
      environment: process.env.NODE_ENV || 'development'
    };

    const statusCode = detailedHealth.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(detailedHealth);
  } catch (error) {
    logger.error('Detailed health check failed:', error);
    res.status(503).json({
      status: 'error',
      message: 'Health check failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// 준비 상태 체크 (Kubernetes readiness probe)
router.get('/ready', async (req: Request, res: Response) => {
  try {
    // MongoDB 연결 확인
    if (mongoose.connection.readyState !== 1) {
      throw new Error('MongoDB not connected');
    }

    // Redis 연결 확인
    try {
      const redis = getRedisClient();
      await redis.ping();
    } catch (error) {
      throw new Error('Redis not connected');
    }

    res.status(200).json({
      status: 'ready',
      message: 'Service is ready to accept traffic'
    });
  } catch (error) {
    logger.error('Readiness check failed:', error);
    res.status(503).json({
      status: 'not ready',
      message: error instanceof Error ? error.message : 'Service not ready'
    });
  }
});

// 라이브니스 체크 (Kubernetes liveness probe)
router.get('/live', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'alive',
    message: 'Service is alive'
  });
});

export default router;