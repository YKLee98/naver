// packages/backend/src/server.ts
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import mongoose from 'mongoose';
import path from 'path';
import * as cron from 'node-cron';

// Configuration and utilities
import { logger, stream } from './utils/logger';
import { config } from './config';

// Database and Redis
import { connectDatabase, disconnectDatabase, isDatabaseConnected } from './config/database';
import { initializeRedis, getRedisClient, closeRedis, isRedisConnected } from './config/redis';

// Middleware
import { errorHandler } from './middlewares/error.middleware';
import { requestLogger } from './middlewares/logger.middleware';
import { authMiddleware } from './middlewares/auth.middleware';
import { rateLimiter } from './middlewares/rateLimit.middleware';

// Services
import {
  NaverAuthService,
  NaverProductService,
  NaverOrderService
} from './services/naver';
import {
  ShopifyGraphQLService,
  ShopifyBulkService
} from './services/shopify';
import {
  SyncService,
  InventorySyncService,
  MappingService,
  PriceSyncService
} from './services/sync';
import { ExchangeRateService } from './services/exchangeRate';

// Controllers
import { AuthController } from './controllers/AuthController';
import { ProductController } from './controllers/ProductController';
import { InventoryController } from './controllers/InventoryController';
import { SyncController } from './controllers/SyncController';
import { MappingController } from './controllers/MappingController';
import { DashboardController } from './controllers/DashboardController';
import { WebhookController } from './controllers/WebhookController';
import { PriceSyncController } from './controllers/PriceSyncController';
import { ExchangeRateController } from './controllers/ExchangeRateController';

// Jobs
import { AutoRecoveryJob } from './jobs/autoRecovery';

// WebSocket
import { initializeWebSocket } from './websocket';

/**
 * Enterprise-grade Server Class
 * Implements robust error handling, graceful shutdown, and comprehensive monitoring
 */
class Server {
  private app: express.Application;
  private httpServer: any;
  private io: SocketIOServer;
  private port: number;
  private wsPort: number;
  private autoRecoveryJob: AutoRecoveryJob | null = null;
  private cronTasks: cron.ScheduledTask[] = [];
  private redis: any;
  private isShuttingDown: boolean = false;
  private services: Map<string, any> = new Map();
  private controllers: Map<string, any> = new Map();

  constructor() {
    this.app = express();
    this.port = config.server.port;
    this.wsPort = config.server.wsPort;
    
    // Create HTTP server
    this.httpServer = createServer(this.app);
    
    // Initialize Socket.IO with proper configuration
    this.io = new SocketIOServer(this.httpServer, {
      cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:5173',
        methods: ['GET', 'POST'],
        credentials: true
      },
      pingTimeout: 60000,
      pingInterval: 25000,
      transports: ['websocket', 'polling']
    });

