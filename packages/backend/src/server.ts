// packages/backend/src/server.ts
import 'dotenv/config';
import { createServer } from 'http';
import cluster from 'cluster';
import os from 'os';
import { connectDB } from './config/database.js';
import { initializeRedis } from './config/redis.js';
import { ServiceContainer } from './services/ServiceContainer.js';
import { App } from './app.js';
import { logger } from './utils/logger.js';
import { validateConfig, config } from './config/index.js';
import { setupCronJobs } from './cron/index.js';
import { gracefulShutdown, registerShutdownHandlers } from './utils/shutdown.js';
import { HealthCheckService } from './services/HealthCheckService.js';
import { MetricsCollector } from './utils/metrics.js';

const PORT = config.server.port;
const HOST = config.server.host;
const ENABLE_CLUSTER = config.features.enableClustering;
const WORKER_COUNT = config.features.workerCount;

interface ServerComponents {
  app?: App;
  httpServer?: any;
  services?: ServiceContainer;
  healthCheck?: HealthCheckService;
  metrics?: MetricsCollector;
}

class Server {
  private components: ServerComponents = {};
  private isShuttingDown = false;
  private startTime: number = Date.now();

  async start(): Promise<void> {
    try {
      logger.info('🚀 Starting server...');
      logger.info(`Environment: ${config.env}`);
      logger.info(`Node version: ${process.version}`);
      logger.info(`Process ID: ${process.pid}`);

      // 1. Validate configuration
      await this.validateConfiguration();

      // 2. Setup clustering if enabled
      if (ENABLE_CLUSTER && cluster.isPrimary) {
        return this.setupClustering();
      }

      // 3. Initialize infrastructure
      await this.initializeInfrastructure();

      // 4. Initialize services
      await this.initializeServices();

      // 5. Initialize application
      await this.initializeApplication();

      // 6. Start HTTP server
      await this.startHttpServer();

      // 7. Setup cron jobs (only on primary worker or non-clustered)
      if (!ENABLE_CLUSTER || (cluster.worker && cluster.worker.id === 1)) {
        await this.setupCronJobs();
      }

      // 8. Setup graceful shutdown
      this.setupGracefulShutdown();

      // 9. Log startup completion
      const startupTime = ((Date.now() - this.startTime) / 1000).toFixed(2);
      logger.info(`✅ Server started successfully in ${startupTime}s`);
      logger.info(`🌐 Server running at http://${HOST}:${PORT}`);
      logger.info(`📚 API documentation at http://${HOST}:${PORT}/api-docs`);
      logger.info(`❤️  Health check at http://${HOST}:${PORT}/health`);
      logger.info(`📊 Metrics at http://${HOST}:${PORT}/metrics`);

    } catch (error) {
      logger.error('❌ Failed to start server:', error);
      process.exit(1);
    }
  }

  private async validateConfiguration(): Promise<void> {
    logger.info('🔍 Validating configuration...');
    
    const errors = validateConfig();
    
    if (errors.length > 0) {
      const criticalErrors = errors.filter(err =>
        err.includes('JWT_SECRET') ||
        err.includes('ENCRYPTION_KEY') ||
        err.includes('NAVER_CLIENT_ID') ||
        err.includes('NAVER_CLIENT_SECRET')
      );

      if (criticalErrors.length > 0) {
        logger.error('❌ Critical configuration errors:', criticalErrors);
        throw new Error('Critical configuration errors found');
      }

      logger.warn('⚠️  Non-critical configuration warnings:', errors);
    }

    logger.info('✅ Configuration validated');
  }

  private async initializeInfrastructure(): Promise<void> {
    logger.info('🔌 Initializing infrastructure...');

    // Connect to MongoDB
    await connectDB();
    logger.info('✅ MongoDB connected');

    // Initialize Redis
    const redis = await initializeRedis();
    this.components.services = await ServiceContainer.initialize(redis);
    logger.info('✅ Redis initialized');

    // Initialize metrics collector
    this.components.metrics = new MetricsCollector();
    logger.info('✅ Metrics collector initialized');

    // Initialize health check service
    this.components.healthCheck = new HealthCheckService(
      redis,
      this.components.services
    );
    logger.info('✅ Health check service initialized');
  }

  private async initializeServices(): Promise<void> {
    logger.info('📦 Initializing services...');
    
    // Services are initialized in ServiceContainer
    const services = this.components.services!;
    
    // Log available services
    const availableServices = [
      'naverAuthService',
      'naverProductService',
      'shopifyService',
      'syncService',
      'exchangeRateService'
    ];

    for (const service of availableServices) {
      if (services.hasService(service as any)) {
        logger.info(`✅ ${service} initialized`);
      }
    }
  }

