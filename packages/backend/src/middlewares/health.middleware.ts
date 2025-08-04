// packages/backend/src/middlewares/health.middleware.ts
import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { getRedisClient } from '../config/redis';
import { logger } from '../utils/logger';

export const healthCheck = async (req: Request, res: Response): Promise<void> => {
  try {
    const checks = {
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      database: 'disconnected',
      redis: 'disconnected',
      memory: process.memoryUsage(),
    };

    // Check MongoDB
    if (mongoose.connection.readyState === 1) {
      checks.database = 'connected';
    }

    // Check Redis
    try {
      const redis = getRedisClient();
      await redis.ping();
      checks.redis = 'connected';
    } catch (error) {
      logger.error('Redis health check failed:', error);
    }

    const isHealthy = checks.database === 'connected';
    const statusCode = isHealthy ? 200 : 503;

    res.status(statusCode).json({
      status: isHealthy ? 'healthy' : 'unhealthy',
      ...checks,
    });
  } catch (error) {
    logger.error('Health check error:', error);
    res.status(503).json({
      status: 'error',
      message: 'Health check failed',
    });
  }
};