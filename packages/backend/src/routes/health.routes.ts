// packages/backend/src/routes/health.routes.ts
import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { getRedisClient } from '../config/redis.js';
import { logger } from '../utils/logger.js';
import os from 'os';
import process from 'process';

export function setupHealthRoutes(): Router {
  const router = Router();

  // Basic health check
  router.get('/', async (req: Request, res: Response) => {
    try {
      const healthStatus = await getHealthStatus();
      const statusCode = healthStatus.status === 'healthy' ? 200 : 503;

      res.status(statusCode).json(healthStatus);
    } catch (error) {
      logger.error('Health check error:', error);
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: 'Health check failed',
      });
    }
  });

  // Detailed health check
  router.get('/detailed', async (req: Request, res: Response) => {
    try {
      const health = await getDetailedHealthStatus();
      const statusCode = health.overall === 'healthy' ? 200 : 503;

      res.status(statusCode).json(health);
    } catch (error) {
      logger.error('Detailed health check error:', error);
      res.status(503).json({
        overall: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: 'Health check failed',
      });
    }
  });

  // Readiness check (for k8s)
  router.get('/ready', async (req: Request, res: Response) => {
    try {
      const isReady = await checkReadiness();

      if (isReady) {
        res.status(200).json({ ready: true });
      } else {
        res.status(503).json({ ready: false });
      }
    } catch (error) {
      res.status(503).json({ ready: false });
    }
  });

  // Liveness check (for k8s)
  router.get('/live', (req: Request, res: Response) => {
    res.status(200).json({ alive: true });
  });

  // System metrics
  router.get('/metrics', (req: Request, res: Response) => {
    const metrics = getSystemMetrics();
    res.json(metrics);
  });

  return router;
}

async function getHealthStatus() {
  const checks = await Promise.allSettled([checkMongoDB(), checkRedis()]);

  const mongoHealth = checks[0].status === 'fulfilled' && checks[0].value;
  const redisHealth = checks[1].status === 'fulfilled' && checks[1].value;

  const isHealthy = mongoHealth && redisHealth;

  return {
    status: isHealthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    services: {
      mongodb: mongoHealth ? 'up' : 'down',
      redis: redisHealth ? 'up' : 'down',
    },
  };
}

async function getDetailedHealthStatus() {
  const startTime = Date.now();

  const [mongoCheck, redisCheck] = await Promise.allSettled([
    checkMongoDBDetailed(),
    checkRedisDetailed(),
  ]);

  const mongodb =
    mongoCheck.status === 'fulfilled'
      ? mongoCheck.value
      : {
          status: 'down',
          error: 'Connection failed',
        };

  const redis =
    redisCheck.status === 'fulfilled'
      ? redisCheck.value
      : {
          status: 'down',
          error: 'Connection failed',
        };

  const isHealthy = mongodb.status === 'up' && redis.status === 'up';

  return {
    overall: isHealthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    responseTime: Date.now() - startTime,
    services: {
      mongodb,
      redis,
    },
    system: getSystemMetrics(),
  };
}

async function checkMongoDB(): Promise<boolean> {
  try {
    return mongoose.connection.readyState === 1;
  } catch (error) {
    return false;
  }
}

async function checkMongoDBDetailed() {
  try {
    const isConnected = mongoose.connection.readyState === 1;

    if (!isConnected) {
      return { status: 'down', error: 'Not connected' };
    }

    // Ping the database
    const start = Date.now();
    await mongoose.connection.db.admin().ping();
    const responseTime = Date.now() - start;

    // Get database stats
    const stats = await mongoose.connection.db.stats();

    return {
      status: 'up',
      responseTime,
      connections: mongoose.connection.client.topology?.s?.conns?.length || 0,
      database: mongoose.connection.name,
      collections: stats.collections,
      dataSize: stats.dataSize,
      indexSize: stats.indexSize,
    };
  } catch (error: any) {
    return {
      status: 'down',
      error: error.message,
    };
  }
}

async function checkRedis(): Promise<boolean> {
  try {
    const redis = getRedisClient();
    const result = await redis.ping();
    return result === 'PONG';
  } catch (error) {
    return false;
  }
}

async function checkRedisDetailed() {
  try {
    const redis = getRedisClient();

    const start = Date.now();
    const pingResult = await redis.ping();
    const responseTime = Date.now() - start;

    if (pingResult !== 'PONG') {
      return { status: 'down', error: 'Ping failed' };
    }

    // Get Redis info
    const info = await redis.info();
    const lines = info.split('\r\n');
    const stats: any = {};

    lines.forEach((line) => {
      if (line && !line.startsWith('#')) {
        const [key, value] = line.split(':');
        if (key && value) {
          stats[key] = value;
        }
      }
    });

    return {
      status: 'up',
      responseTime,
      version: stats.redis_version,
      usedMemory: stats.used_memory_human,
      connectedClients: parseInt(stats.connected_clients) || 0,
      totalCommands: parseInt(stats.total_commands_processed) || 0,
      uptime: parseInt(stats.uptime_in_seconds) || 0,
    };
  } catch (error: any) {
    return {
      status: 'down',
      error: error.message,
    };
  }
}

async function checkReadiness(): Promise<boolean> {
  try {
    const mongoReady = mongoose.connection.readyState === 1;
    const redis = getRedisClient();
    const redisReady = (await redis.ping()) === 'PONG';

    return mongoReady && redisReady;
  } catch (error) {
    return false;
  }
}

function getSystemMetrics() {
  const cpuUsage = process.cpuUsage();
  const memUsage = process.memoryUsage();

  return {
    cpu: {
      user: cpuUsage.user,
      system: cpuUsage.system,
      cores: os.cpus().length,
      loadAverage: os.loadavg(),
    },
    memory: {
      rss: memUsage.rss,
      heapTotal: memUsage.heapTotal,
      heapUsed: memUsage.heapUsed,
      external: memUsage.external,
      arrayBuffers: memUsage.arrayBuffers,
      systemTotal: os.totalmem(),
      systemFree: os.freemem(),
      systemUsedPercent: (
        ((os.totalmem() - os.freemem()) / os.totalmem()) *
        100
      ).toFixed(2),
    },
    process: {
      pid: process.pid,
      version: process.version,
      uptime: process.uptime(),
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    system: {
      platform: os.platform(),
      release: os.release(),
      hostname: os.hostname(),
      uptime: os.uptime(),
    },
  };
}

export default setupHealthRoutes;