    // Setup process handlers
    this.setupProcessHandlers();
  }

  /**
   * Setup middleware stack with enterprise configurations
   */
  private setupMiddlewares(): void {
    // Security headers
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }));

    // CORS configuration
    this.app.use(cors({
      origin: (origin, callback) => {
        const allowedOrigins = [
          'http://localhost:5173',
          'http://localhost:3000',
          process.env.FRONTEND_URL
        ].filter(Boolean);

        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
      exposedHeaders: ['X-Total-Count', 'X-Page-Count']
    }));

    // Compression
    this.app.use(compression({
      level: 6,
      threshold: 1024,
      filter: (req, res) => {
        if (req.headers['x-no-compression']) {
          return false;
        }
        return compression.filter(req, res);
      }
    }));

    // Body parsing with size limits
    this.app.use(express.json({ 
      limit: '10mb',
      verify: (req: any, res, buf) => {
        req.rawBody = buf.toString('utf8');
      }
    }));
    this.app.use(express.urlencoded({ 
      extended: true, 
      limit: '10mb' 
    }));

    // Request logging
    this.app.use(morgan('combined', { stream }));
    this.app.use(requestLogger);

    // Rate limiting - apply selectively
    this.app.use('/api/v1/auth/login', rateLimiter);
    this.app.use('/api/v1/auth/register', rateLimiter);

    // Request ID generation
    this.app.use((req: any, res, next) => {
      req.id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      res.setHeader('X-Request-Id', req.id);
      next();
    });

    // Health check endpoint (no auth required)
    this.app.get('/health', (req, res) => {
      const healthStatus = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        database: isDatabaseConnected() ? 'connected' : 'disconnected',
        redis: isRedisConnected() ? 'connected' : 'disconnected',
        memory: process.memoryUsage(),
        environment: config.env
      };
      res.json(healthStatus);
    });

    // Static files
    this.app.use('/static', express.static(path.join(__dirname, '../public')));
  }

  /**
   * Initialize all services with dependency injection
   */
  private async initializeServices(): Promise<{ controllers: any, services: any }> {
    try {
      // Get Redis client
      this.redis = getRedisClient();

      // Initialize core services
      const naverAuthService = new NaverAuthService(this.redis);
      const naverProductService = new NaverProductService(naverAuthService);
      const naverOrderService = new NaverOrderService(naverAuthService);
      const shopifyGraphQLService = new ShopifyGraphQLService();
      const shopifyBulkService = new ShopifyBulkService();
      const exchangeRateService = new ExchangeRateService(this.redis);

      // Store services for lifecycle management
      this.services.set('naverAuth', naverAuthService);
      this.services.set('naverProduct', naverProductService);
      this.services.set('naverOrder', naverOrderService);
      this.services.set('shopifyGraphQL', shopifyGraphQLService);
      this.services.set('shopifyBulk', shopifyBulkService);
      this.services.set('exchangeRate', exchangeRateService);

      // Initialize sync services
      const syncService = new SyncService(
        naverProductService,
        naverOrderService,
        shopifyBulkService,
        this.redis
      );

      const inventorySyncService = new InventorySyncService(
        naverProductService,
        shopifyBulkService
      );

      const mappingService = new MappingService(
        naverProductService,
        shopifyGraphQLService
      );

      const priceSyncService = new PriceSyncService(
        naverProductService,
        shopifyGraphQLService,
        exchangeRateService
      );

      // Store sync services
      this.services.set('sync', syncService);
      this.services.set('inventorySync', inventorySyncService);
      this.services.set('mapping', mappingService);
      this.services.set('priceSync', priceSyncService);

      // Initialize controllers
      const authController = new AuthController();
      const productController = new ProductController(
        naverProductService,
        shopifyGraphQLService
      );
      const inventoryController = new InventoryController(inventorySyncService);
      const syncController = new SyncController(syncService);
      const mappingController = new MappingController(mappingService);
      const dashboardController = new DashboardController();
      const webhookController = new WebhookController(inventorySyncService);
      const priceSyncController = new PriceSyncController(priceSyncService);
      const exchangeRateController = new ExchangeRateController(exchangeRateService);

      // Store controllers
      this.controllers.set('auth', authController);
      this.controllers.set('product', productController);
      this.controllers.set('inventory', inventoryController);
      this.controllers.set('sync', syncController);
      this.controllers.set('mapping', mappingController);
      this.controllers.set('dashboard', dashboardController);
      this.controllers.set('webhook', webhookController);
      this.controllers.set('priceSync', priceSyncController);
      this.controllers.set('exchangeRate', exchangeRateController);

      // Initialize auto recovery job
      this.autoRecoveryJob = new AutoRecoveryJob(
        inventorySyncService,
        priceSyncService,
        this.redis
      );
      this.autoRecoveryJob.start();
      logger.info('Auto recovery job started');

      // Initialize scheduled tasks
      this.setupScheduledTasks(
        inventorySyncService,
        priceSyncService,
        exchangeRateService
      );

      return {
        controllers: {
          authController,
          productController,
          inventoryController,
          syncController,
          mappingController,
          dashboardController,
          webhookController,
          priceSyncController,
          exchangeRateController
        },
        services: {
          naverAuthService,
          naverProductService,
          naverOrderService,
          shopifyGraphQLService,
          shopifyBulkService,
          syncService,
          inventorySyncService,
          mappingService,
          priceSyncService,
          exchangeRateService
        }
      };
    } catch (error) {
      logger.error('Failed to initialize services:', error);
      throw error;
    }
  }

  /**
   * Setup API routes with proper error handling
   */
  private setupRoutes(controllers: any): void {
    const apiPrefix = config.api.prefix || '/api/v1';

    try {
      // Auth routes (no auth middleware)
      const authRouter = require('./routes/auth.routes').default;
      this.app.use(`${apiPrefix}/auth`, authRouter);
      logger.info('✅ Auth routes registered');

      // Webhook routes (special auth)
      const webhookRouter = require('./routes/webhook.routes').default;
      this.app.use(`${apiPrefix}/webhooks`, webhookRouter);
      logger.info('✅ Webhook routes registered');

      // Dashboard routes
      try {
        const { setupDashboardRoutes } = require('./routes/dashboard.routes');
        const dashboardRouter = setupDashboardRoutes();
        this.app.use(`${apiPrefix}/dashboard`, dashboardRouter);
        logger.info('✅ Dashboard routes registered');
      } catch (error: any) {
        logger.error('❌ Dashboard routes error:', error.message);
      }

      // API routes (with auth)
      try {
        const { setupApiRoutes } = require('./routes/api.routes');
        const apiRouter = setupApiRoutes();
        this.app.use(apiPrefix, apiRouter);
        logger.info('✅ API routes registered');
      } catch (error: any) {
        logger.error('API routes setup error:', error.message);
      }

      // Settings routes
      try {
        const settingsRouter = require('./routes/settings.routes').default;
        if (settingsRouter) {
          this.app.use(`${apiPrefix}/settings`, settingsRouter);
          logger.info('✅ Settings routes registered');
        }
      } catch (error) {
        logger.warn('Settings routes not available');
      }

      // Price sync routes
      try {
        const priceSyncRouter = require('./routes/priceSync.routes').default;
        this.app.use(`${apiPrefix}/price-sync`, priceSyncRouter());
        logger.info('✅ Price sync routes registered');
      } catch (error: any) {
        logger.error('Price sync routes error:', error.message);
      }

      // Price routes
      try {
        const priceRouter = require('./routes/price.routes').default;
        this.app.use(`${apiPrefix}/prices`, priceRouter());
        logger.info('✅ Price routes registered at /api/v1/prices');
      } catch (error: any) {
        logger.error('Price routes error:', error.message);
      }

      // Exchange rate routes
      try {
        const exchangeRateRouter = require('./routes/exchangeRate.routes').default;
        this.app.use(`${apiPrefix}/exchange-rates`, exchangeRateRouter());
        logger.info('✅ Exchange rates routes registered at /api/v1/exchange-rates');
      } catch (error: any) {
        logger.error('Exchange rate routes error:', error.message);
      }

      // 404 handler
      this.app.use((req, res) => {
        res.status(404).json({
          success: false,
          error: 'Route not found',
          path: req.path,
          method: req.method
        });
      });

      // Global error handler
      this.app.use(errorHandler);

    } catch (error) {
      logger.error('Failed to setup routes:', error);
      throw error;
    }
  }

  /**
   * Setup scheduled tasks with proper error handling
   */
  private setupScheduledTasks(
    inventorySyncService: InventorySyncService,
    priceSyncService: PriceSyncService,
    exchangeRateService: ExchangeRateService
  ): void {
    // Inventory sync - every 30 minutes
    const inventorySyncJob = cron.schedule('*/30 * * * *', async () => {
      if (this.isShuttingDown) return;
      
      try {
        logger.info('Running scheduled inventory sync...');
        await inventorySyncService.syncAllInventory();
        logger.info('Scheduled inventory sync completed');
      } catch (error) {
        logger.error('Scheduled inventory sync failed:', error);
      }
    }, { scheduled: false });

    // Price sync - every hour
    const priceSyncJob = cron.schedule('0 * * * *', async () => {
      if (this.isShuttingDown) return;
      
      try {
        logger.info('Running scheduled price sync...');
        await priceSyncService.syncAllPrices();
        logger.info('Scheduled price sync completed');
      } catch (error) {
        logger.error('Scheduled price sync failed:', error);
      }
    }, { scheduled: false });

    // Exchange rate update - every 6 hours
    const exchangeRateJob = cron.schedule('0 */6 * * *', async () => {
      if (this.isShuttingDown) return;
      
      try {
        logger.info('Updating exchange rates...');
        await exchangeRateService.updateExchangeRate();
        logger.info('Exchange rates updated');
      } catch (error) {
        logger.error('Exchange rate update failed:', error);
      }
    }, { scheduled: false });

    // Store and start cron tasks
    this.cronTasks = [inventorySyncJob, priceSyncJob, exchangeRateJob];
    this.cronTasks.forEach(task => task.start());
    logger.info('Cron jobs started');
  }

  /**
   * Initialize WebSocket server with proper error handling
   */
  private setupWebSocket(): void {
    try {
      initializeWebSocket(this.io);
      logger.info('WebSocket server initialized');
    } catch (error) {
      logger.error('Failed to initialize WebSocket:', error);
      // Don't throw - allow server to start without WebSocket
    }
  }

  /**
   * Setup process handlers for graceful shutdown
   */
  private setupProcessHandlers(): void {
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      this.shutdown(1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      this.shutdown(1);
    });

    // Handle termination signals
    const signals = ['SIGTERM', 'SIGINT', 'SIGUSR2'];
    signals.forEach(signal => {
      process.on(signal, () => {
        logger.info(`Received ${signal}, starting graceful shutdown...`);
        this.shutdown(0);
      });
    });
  }

  /**
   * Graceful shutdown implementation
   */
  private async shutdown(exitCode: number = 0): Promise<void> {
    if (this.isShuttingDown) {
      logger.info('Shutdown already in progress...');
      return;
    }

    this.isShuttingDown = true;
    logger.info('Starting graceful shutdown...');

    const shutdownTimeout = setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 30000); // 30 second timeout

    try {
      // Stop accepting new connections
      if (this.httpServer) {
        await new Promise<void>((resolve) => {
          this.httpServer.close(() => {
            logger.info('HTTP server closed');
            resolve();
          });
        });
      }

      // Close WebSocket connections
      if (this.io) {
        await new Promise<void>((resolve) => {
          this.io.close(() => {
            logger.info('WebSocket server closed');
            resolve();
          });
        });
      }

      // Stop cron jobs
      if (this.cronTasks.length > 0) {
        this.cronTasks.forEach(task => task.stop());
        logger.info('Cron jobs stopped');
      }

      // Stop auto recovery job
      if (this.autoRecoveryJob) {
        this.autoRecoveryJob.stop();
        logger.info('Auto recovery job stopped');
      }

      // Close Redis connection
      await closeRedis();
      logger.info('Redis connection closed');

      // Close database connection
      await disconnectDatabase();
      logger.info('Database connection closed');

      clearTimeout(shutdownTimeout);
      logger.info('Graceful shutdown completed');
      process.exit(exitCode);

    } catch (error) {
      logger.error('Error during shutdown:', error);
      clearTimeout(shutdownTimeout);
      process.exit(1);
    }
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    try {
      // Connect to database
      await connectDatabase();
      logger.info('MongoDB connected successfully');

      // Initialize Redis
      await initializeRedis();
      logger.info('Redis initialized successfully');

      // Setup middleware
      this.setupMiddlewares();

      // Initialize services
      const { controllers, services } = await this.initializeServices();
      logger.info('Services initialized successfully');

      // Setup routes
      this.setupRoutes(controllers);

      // Setup WebSocket
      this.setupWebSocket();

      // Start HTTP server
      this.httpServer.listen(this.port, () => {
        logger.info('========================================');
        logger.info(`🚀 Server is running on port ${this.port}`);
        logger.info(`🌍 Environment: ${config.env}`);
        logger.info(`📍 API Endpoint: http://localhost:${this.port}/api/v1`);
        logger.info(`💡 Health Check: http://localhost:${this.port}/health`);
        logger.info(`🔌 WebSocket: ws://localhost:${this.port}`);
        logger.info('========================================');
      });

    } catch (error) {
      logger.error('Failed to start server:', error);
      await this.shutdown(1);
    }
  }
}

// Create and start server
const server = new Server();
server.start().catch((error) => {
  logger.error('Fatal error starting server:', error);
  process.exit(1);
});

export default server;