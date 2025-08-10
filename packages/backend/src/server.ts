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
import { gracefulShutdown } from './utils/shutdown.js';

// Server configuration
const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || 'localhost';
const ENABLE_CLUSTER = process.env.CLUSTER_ENABLED === 'true';
const WORKER_COUNT = Number(process.env.WORKER_COUNT) || os.cpus().length;

/**
 * Enterprise Server Class
 * Handles complete server lifecycle with clustering, monitoring, and graceful shutdown
 */
class Server {
  private app?: App;
  private httpServer?: any;
  private services?: ServiceContainer;
  private metricsCollector?: any;
  private healthCheckService?: any;
  private isShuttingDown = false;
  private startTime: number = 0;

  /**
   * Start the server with complete initialization sequence
   */
  async start(): Promise<void> {
    this.startTime = Date.now();

    try {
      // 1. Validate configuration
      await this.validateConfiguration();

      // 2. Setup clustering if enabled
      if (ENABLE_CLUSTER && cluster.isPrimary) {
        this.setupClustering();
        return;
      }

      // 3. Initialize infrastructure (DB, Redis, etc.)
      await this.initializeInfrastructure();

      // 4. Initialize services
      await this.initializeServices();

      // 5. Initialize Express App
      await this.initializeApplication();

      // 6. Create HTTP Server
      this.httpServer = createServer(this.app!.getApp());

      // 7. Initialize WebSocket if enabled
      await this.initializeWebSocket();

      // 8. Setup cron jobs
      await this.setupCronJobs();

      // 9. Start listening
      await this.listen();

      // 10. Log startup success
      const elapsed = Date.now() - this.startTime;
      this.logStartupSuccess(elapsed);

      // 11. Setup shutdown handlers
      this.setupShutdownHandlers();

      // 12. Setup health monitoring
      this.setupHealthMonitoring();

    } catch (error) {
      logger.error('❌ Failed to start server:', error);
      await this.cleanup();
      process.exit(1);
    }
  }

  /**
   * Validate configuration
   */
  private async validateConfiguration(): Promise<void> {
    logger.info('🔍 Validating configuration...');
    const configErrors = validateConfig();
    
    if (configErrors.length > 0) {
      logger.error('Configuration validation failed:', configErrors);
      
      // Check for critical errors
      const criticalErrors = configErrors.filter(err => 
        err.includes('NAVER_CLIENT_ID') || 
        err.includes('NAVER_CLIENT_SECRET') || 
        err.includes('SHOPIFY_STORE_DOMAIN') || 
        err.includes('SHOPIFY_ACCESS_TOKEN') ||
        err.includes('JWT_SECRET')
      );

      if (criticalErrors.length > 0) {
        logger.error('❌ Critical configuration errors found. Cannot start server.');
        logger.error('Please check your .env file and ensure all required variables are set.');
        logger.error('Critical errors:', criticalErrors);
        process.exit(1);
      } else {
        logger.warn('⚠️ Non-critical configuration warnings. Server will start with limited functionality.');
        logger.warn('Warnings:', configErrors);
      }
    } else {
      logger.info('✅ Configuration validated successfully');
    }
  }

  /**
   * Setup clustering for production
   */
  private setupClustering(): void {
    logger.info(`🎯 Master process ${process.pid} is running`);
    logger.info(`🔧 Forking ${WORKER_COUNT} workers...`);

    // Fork workers
    for (let i = 0; i < WORKER_COUNT; i++) {
      const worker = cluster.fork();
      logger.info(`Worker ${i + 1} forked with PID ${worker.process.pid}`);
    }

    // Handle worker events
    cluster.on('exit', (worker, code, signal) => {
      logger.error(`Worker ${worker.process.pid} died (${signal || code})`);
      
      if (!this.isShuttingDown) {
        logger.info('Restarting worker...');
        const newWorker = cluster.fork();
        logger.info(`New worker started with PID ${newWorker.process.pid}`);
      }
    });

    cluster.on('online', (worker) => {
      logger.info(`Worker ${worker.process.pid} is online`);
    });

    cluster.on('disconnect', (worker) => {
      logger.warn(`Worker ${worker.process.pid} disconnected`);
    });

    // Handle master process signals
    process.on('SIGTERM', () => this.shutdownCluster('SIGTERM'));
    process.on('SIGINT', () => this.shutdownCluster('SIGINT'));
  }

