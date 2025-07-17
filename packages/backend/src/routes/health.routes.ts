import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { getRedisClient } from '../config/redis';
import { logger } from '../utils/logger';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      services: {
        database: 'unknown',
        redis: 'unknown',
      },
    };

    // MongoDB 상태 확인
    if (mongoose.connection.readyState === 1) {
      health.services.database = 'connected';
    } else {
      health.services.database = 'disconnected';
    }

    // Redis 상태 확인
    try {
      const redis = getRedisClient();
      await redis.ping();
      health.services.redis = 'connected';
    } catch (error) {
      health.services.redis = 'disconnected';
    }

    // 전체 상태 판단
    const allHealthy = Object.values(health.services).every(
      status => status === 'connected'
    );

    if (!allHealthy) {
      health.status = 'degraded';
    }

    res.status(allHealthy ? 200 : 503).json(health);
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Health check failed',
    });
  }
});

router.get('/liveness', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
  });
});

router.get('/readiness', async (req: Request, res: Response) => {
  try {
    // 데이터베이스 연결 확인
    if (mongoose.connection.readyState !== 1) {
      throw new Error('Database not ready');
    }

    // Redis 연결 확인
    const redis = getRedisClient();
    await redis.ping();

    res.status(200).json({
      status: 'ready',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      status: 'not ready',
      timestamp: new Date().toISOString(),
      error: error.message,
    });
  }
});

export default router;






