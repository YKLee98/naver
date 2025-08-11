// packages/backend/src/server.ts
import express from 'express';
import { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { config } from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logger } from './utils/logger.js';
import { initializeMongoDB } from './config/mongodb.js';
import { initializeRedis } from './config/redis.js';
import { ServiceContainer } from './services/ServiceContainer.js';
import { App } from './app.js';
import { CronManager } from './cron/index.js';
import { ShutdownManager } from './utils/shutdown.js';
import type { ServiceName } from './services/ServiceContainer.js';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: join(__dirname, '../../.env') });

/**
 * Enterprise-grade Server Class
 * Handles initialization, lifecycle, and graceful shutdown
 */
class Server {
  private httpServer: HttpServer | null = null;
  private io: SocketIOServer | null = null;
  private services: ServiceContainer | null = null;
  private app: App | null = null;
  private cronManager: CronManager | null = null;
  private shutdownManager: ShutdownManager;
  private healthService: any = null;
  private isStarted: boolean = false;

  constructor() {
    this.shutdownManager = ShutdownManager.getInstance();
    this.setupShutdownHandlers();
    this.logConfiguration();
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    if (this.isStarted) {
      logger.warn('Server already started');
      return;
    }

    try {
      logger.info('🚀 Starting server...');

      // Initialize infrastructure
      await this.initializeInfrastructure();

      // Initialize services
      await this.initializeServices();

      // Initialize application
      await this.initializeApplication();

      // Initialize WebSocket
      await this.initializeWebSocket();

      // Setup health check endpoints
      this.setupHealthCheckEndpoints();

      // Initialize cron jobs
      await this.initializeCronJobs();

      // Start HTTP server
      await this.startHttpServer();

      this.isStarted = true;
      logger.info('✨ Server started successfully');
      this.logStartupSummary();
    } catch (error) {
      logger.error('❌ Failed to start server:', error);
      await this.shutdown('startup-failure');
      process.exit(1);
    }
  }

  /**
   * Initialize infrastructure with graceful handling of optional services
   */
  private async initializeInfrastructure(): Promise<void> {
    logger.info('🔌 Initializing infrastructure...');

    try {
      // Initialize MongoDB
      await initializeMongoDB();

      // Initialize Redis
      await initializeRedis();

      // Try to initialize MetricsCollector (optional)
      try {
        const { MetricsCollector } = await import(
          './monitoring/MetricsCollector.js'
        );
        const metricsCollector = MetricsCollector.getInstance();
        await metricsCollector.initialize();
        logger.info('✅ Metrics collector initialized');
      } catch (error: any) {
        if (error.code === 'ERR_MODULE_NOT_FOUND') {
          logger.warn(
            'Metrics collector not available - continuing without metrics'
          );
        } else {
          logger.error('Metrics collector initialization failed:', error);
        }
      }

      // Try to initialize HealthCheckService (optional)
      try {
        const { HealthCheckService } = await import(
          './health/HealthCheckService.js'
        );
        if (this.services) {
          this.healthService = new HealthCheckService(this.services);
          logger.info('✅ Health check service initialized');
        }
      } catch (error: any) {
        if (error.code === 'ERR_MODULE_NOT_FOUND') {
          logger.warn(
            'Health check service not available - continuing without health checks'
          );
        } else {
          logger.error('Health check service initialization failed:', error);
        }
      }

      logger.info('✅ Infrastructure initialized');
    } catch (error) {
      logger.error('Infrastructure initialization failed:', error);
      throw error;
    }
  }

  /**
   * Initialize all services
   */
  private async initializeServices(): Promise<void> {
    logger.info('📦 Initializing services...');

    try {
      // Get Redis instance
      const redis = await initializeRedis();

      // Initialize Service Container
      this.services = await ServiceContainer.initialize(redis);

      // Validate critical services
      await this.validateCriticalServices();

      // Initialize health service if not already done
      if (!this.healthService && this.services) {
        try {
          const { HealthCheckService } = await import(
            './health/HealthCheckService.js'
          );
          this.healthService = new HealthCheckService(this.services);
          logger.info('✅ Health check service initialized (post-services)');
        } catch (error: any) {
          logger.debug('Health check service still not available');
        }
      }

      logger.info('✅ All services initialized successfully');
    } catch (error) {
      logger.error('Service initialization failed:', error);
      throw error;
    }
  }

