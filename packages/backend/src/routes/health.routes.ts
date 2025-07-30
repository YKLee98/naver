// packages/backend/src/routes/health.routes.ts
import { Router, Request, Response } from 'express';
import { connectDatabase } from '../config/database';
import { getRedisClient } from '../config/redis';

const router = Router();

/**
 * 기본 헬스 체크
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const healthcheck = {
      uptime: process.uptime(),
      message: 'OK',
      timestamp: Date.now(),
      environment: process.env['NODE_ENV'] || 'development',
    };
    
    res.status(200).json(healthcheck);
  } catch (error) {
    res.status(503).json({ 
      message: 'Service Unavailable',
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

/**
 * 상세 헬스 체크 (DB, Redis 포함)
 */
router.get('/detailed', async (req: Request, res: Response) => {
  const checks = {
    timestamp: new Date().toISOString(),
    status: 'healthy',
    checks: {
      api: 'healthy',
      database: 'unknown',
      redis: 'unknown',
    },
  };

  try {
    // MongoDB 체크
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState === 1) {
      checks.checks.database = 'healthy';
    } else {
      checks.checks.database = 'unhealthy';
      checks.status = 'degraded';
    }
  } catch (error) {
    checks.checks.database = 'unhealthy';
    checks.status = 'degraded';
  }

  try {
    // Redis 체크 - try-catch로 안전하게 처리
    const redis = getRedisClient();
    if (redis) {
      await redis.ping();
      checks.checks.redis = 'healthy';
    } else {
      checks.checks.redis = 'not initialized';
      checks.status = 'degraded';
    }
  } catch (error) {
    checks.checks.redis = 'unhealthy';
    checks.status = 'degraded';
  }

  const statusCode = checks.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(checks);
});

export default router;