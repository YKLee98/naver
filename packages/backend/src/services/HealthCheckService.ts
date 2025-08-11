// packages/backend/src/services/HealthCheckService.ts
import { BaseService, ServiceConfig } from './base/BaseService.js';
import { ServiceContainer } from './ServiceContainer.js';
import mongoose from 'mongoose';
import { logger } from '../utils/logger.js';
import os from 'os';
import { performance } from 'perf_hooks';

export interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: Date;
  uptime: number;
  services: Record<string, ServiceHealth>;
  infrastructure: InfrastructureHealth;
  system: SystemHealth;
  version: string;
  environment: string;
}

export interface ServiceHealth {
  name: string;
  status: 'up' | 'down' | 'degraded';
  responseTime?: number;
  lastCheck: Date;
  details?: any;
  error?: string;
}

export interface InfrastructureHealth {
  database: {
    status: 'connected' | 'disconnected' | 'error';
    responseTime: number;
    connections: number;
  };
  redis: {
    status: 'connected' | 'disconnected' | 'error';
    responseTime: number;
    memory?: number;
  };
}

export interface SystemHealth {
  cpu: {
    usage: number;
    cores: number;
  };
  memory: {
    total: number;
    used: number;
    free: number;
    percentage: number;
  };
  disk: {
    total?: number;
    used?: number;
    free?: number;
    percentage?: number;
  };
  process: {
    pid: number;
    memoryUsage: NodeJS.MemoryUsage;
    uptime: number;
  };
}

export class HealthCheckService extends BaseService {
  private services: ServiceContainer;
  private startTime: Date;
  private checkInterval?: NodeJS.Timeout;
  private lastHealthStatus?: HealthStatus;

  constructor(redis: any, services: ServiceContainer) {
    super({
      name: 'HealthCheckService',
      version: '1.0.0',
      redis,
    });

    this.services = services;
    this.startTime = new Date();
  }

  protected override async onInitialize(): Promise<void> {
    // Start periodic health checks
    this.startPeriodicHealthCheck();
  }

  protected override async onCleanup(): Promise<void> {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
  }

  /**
   * Start periodic health checks
   */
  private startPeriodicHealthCheck(): void {
    // Run health check every 30 seconds
    this.checkInterval = setInterval(async () => {
      try {
        const health = await this.performHealthCheck();
        this.lastHealthStatus = health;

        if (health.status === 'unhealthy') {
          logger.error('System health check failed', health);
          this.emit('health:unhealthy', health);
        } else if (health.status === 'degraded') {
          logger.warn('System health degraded', health);
          this.emit('health:degraded', health);
        }
      } catch (error) {
        logger.error('Health check error:', error);
      }
    }, 30000);
  }

  /**
   * Get current health status
   */
  async getHealthStatus(): Promise<HealthStatus> {
    return this.executeWithMetrics(async () => {
      return await this.performHealthCheck();
    }, 'getHealthStatus');
  }

  /**
   * Perform health check
   */
  private async performHealthCheck(): Promise<HealthStatus> {
    const [services, infrastructure, system] = await Promise.all([
      this.checkServices(),
      this.checkInfrastructure(),
      this.checkSystem(),
    ]);

    // Determine overall status
    let overallStatus: 'healthy' | 'unhealthy' | 'degraded' = 'healthy';

    // Check service statuses
    const serviceStatuses = Object.values(services);
    const downServices = serviceStatuses.filter((s) => s.status === 'down');
    const degradedServices = serviceStatuses.filter(
      (s) => s.status === 'degraded'
    );

    if (downServices.length > 0) {
      overallStatus = 'unhealthy';
    } else if (degradedServices.length > 0) {
      overallStatus = 'degraded';
    }

    // Check infrastructure
    if (
      infrastructure.database.status !== 'connected' ||
      infrastructure.redis.status !== 'connected'
    ) {
      overallStatus = 'unhealthy';
    }

    // Check system resources
    if (system.memory.percentage > 90 || system.cpu.usage > 90) {
      overallStatus = overallStatus === 'unhealthy' ? 'unhealthy' : 'degraded';
    }

    return {
      status: overallStatus,
      timestamp: new Date(),
      uptime: Date.now() - this.startTime.getTime(),
      services,
      infrastructure,
      system,
      version: process.env['npm_package_version'] || '1.0.0',
      environment: process.env['NODE_ENV'] || 'development',
    };
  }