  /**
   * Validate critical services are available
   */
  private async validateCriticalServices(): Promise<void> {
    if (!this.services) {
      throw new Error('ServiceContainer not initialized');
    }

    const criticalServices: ServiceName[] = [
      'naverAuthService',
      'naverProductService',
      'syncService',
    ];

    const missingServices: string[] = [];

    for (const serviceName of criticalServices) {
      if (!this.services.hasService(serviceName)) {
        missingServices.push(serviceName);
      }
    }

    if (missingServices.length > 0) {
      throw new Error(
        `Critical services not available: ${missingServices.join(', ')}`
      );
    }

    logger.info('✅ All critical services validated');
  }

  /**
   * Initialize Express application
   */
  private async initializeApplication(): Promise<void> {
    logger.info('🚀 Initializing Express app...');

    if (!this.services) {
      throw new Error('Services must be initialized before app');
    }

    this.app = new App(this.services);
    await this.app.initialize();

    logger.info('✅ Express app initialized');
  }

  /**
   * Initialize WebSocket server
   */
  private async initializeWebSocket(): Promise<void> {
    if (process.env['ENABLE_WEBSOCKET'] !== 'true') {
      logger.info('WebSocket is disabled');
      return;
    }

    logger.info('🔌 Initializing WebSocket server...');

    if (!this.httpServer || !this.services) {
      throw new Error(
        'HTTP server and services must be initialized before WebSocket'
      );
    }

    try {
      const wsPort = parseInt(process.env['WS_PORT'] || '3001', 10);

      this.io = new SocketIOServer(this.httpServer, {
        cors: {
          origin: process.env['CORS_ORIGIN']?.split(',') || [
            'http://localhost:3000',
          ],
          credentials: true,
        },
        path: '/socket.io',
        transports: ['websocket', 'polling'],
      });

      this.services.io = this.io;

      const { setupWebSocketHandlers } = await import('./websocket/index.js');
      setupWebSocketHandlers(this.io, this.services);

      logger.info(`✅ WebSocket server initialized on port ${wsPort}`);
    } catch (error: any) {
      logger.error('Failed to initialize WebSocket:', error);
      // WebSocket is optional, so don't fail the entire server
      logger.warn('Continuing without WebSocket support');
    }
  }

