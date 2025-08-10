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

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';
const ENABLE_CLUSTER = process.env.CLUSTER_ENABLED === 'true';
const WORKER_COUNT = Number(process.env.WORKER_COUNT) || os.cpus().length;

class Server {
  private app?: App;
  private httpServer?: any;
  private services?: ServiceContainer;
  private isShuttingDown = false;

  async start(): Promise<void> {
    const startTime = Date.now();

    try {
      // 1. Validate configuration
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
          logger.error('Critical configuration errors found. Cannot start server.');
          logger.error('Please check your .env file and ensure all required variables are set.');
          process.exit(1);
        } else {
          logger.warn('Non-critical configuration warnings. Server will start with limited functionality.');
        }
      } else {
        logger.info('✅ Configuration validated successfully');
      }

      // 2. Setup clustering if enabled
      if (ENABLE_CLUSTER && cluster.isPrimary) {
        this.setupClustering();
        return;
      }

      // 3. Connect to MongoDB
      logger.info('🔌 Connecting to MongoDB...');
      await connectDB();

      // 4. Initialize Redis
      logger.info('🔌 Initializing Redis...');
      const redis = await initializeRedis();

      // 5. Initialize Service Container
      logger.info('📦 Initializing services...');
      this.services = await ServiceContainer.initialize(redis);

      // 6. Initialize Express App
      logger.info('🚀 Initializing Express app...');
      this.app = new App(this.services);
      await this.app.initialize();

      // 7. Create HTTP Server
      this.httpServer = createServer(this.app.getApp());

      // 8. Initialize WebSocket if enabled
      if (process.env.ENABLE_WEBSOCKET === 'true') {
        logger.info('🔌 Initializing WebSocket server...');
        await this.app.initializeWebSocket(this.httpServer);
      }

      // 9. Setup cron jobs (only in primary worker or non-clustered mode)
      if (!ENABLE_CLUSTER || cluster.worker?.id === 1) {
        logger.info('⏰ Setting up cron jobs...');
        setupCronJobs(this.services);
      }

      // 10. Start listening
      await this.listen();

      const elapsed = Date.now() - startTime;
      this.logStartupSuccess(elapsed);

      // Setup graceful shutdown
      this.setupShutdownHandlers();

    } catch (error) {
      logger.error('Failed to start server:', error);
      await this.cleanup();
      process.exit(1);
    }
  }

  private setupClustering(): void {
    logger.info(`🎯 Master process ${process.pid} is running`);
    logger.info(`🔧 Forking ${WORKER_COUNT} workers...`);

    // Fork workers
    for (let i = 0; i < WORKER_COUNT; i++) {
      cluster.fork();
    }

    // Handle worker events
    cluster.on('exit', (worker, code, signal) => {
      logger.error(`Worker ${worker.process.pid} died (${signal || code}). Restarting...`);
      
      if (!this.isShuttingDown) {
        cluster.fork();
      }
    });

    cluster.on('online', (worker) => {
      logger.info(`Worker ${worker.process.pid} is online`);
    });
  }

  private async listen(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.httpServer!.listen(PORT, HOST as any, () => {
        resolve();
      }).on('error', reject);
    });
  }

  private logStartupSuccess(elapsed: number): void {
    const workerId = cluster.worker?.id ? ` (Worker ${cluster.worker.id})` : '';
    
    logger.info(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║   🚀 Hallyu ERP Backend Server Started Successfully!      ║
║                                                            ║
╠════════════════════════════════════════════════════════════╣
║   Environment : ${process.env.NODE_ENV?.padEnd(42)} ║
║   Port        : ${PORT.toString().padEnd(42)} ║
║   Host        : ${HOST.padEnd(42)} ║
║   Process ID  : ${process.pid.toString().padEnd(42)} ║
║   Worker      : ${workerId.padEnd(42)} ║
║   Startup Time: ${`${elapsed}ms`.padEnd(42)} ║
║                                                            ║
╠════════════════════════════════════════════════════════════╣
║   Services Status:                                        ║
║   ✅ MongoDB    : Connected                               ║
║   ✅ Redis      : Connected                               ║
║   ✅ Naver API  : ${this.getServiceStatus('naver').padEnd(38)} ║
║   ✅ Shopify API: ${this.getServiceStatus('shopify').padEnd(38)} ║
║   ${process.env.ENABLE_WEBSOCKET === 'true' ? '✅' : '⚠️ '} WebSocket : ${process.env.ENABLE_WEBSOCKET === 'true' ? 'Enabled' : 'Disabled'}${' '.repeat(31)} ║
║                                                            ║
╠════════════════════════════════════════════════════════════╣
║   API Documentation:                                      ║
║   📚 Swagger UI : http://${HOST}:${PORT}/api-docs${' '.repeat(20)} ║
║   🔧 Health Check: http://${HOST}:${PORT}/health${' '.repeat(22)} ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
    `);
  }

  private getServiceStatus(service: string): string {
    if (!this.services) return 'Not initialized';
    
    switch (service) {
      case 'naver':
        return process.env.NAVER_CLIENT_ID ? 'Configured' : 'Not configured';
      case 'shopify':
        return process.env.SHOPIFY_ACCESS_TOKEN ? 'Configured' : 'Not configured';
      default:
        return 'Unknown';
    }
  }

  private setupShutdownHandlers(): void {
    const shutdown = async (signal: string) => {
      if (this.isShuttingDown) return;
      
      this.isShuttingDown = true;
      logger.info(`\n${signal} signal received, starting graceful shutdown...`);
      
      await gracefulShutdown(async () => {
        await this.stop();
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGUSR2', () => shutdown('SIGUSR2')); // For nodemon

    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      shutdown('UNCAUGHT_EXCEPTION');
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      shutdown('UNHANDLED_REJECTION');
    });
  }

  async stop(): Promise<void> {
    logger.info('🛑 Stopping server...');

    try {
      // Close HTTP server
      if (this.httpServer) {
        await new Promise<void>((resolve) => {
          this.httpServer.close(() => {
            logger.info('✅ HTTP server closed');
            resolve();
          });
        });
      }

      // Close WebSocket connections
      if (this.app?.getIO()) {
        this.app.getIO().close();
        logger.info('✅ WebSocket server closed');
      }

      // Cleanup services
      await this.cleanup();

      logger.info('✅ Server stopped successfully');
    } catch (error) {
      logger.error('Error during server shutdown:', error);
      throw error;
    }
  }

  private async cleanup(): Promise<void> {
    try {
      if (this.services) {
        await this.services.cleanup();
      }

      // Close database connections
      const mongoose = await import('mongoose');
      await mongoose.connection.close();
      logger.info('✅ MongoDB connection closed');

      // Close Redis connection
      const { getRedisClient } = await import('./config/redis.js');
      const redis = getRedisClient();
      if (redis) {
        await redis.quit();
        logger.info('✅ Redis connection closed');
      }
    } catch (error) {
      logger.error('Error during cleanup:', error);
    }
  }
}

// Start the server
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new Server();
  server.start().catch((error) => {
    logger.error('Failed to start server:', error);
    process.exit(1);
  });
}

export { Server };