  /**
   * Check services health
   */
  private async checkServices(): Promise<Record<string, ServiceHealth>> {
    const serviceChecks: Record<string, ServiceHealth> = {};

    // Check Naver Auth Service
    if (this.services.hasService('naverAuthService')) {
      serviceChecks.naverAuth = await this.checkService(
        'naverAuthService',
        async () => {
          const service = this.services.getService('naverAuthService');
          const health = await service.healthCheck();
          return health.status === 'healthy';
        }
      );
    }

    // Check Shopify Service
    if (this.services.hasService('shopifyService')) {
      serviceChecks.shopify = await this.checkService(
        'shopifyService',
        async () => {
          const service = this.services.getService('shopifyService');
          const health = await service.healthCheck();
          return health.status === 'healthy';
        }
      );
    }

    // Check Sync Service
    if (this.services.hasService('syncService')) {
      serviceChecks.sync = await this.checkService('syncService', async () => {
        const service = this.services.getService('syncService');
        const health = await service.healthCheck();
        return health.status === 'healthy';
      });
    }

    return serviceChecks;
  }

  /**
   * Check individual service
   */
  private async checkService(
    name: string,
    checker: () => Promise<boolean>
  ): Promise<ServiceHealth> {
    const startTime = performance.now();

    try {
      const isHealthy = await this.executeWithTimeout(
        checker,
        5000,
        `${name} health check`
      );

      const responseTime = performance.now() - startTime;

      return {
        name,
        status: isHealthy ? 'up' : 'down',
        responseTime,
        lastCheck: new Date(),
      };
    } catch (error) {
      return {
        name,
        status: 'down',
        responseTime: performance.now() - startTime,
        lastCheck: new Date(),
        error: (error as Error).message,
      };
    }
  }

  /**
   * Check infrastructure health
   */
  private async checkInfrastructure(): Promise<InfrastructureHealth> {
    const [database, redis] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
    ]);

    return { database, redis };
  }

  /**
   * Check database health
   */
  private async checkDatabase(): Promise<InfrastructureHealth['database']> {
    const startTime = performance.now();

    try {
      // Check MongoDB connection
      const state = mongoose.connection.readyState;
      const isConnected = state === 1; // 1 = connected

      // Ping database
      if (isConnected) {
        await mongoose.connection.db.admin().ping();
      }

      const responseTime = performance.now() - startTime;

      return {
        status: isConnected ? 'connected' : 'disconnected',
        responseTime,
        connections: mongoose.connections.length,
      };
    } catch (error) {
      return {
        status: 'error',
        responseTime: performance.now() - startTime,
        connections: 0,
      };
    }
  }

  /**
   * Check Redis health
   */
  private async checkRedis(): Promise<InfrastructureHealth['redis']> {
    const startTime = performance.now();

    try {
      if (!this.redis) {
        return {
          status: 'disconnected',
          responseTime: 0,
        };
      }

      // Ping Redis
      const result = await this.redis.ping();
      const isConnected = result === 'PONG';

      const responseTime = performance.now() - startTime;

      // Get memory info if possible
      let memory: number | undefined;
      try {
        const info = await this.redis.info('memory');
        const match = info.match(/used_memory:(\d+)/);
        if (match) {
          memory = parseInt(match[1], 10);
        }
      } catch {
        // Ignore error - not critical
      }

      return {
        status: isConnected ? 'connected' : 'disconnected',
        responseTime,
        memory,
      };
    } catch (error) {
      return {
        status: 'error',
        responseTime: performance.now() - startTime,
      };
    }
  }

  /**
   * Check system health
   */
  private async checkSystem(): Promise<SystemHealth> {
    const cpus = os.cpus();
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;

    // Calculate CPU usage
    const cpuUsage = this.calculateCPUUsage(cpus);

    // Get process memory usage
    const processMemory = process.memoryUsage();

    return {
      cpu: {
        usage: cpuUsage,
        cores: cpus.length,
      },
      memory: {
        total: totalMemory,
        used: usedMemory,
        free: freeMemory,
        percentage: (usedMemory / totalMemory) * 100,
      },
      disk: {
        // Disk info would require additional dependencies
        // Leaving as placeholder
      },
      process: {
        pid: process.pid,
        memoryUsage: processMemory,
        uptime: process.uptime(),
      },
    };
  }

  /**
   * Calculate CPU usage percentage
   */
  private calculateCPUUsage(cpus: os.CpuInfo[]): number {
    let totalIdle = 0;
    let totalTick = 0;

    cpus.forEach((cpu) => {
      for (const type in cpu.times) {
        totalTick += cpu.times[type as keyof os.CpuTimes];
      }
      totalIdle += cpu.times.idle;
    });

    const idle = totalIdle / cpus.length;
    const total = totalTick / cpus.length;
    const usage = 100 - ~~((100 * idle) / total);

    return usage;
  }

  /**
   * Get cached health status
   */
  getCachedHealthStatus(): HealthStatus | undefined {
    return this.lastHealthStatus;
  }

  /**
   * Force health check
   */
  async forceHealthCheck(): Promise<HealthStatus> {
    const health = await this.performHealthCheck();
    this.lastHealthStatus = health;
    return health;
  }
}