  private async initializeApplication(): Promise<void> {
    logger.info('🚀 Initializing Express application...');
    
    this.components.app = new App(this.components.services!);
    await this.components.app.initialize();
    
    logger.info('✅ Express application initialized');
  }

  private async startHttpServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.components.httpServer = createServer(this.components.app!.getApp());
      
      this.components.httpServer.listen(PORT, HOST, () => {
        logger.info(`✅ HTTP server listening on ${HOST}:${PORT}`);
        resolve();
      });

      this.components.httpServer.on('error', (error: any) => {
        if (error.syscall !== 'listen') {
          reject(error);
          return;
        }

        switch (error.code) {
          case 'EACCES':
            logger.error(`❌ Port ${PORT} requires elevated privileges`);
            process.exit(1);
            break;
          case 'EADDRINUSE':
            logger.error(`❌ Port ${PORT} is already in use`);
            process.exit(1);
            break;
          default:
            reject(error);
        }
      });
    });
  }

  private async setupCronJobs(): Promise<void> {
    logger.info('⏰ Setting up cron jobs...');
    
    await setupCronJobs(this.components.services!);
    
    logger.info('✅ Cron jobs scheduled');
  }

  private setupClustering(): void {
    logger.info(`🔄 Setting up cluster with ${WORKER_COUNT} workers...`);

    // Fork workers
    for (let i = 0; i < WORKER_COUNT; i++) {
      const worker = cluster.fork();
      logger.info(`Worker ${worker.process.pid} started`);
    }

    // Handle worker events
    cluster.on('exit', (worker, code, signal) => {
      logger.error(`Worker ${worker.process.pid} died (${signal || code})`);
      
      if (!this.isShuttingDown) {
        logger.info('Starting a new worker...');
        const newWorker = cluster.fork();
        logger.info(`Worker ${newWorker.process.pid} started`);
      }
    });

    cluster.on('online', (worker) => {
      logger.info(`Worker ${worker.process.pid} is online`);
    });

    // Setup graceful shutdown for cluster
    process.on('SIGTERM', () => this.shutdownCluster());
    process.on('SIGINT', () => this.shutdownCluster());
  }

  private async shutdownCluster(): Promise<void> {
    if (this.isShuttingDown) return;
    
    this.isShuttingDown = true;
    logger.info('🛑 Shutting down cluster...');

    // Disconnect all workers
    for (const id in cluster.workers) {
      const worker = cluster.workers[id];
      if (worker) {
        worker.disconnect();
        
        // Force kill after timeout
        setTimeout(() => {
          if (!worker.isDead()) {
            worker.kill();
          }
        }, 10000);
      }
    }

    // Wait for all workers to exit
    await new Promise<void>((resolve) => {
      const checkWorkers = setInterval(() => {
        if (Object.keys(cluster.workers!).length === 0) {
          clearInterval(checkWorkers);
          resolve();
        }
      }, 100);
    });

    logger.info('✅ All workers shut down');
    process.exit(0);
  }

  private setupGracefulShutdown(): void {
    registerShutdownHandlers(async () => {
      if (this.isShuttingDown) return;
      
      this.isShuttingDown = true;
      logger.info('🛑 Initiating graceful shutdown...');

      try {
        // Stop accepting new connections
        if (this.components.httpServer) {
          await new Promise<void>((resolve) => {
            this.components.httpServer.close(() => {
              logger.info('✅ HTTP server closed');
              resolve();
            });
          });
        }

        // Cleanup services
        if (this.components.services) {
          await this.components.services.cleanup();
          logger.info('✅ Services cleaned up');
        }

        // Close database connections
        await gracefulShutdown();
        logger.info('✅ Database connections closed');

        // Log final metrics
        if (this.components.metrics) {
          const metrics = await this.components.metrics.getMetrics();
          logger.info('📊 Final metrics:', metrics);
        }

        const uptime = ((Date.now() - this.startTime) / 1000).toFixed(2);
        logger.info(`✅ Server shut down gracefully after ${uptime}s uptime`);
        
        process.exit(0);
      } catch (error) {
        logger.error('❌ Error during shutdown:', error);
        process.exit(1);
      }
    });
  }
}

// Error handlers
process.on('uncaughtException', (error) => {
  logger.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start server
const server = new Server();
server.start().catch(error => {
  logger.error('❌ Failed to start server:', error);
  process.exit(1);
});

export { Server };