  /**
   * Shutdown cluster gracefully
   */
  private async shutdownCluster(signal: string): Promise<void> {
    if (this.isShuttingDown) return;
    
    this.isShuttingDown = true;
    logger.info(`${signal} received, shutting down cluster...`);

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
        }, 5000);
      }
    }

    // Wait for all workers to exit
    await new Promise<void>((resolve) => {
      let remainingWorkers = Object.keys(cluster.workers).length;
      
      if (remainingWorkers === 0) {
        resolve();
        return;
      }

      cluster.on('exit', () => {
        remainingWorkers--;
        if (remainingWorkers === 0) {
          resolve();
        }
      });
    });

    logger.info('All workers shut down');
    process.exit(0);
  }

  /**
   * Initialize infrastructure components
   */
  private async initializeInfrastructure(): Promise<void> {
    logger.info('🔌 Initializing infrastructure...');
    
    try {
      // Connect to MongoDB
      await connectDB();
      logger.info('✅ MongoDB connected');

      // Initialize Redis
      const redis = await initializeRedis();
      logger.info('✅ Redis initialized');

      // Initialize metrics collector (optional)
      await this.initializeMetrics();

      // Initialize health check service (optional)
      await this.initializeHealthCheck();

    } catch (error) {
      logger.error('Infrastructure initialization failed:', error);
      throw error;
    }
  }

  /**
   * Initialize metrics collector
   */
  private async initializeMetrics(): Promise<void> {
    try {
      const { MetricsCollector } = await import('./monitoring/MetricsCollector.js');
      const redis = await initializeRedis();
      this.metricsCollector = new MetricsCollector(redis);
      await this.metricsCollector.initialize();
      logger.info('✅ Metrics collector initialized');
    } catch (error) {
      logger.warn('Metrics collector not available:', error);
    }
  }

  /**
   * Initialize health check service
   */
  private async initializeHealthCheck(): Promise<void> {
    try {
      const { HealthCheckService } = await import('./health/HealthCheckService.js');
      const redis = await initializeRedis();
      this.healthCheckService = new HealthCheckService(redis);
      await this.healthCheckService.initialize();
      logger.info('✅ Health check service initialized');
    } catch (error) {
      logger.warn('Health check service not available:', error);
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

    const criticalServices = [
      'naverAuthService',
      'naverProductService',
      'syncService'
    ];
    
    const missingServices: string[] = [];
    
    for (const serviceName of criticalServices) {
      if (!this.services.hasService(serviceName as any)) {
        missingServices.push(serviceName);
      }
    }
    
    if (missingServices.length > 0) {
      throw new Error(`Critical services not available: ${missingServices.join(', ')}`);
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
    if (process.env.ENABLE_WEBSOCKET !== 'true') {
      logger.info('WebSocket is disabled');
      return;
    }

    try {
      logger.info('🔌 Initializing WebSocket server...');
      
      if (!this.app || !this.httpServer) {
        throw new Error('App and HTTP server must be initialized first');
      }

      await this.app.initializeWebSocket(this.httpServer);
      logger.info('✅ WebSocket server initialized');
    } catch (error) {
      logger.error('WebSocket initialization failed:', error);
      // Don't throw - WebSocket is optional
    }
  }

  /**
   * Setup cron jobs
   */
  private async setupCronJobs(): Promise<void> {
    // Only setup cron jobs in primary worker or non-clustered mode
    if (ENABLE_CLUSTER && cluster.worker?.id !== 1) {
      logger.info('Skipping cron jobs (not primary worker)');
      return;
    }

    try {
      logger.info('⏰ Setting up cron jobs...');
      
      if (!this.services) {
        throw new Error('Services must be initialized before cron jobs');
      }

      setupCronJobs(this.services);
      logger.info('✅ Cron jobs setup completed');
    } catch (error) {
      logger.error('Cron job setup failed:', error);
      // Don't throw - cron jobs are optional
    }
  }

  /**
   * Start listening on configured port
   */
  private async listen(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.httpServer) {
        reject(new Error('HTTP server not initialized'));
        return;
      }

      this.httpServer.listen(PORT, HOST, () => {
        resolve();
      }).on('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EADDRINUSE') {
          logger.error(`Port ${PORT} is already in use`);
        } else if (error.code === 'EACCES') {
          logger.error(`Port ${PORT} requires elevated privileges`);
        } else {
          logger.error('Server listen error:', error);
        }
        reject(error);
      });
    });
  }

  /**
   * Log successful startup
   */
  private logStartupSuccess(elapsed: number): void {
    const workerId = cluster.worker?.id ? ` (Worker ${cluster.worker.id})` : '';
    const memoryUsage = process.memoryUsage();
    const memoryMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
    
    logger.info(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║   🚀 Hallyu ERP Backend Server Started Successfully!      ║
║                                                            ║
╠════════════════════════════════════════════════════════════╣
║   Environment:  ${config.env.padEnd(43)}║
║   Port:         ${PORT.toString().padEnd(43)}║
║   Host:         ${HOST.padEnd(43)}║
║   Worker:       ${workerId.padEnd(43)}║
║   Node Version: ${process.version.padEnd(43)}║
║   Memory Usage: ${`${memoryMB} MB`.padEnd(43)}║
║   Startup Time: ${`${elapsed}ms`.padEnd(43)}║
║                                                            ║
║   Services Status:                                         ║
║   ✅ MongoDB    Connected                                 ║
║   ✅ Redis      Connected                                 ║
║   ✅ Services   Initialized                               ║
║   ${process.env.ENABLE_WEBSOCKET === 'true' ? '✅' : '⏸️ '} WebSocket  ${process.env.ENABLE_WEBSOCKET === 'true' ? 'Connected' : 'Disabled'}                                  ║
║   ${this.metricsCollector ? '✅' : '⏸️ '} Metrics    ${this.metricsCollector ? 'Active' : 'Disabled'}                                     ║
║   ${this.healthCheckService ? '✅' : '⏸️ '} Health     ${this.healthCheckService ? 'Active' : 'Disabled'}                                     ║
║                                                            ║
║   API Endpoints:                                           ║
║   REST:  http://${HOST}:${PORT}${config.apiPrefix || '/api/v1'}                            ║
║   WS:    ws://${HOST}:${PORT}                                  ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
    `);

    // Log additional startup information
    logger.info('Server Details:', {
      pid: process.pid,
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      workerId: cluster.worker?.id,
      cpus: os.cpus().length,
      totalMemory: `${Math.round(os.totalmem() / 1024 / 1024)} MB`,
      freeMemory: `${Math.round(os.freemem() / 1024 / 1024)} MB`
    });
  }

  /**
   * Setup graceful shutdown handlers
   */
  private setupShutdownHandlers(): void {
    const shutdown = async (signal: string) => {
      if (this.isShuttingDown) {
        logger.info('Shutdown already in progress...');
        return;
      }

      this.isShuttingDown = true;
      logger.info(`${signal} signal received, starting graceful shutdown...`);

      try {
        // Set shutdown timeout
        const shutdownTimeout = setTimeout(() => {
          logger.error('Graceful shutdown timeout, forcing exit');
          process.exit(1);
        }, 30000); // 30 seconds timeout

        // Stop accepting new connections
        await this.stopServer();

        // Cleanup all resources
        await this.cleanup();

        clearTimeout(shutdownTimeout);
        logger.info('✅ Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    // Register signal handlers
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGUSR2', () => shutdown('SIGUSR2')); // For nodemon

    // Handle uncaught errors
    process.on('uncaughtException', (error: Error) => {
      logger.error('Uncaught Exception:', error);
      
      // Check if error is operational
      const isOperational = (error as any).isOperational;
      
      if (!isOperational) {
        shutdown('UNCAUGHT_EXCEPTION');
      }
    });

    process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      
      // Don't exit immediately - let the app try to recover
      // But log this as a critical error
      if (this.metricsCollector) {
        this.metricsCollector.recordError('unhandled_rejection', reason);
      }
    });
  }

  /**
   * Setup health monitoring
   */
  private setupHealthMonitoring(): void {
    if (!this.healthCheckService) {
      return;
    }

    // Schedule periodic health checks
    setInterval(async () => {
      try {
        const health = await this.healthCheckService.checkHealth();
        
        if (!health.healthy) {
          logger.warn('Health check failed:', health);
          
          // Trigger alerts if needed
          if (this.services?.notificationService) {
            await this.services.notificationService.sendAlert({
              type: 'error',
              title: 'Health Check Failed',
              message: `Server health check failed: ${JSON.stringify(health)}`,
              priority: 'high'
            });
          }
        }
      } catch (error) {
        logger.error('Health check error:', error);
      }
    }, 60000); // Check every minute
  }

  /**
   * Stop HTTP server
   */
  private async stopServer(): Promise<void> {
    if (!this.httpServer) {
      return;
    }

    logger.info('Stopping HTTP server...');
    
    return new Promise<void>((resolve) => {
      this.httpServer.close((error?: Error) => {
        if (error) {
          logger.error('Error closing HTTP server:', error);
        } else {
          logger.info('✅ HTTP server stopped');
        }
        resolve();
      });

      // Force close after timeout
      setTimeout(() => {
        logger.warn('Force closing remaining connections');
        resolve();
      }, 10000); // 10 seconds
    });
  }

  /**
   * Cleanup all resources
   */
  private async cleanup(): Promise<void> {
    logger.info('🧹 Cleaning up resources...');

    const cleanupTasks: Promise<void>[] = [];

    try {
      // Cleanup services
      if (this.services) {
        cleanupTasks.push(
          this.services.cleanup().catch(error => {
            logger.error('Service cleanup error:', error);
          })
        );
      }

      // Cleanup metrics collector
      if (this.metricsCollector) {
        cleanupTasks.push(
          this.metricsCollector.cleanup().catch(error => {
            logger.error('Metrics cleanup error:', error);
          })
        );
      }

      // Cleanup health check service
      if (this.healthCheckService) {
        cleanupTasks.push(
          this.healthCheckService.cleanup().catch(error => {
            logger.error('Health check cleanup error:', error);
          })
        );
      }

      // Close database connections
      cleanupTasks.push(
        gracefulShutdown().catch(error => {
          logger.error('Database cleanup error:', error);
        })
      );

      // Wait for all cleanup tasks
      await Promise.all(cleanupTasks);

      logger.info('✅ Cleanup completed');
    } catch (error) {
      logger.error('Error during cleanup:', error);
    }
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    logger.info('Stopping server...');
    await this.stopServer();
    await this.cleanup();
    logger.info('Server stopped');
  }

  /**
   * Get server status
   */
  getStatus(): {
    running: boolean;
    uptime: number;
    memory: NodeJS.MemoryUsage;
    services?: any;
    health?: any;
  } {
    return {
      running: !this.isShuttingDown && !!this.httpServer,
      uptime: this.startTime ? Date.now() - this.startTime : 0,
      memory: process.memoryUsage(),
      services: this.services?.getInitializationStatus(),
      health: this.healthCheckService?.getLastCheck()
    };
  }
}

// Create and start server instance
const server = new Server();

// Start server
server.start().catch((error) => {
  logger.error('Fatal error starting server:', error);
  process.exit(1);
});

// Export for testing and external usage
export { Server };
export default server;