  /**
   * Setup health check endpoints
   */
  private setupHealthCheckEndpoints(): void {
    if (!this.app || !this.app.express) {
      logger.warn('Express app not available for health check endpoints');
      return;
    }

    // Basic health check endpoint (always available)
    this.app.express.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env['NODE_ENV'] || 'development',
        version: process.env.npm_package_version || '1.0.0',
      });
    });

    // Readiness check endpoint
    this.app.express.get('/health/ready', (req, res) => {
      if (this.isStarted && this.services) {
        res.json({
          status: 'ready',
          timestamp: new Date().toISOString(),
        });
      } else {
        res.status(503).json({
          status: 'not_ready',
          timestamp: new Date().toISOString(),
        });
      }
    });

    // Liveness check endpoint
    this.app.express.get('/health/live', (req, res) => {
      res.json({
        status: 'alive',
        timestamp: new Date().toISOString(),
        pid: process.pid,
      });
    });

    // Detailed health check endpoint (if service is available)
    this.app.express.get('/health/detailed', async (req, res) => {
      if (this.healthService) {
        try {
          const health = await this.healthService.getHealth();
          res.json(health);
        } catch (error: any) {
          res.status(503).json({
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString(),
          });
        }
      } else {
        res.json({
          status: 'healthy',
          message: 'Detailed health check service not available',
          timestamp: new Date().toISOString(),
        });
      }
    });

    logger.info('✅ Health check endpoints configured');
  }

  /**
   * Initialize cron jobs
   */
  private async initializeCronJobs(): Promise<void> {
    if (process.env['ENABLE_CRON'] !== 'true') {
      logger.info('Cron jobs are disabled');
      return;
    }

    logger.info('⏰ Initializing cron jobs...');

    if (!this.services) {
      throw new Error('Services must be initialized before cron jobs');
    }

    this.cronManager = new CronManager(this.services);
    await this.cronManager.start();

    logger.info('✅ Cron jobs initialized');
  }

  /**
   * Start HTTP server
   */
  private async startHttpServer(): Promise<void> {
    if (!this.app) {
      throw new Error('App must be initialized before starting HTTP server');
    }

    const port = parseInt(process.env['PORT'] || '3000', 10);
    const host = process.env['HOST'] || 'localhost';

    return new Promise((resolve, reject) => {
      try {
        this.httpServer = this.app!.express.listen(port, host, () => {
          logger.info(`🌐 HTTP server listening on http://${host}:${port}`);
          logger.info(
            `📝 API documentation available at http://${host}:${port}/api-docs`
          );
          resolve();
        });

        this.httpServer.on('error', (error: any) => {
          if (error.code === 'EADDRINUSE') {
            logger.error(`Port ${port} is already in use`);
          } else {
            logger.error('HTTP server error:', error);
          }
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Graceful shutdown
   */
  async shutdown(reason: string = 'manual'): Promise<void> {
    logger.info(`🛑 Graceful shutdown initiated (${reason})`);

    try {
      // Stop accepting new connections
      if (this.httpServer) {
        this.httpServer.close(() => {
          logger.info('HTTP server closed');
        });
      }

      // Close WebSocket connections
      if (this.io) {
        this.io.close(() => {
          logger.info('WebSocket server closed');
        });
      }

      // Stop cron jobs
      if (this.cronManager) {
        await this.cronManager.stop();
        logger.info('Cron jobs stopped');
      }

      // Cleanup services
      if (this.services) {
        await this.services.cleanup();
        logger.info('Services cleaned up');
      }

      // Close app
      if (this.app) {
        await this.app.close();
        logger.info('App closed');
      }

      logger.info('✅ Graceful shutdown completed');
    } catch (error) {
      logger.error('Error during shutdown:', error);
    }
  }

  /**
   * Setup shutdown handlers
   */
  private setupShutdownHandlers(): void {
    // Graceful shutdown on SIGTERM and SIGINT
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM received');
      await this.shutdown('SIGTERM');
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      logger.info('SIGINT received');
      await this.shutdown('SIGINT');
      process.exit(0);
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', async (error) => {
      logger.error('Uncaught exception:', error);
      await this.shutdown('uncaught-exception');
      process.exit(1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', async (reason, promise) => {
      logger.error('Unhandled rejection at:', promise, 'reason:', reason);
      await this.shutdown('unhandled-rejection');
      process.exit(1);
    });
  }

  /**
   * Log startup configuration
   */
  private logConfiguration(): void {
    logger.info('📋 Configuration loaded:', {
      env: process.env['NODE_ENV'] || 'development',
      server: {
        port: process.env['PORT'] || 3000,
        wsPort: process.env['WS_PORT'] || 3001,
        host: process.env['HOST'] || 'localhost',
      },
      naver: {
        clientId:
          process.env['NAVER_CLIENT_ID']?.substring(0, 20) + '...' || 'NOT_SET',
        clientSecretLength: process.env['NAVER_CLIENT_SECRET']?.length || 0,
        clientSecretPreview:
          process.env['NAVER_CLIENT_SECRET']?.substring(0, 10) + '...' ||
          'NOT_SET',
        apiBaseUrl:
          process.env['NAVER_API_BASE_URL'] || 'https://api.commerce.naver.com',
        storeId: process.env['NAVER_STORE_ID'] || 'NOT_SET',
      },
      shopify: {
        storeDomain: process.env['SHOPIFY_SHOP_DOMAIN'] || 'NOT_SET',
        apiVersion: process.env['SHOPIFY_API_VERSION'] || '2025-04',
        hasAccessToken: !!process.env['SHOPIFY_ACCESS_TOKEN'],
      },
      features: {
        enableShopify: process.env['ENABLE_SHOPIFY'] === 'true',
        enableClustering: process.env['ENABLE_CLUSTERING'] === 'true',
        workerCount: parseInt(process.env['WORKER_COUNT'] || '4', 10),
      },
    });
  }

  /**
   * Log startup summary
   */
  private logStartupSummary(): void {
    const port = process.env['PORT'] || 3000;
    const host = process.env['HOST'] || 'localhost';

    logger.info('═══════════════════════════════════════════════════');
    logger.info('🎉 Server started successfully!');
    logger.info('═══════════════════════════════════════════════════');
    logger.info(`📍 Address: http://${host}:${port}`);
    logger.info(`📚 API Docs: http://${host}:${port}/api-docs`);
    logger.info(`💚 Health: http://${host}:${port}/health`);
    logger.info(`🔧 Environment: ${process.env['NODE_ENV'] || 'development'}`);
    logger.info('═══════════════════════════════════════════════════');
  }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  try {
    const server = new Server();
    await server.start();
  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
main().catch((error) => {
  logger.error('Fatal error:', error);
  process.exit(1);
});
