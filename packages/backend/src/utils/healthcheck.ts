// packages/backend/src/utils/healthcheck.ts
import mongoose from 'mongoose';
import { getRedisClient } from '../config/redis.js';
import { logger } from './logger.js';

export interface HealthStatus {
  healthy: boolean;
  timestamp: string;
  uptime: number;
  services: {
    database: {
      status: 'healthy' | 'unhealthy';
      message?: string;
    };
    redis: {
      status: 'healthy' | 'unhealthy';
      message?: string;
    };
  };
  memory: {
    rss: string;
    heapTotal: string;
    heapUsed: string;
    external: string;
  };
}

export async function performHealthCheck(): Promise<HealthStatus> {
  const memUsage = process.memoryUsage();
  const formatMemory = (bytes: number) => (bytes / 1024 / 1024).toFixed(2) + ' MB';
  
  const status: HealthStatus = {
    healthy: true,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {
      database: { status: 'healthy' },
      redis: { status: 'healthy' },
    },
    memory: {
      rss: formatMemory(memUsage.rss),
      heapTotal: formatMemory(memUsage.heapTotal),
      heapUsed: formatMemory(memUsage.heapUsed),
      external: formatMemory(memUsage.external),
    },
  };

  // Check MongoDB
  try {
    if (mongoose.connection.readyState !== 1) {
      status.services.database.status = 'unhealthy';
      status.services.database.message = 'Not connected';
      status.healthy = false;
    }
  } catch (error) {
    status.services.database.status = 'unhealthy';
    status.services.database.message = error instanceof Error ? error.message : 'Unknown error';
    status.healthy = false;
  }

  // Check Redis
  try {
    const redis = getRedisClient();
    const pong = await redis.ping();
    if (pong !== 'PONG') {
      status.services.redis.status = 'unhealthy';
      status.services.redis.message = 'Unexpected response';
      status.healthy = false;
    }
  } catch (error) {
    status.services.redis.status = 'unhealthy';
    status.services.redis.message = error instanceof Error ? error.message : 'Unknown error';
    status.healthy = false;
  }

  return status;
}