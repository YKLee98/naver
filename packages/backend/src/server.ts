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
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// ES 모듈에서 __dirname 대체
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration and utilities
import { logger, stream } from './utils/logger.js';
import { config } from './config/index.js';

// Database and Redis
import { connectDatabase, disconnectDatabase, isDatabaseConnected } from './config/database.js';
import { initializeRedis, getRedisClient, closeRedis, isRedisConnected } from './config/redis.js';

// Middleware
import { errorHandler } from './middlewares/error.middleware.js';
import { requestLogger } from './middlewares/logger.middleware.js';
import { rateLimiter } from './middlewares/rateLimit.middleware.js';

// Jobs
import { AutoRecoveryJob } from './jobs/autoRecovery.js';

// WebSocket
import { setupWebSocket as initializeWebSocket } from './websocket.js';

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
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
      exposedHeaders: ['X-Total-Count'],
      maxAge: 86400 // 24 hours
    }));

    // Body parsing middleware
    this.app.use(express.json({ 
      limit: '10mb',
      verify: (req: any, res, buf) => {
        req.rawBody = buf.toString('utf8');
      }
    }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Compression
    this.app.use(compression({
      filter: (req, res) => {
        if (req.headers['x-no-compression']) {
          return false;
        }
        return compression.filter(req, res);
      },
      level: 6
    }));

    // Request logging
    if (config.env === 'production') {
      this.app.use(morgan('combined', { stream }));
    } else {
      this.app.use(morgan('dev', { stream }));
    }

    // Custom request logger
    this.app.use(requestLogger);

    // Rate limiting for production
    if (config.env === 'production') {
      this.app.use('/api/', rateLimiter);
    }

    // Trust proxy
    this.app.set('trust proxy', 1);

    logger.info('Middleware stack configured');
  }

  /**
   * Initialize all services with proper dependency injection
   */
  private async initializeServices(): Promise<{ controllers: any, services: any }> {
    logger.info('Initializing services...');

    // Get Redis client
    this.redis = getRedisClient();

    // Import service modules
    const naverModule = await import('./services/naver/index.js');
    const shopifyModule = await import('./services/shopify/index.js');
    const syncModule = await import('./services/sync/index.js');
    const exchangeRateModule = await import('./services/exchangeRate/index.js');

    // Initialize services
    const naverAuthService = new naverModule.NaverAuthService(this.redis);
    const naverProductService = new naverModule.NaverProductService(naverAuthService);
    const naverOrderService = new naverModule.NaverOrderService(naverAuthService);
    const shopifyGraphQLService = new shopifyModule.ShopifyGraphQLService();
    const shopifyBulkService = new shopifyModule.ShopifyBulkService();
    const shopifyWebhookService = new shopifyModule.ShopifyWebhookService();

    const syncService = new syncModule.SyncService(
      naverProductService,
      naverOrderService,
      shopifyBulkService,
      this.redis
    );

    const inventorySyncService = new syncModule.InventorySyncService(
      naverProductService,
      shopifyBulkService
    );

    const mappingService = new syncModule.MappingService(
      naverProductService,
      shopifyGraphQLService
    );

    const priceSyncService = new syncModule.PriceSyncService(
      naverProductService,
      shopifyGraphQLService,
      this.redis
    );

    const exchangeRateService = new exchangeRateModule.ExchangeRateService(
      this.redis
    );

    // Store sync services
    this.services.set('sync', syncService);
    this.services.set('inventorySync', inventorySyncService);
    this.services.set('mapping', mappingService);
    this.services.set('priceSync', priceSyncService);
    this.services.set('exchangeRate', exchangeRateService);
    this.services.set('naverAuth', naverAuthService);
    this.services.set('naverProduct', naverProductService);
    this.services.set('naverOrder', naverOrderService);
    this.services.set('shopifyGraphQL', shopifyGraphQLService);
    this.services.set('shopifyBulk', shopifyBulkService);
    this.services.set('shopifyWebhook', shopifyWebhookService);

    // Dynamic imports for controllers - handle missing controllers gracefully
    const controllers: any = {};
    
    try {
      const { AuthController } = await import('./controllers/AuthController.js');
      controllers.authController = new AuthController();
      this.controllers.set('auth', controllers.authController);
    } catch (error) {
      logger.warn('AuthController not available');
    }

    try {
      const { ProductController } = await import('./controllers/ProductController.js');
      controllers.productController = new ProductController(
        naverProductService,
        shopifyGraphQLService
      );
      this.controllers.set('product', controllers.productController);
    } catch (error) {
      logger.warn('ProductController not available');
    }

    try {
      const { InventoryController } = await import('./controllers/InventoryController.js');
      controllers.inventoryController = new InventoryController(inventorySyncService);
      this.controllers.set('inventory', controllers.inventoryController);
    } catch (error) {
      logger.warn('InventoryController not available');
    }

    try {
      const { SyncController } = await import('./controllers/SyncController.js');
      controllers.syncController = new SyncController(syncService);
      this.controllers.set('sync', controllers.syncController);
    } catch (error) {
      logger.warn('SyncController not available');
    }

    try {
      const { MappingController } = await import('./controllers/MappingController.js');
      controllers.mappingController = new MappingController(mappingService);
      this.controllers.set('mapping', controllers.mappingController);
    } catch (error) {
      logger.warn('MappingController not available');
    }

    try {
      const { DashboardController } = await import('./controllers/DashboardController.js');
      controllers.dashboardController = new DashboardController();
      this.controllers.set('dashboard', controllers.dashboardController);
    } catch (error) {
      logger.warn('DashboardController not available');
    }

    try {
      const { WebhookController } = await import('./controllers/WebhookController.js');
      controllers.webhookController = new WebhookController(
        shopifyWebhookService,
        syncService
      );
      this.controllers.set('webhook', controllers.webhookController);
    } catch (error) {
      logger.warn('WebhookController not available');
    }

    try {
      const { PriceSyncController } = await import('./controllers/PriceSyncController.js');
      controllers.priceSyncController = new PriceSyncController(priceSyncService);
      this.controllers.set('priceSync', controllers.priceSyncController);
    } catch (error) {
      logger.warn('PriceSyncController not available');
    }

    try {
      const { ExchangeRateController } = await import('./controllers/ExchangeRateController.js');
      controllers.exchangeRateController = new ExchangeRateController(exchangeRateService);
      this.controllers.set('exchangeRate', controllers.exchangeRateController);
    } catch (error) {
      logger.warn('ExchangeRateController not available');
    }

    logger.info('Services initialization complete');
    return { controllers, services: this.services };
  }

  /**
   * Setup all routes with proper error handling
   */
  private async setupRoutes(): Promise<void> {
    const apiPrefix = '/api';

    // Health check endpoint (before any middleware)
    this.app.get('/health', (req, res) => {
      res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: config.env,
        database: isDatabaseConnected(),
        redis: isRedisConnected()
      });
    });

    // API routes
    try {
      logger.info('Setting up routes...');

      // Auth routes (no middleware needed)
      try {
        const authModule = await import('./routes/auth.routes.js');
        const authRouter = authModule.default;
        this.app.use(`${apiPrefix}/auth`, authRouter);
        logger.info('✅ Auth routes registered');
      } catch (error: any) {
        logger.error('❌ Auth routes error:', error.message);
      }

      // Webhook routes (special auth)
      try {
        const webhookModule = await import('./routes/webhook.routes.js');
        const webhookRouter = webhookModule.default;
        this.app.use(`${apiPrefix}/webhooks`, webhookRouter);
        logger.info('✅ Webhook routes registered');
      } catch (error: any) {
        logger.error('❌ Webhook routes error:', error.message);
      }

      // Setup API routes with async initialization
      try {
        const apiModule = await import('./routes/api.routes.js');
        const setupApiRoutes = apiModule.setupApiRoutes;
        if (typeof setupApiRoutes === 'function') {
          const apiRouter = await setupApiRoutes();
          this.app.use(apiPrefix, apiRouter);
          logger.info('✅ API routes registered');
        }
      } catch (error: any) {
        logger.error('❌ API routes setup error:', error.message);
      }

      // Dashboard routes
      try {
        const dashboardModule = await import('./routes/dashboard.routes.js');
        const setupDashboardRoutes = dashboardModule.setupDashboardRoutes;
        if (typeof setupDashboardRoutes === 'function') {
          const dashboardRouter = setupDashboardRoutes();
          this.app.use(`${apiPrefix}/dashboard`, dashboardRouter);
          logger.info('✅ Dashboard routes registered');
        }
      } catch (error: any) {
        logger.error('❌ Dashboard routes error:', error.message);
      }

      // Settings routes
      try {
        const settingsModule = await import('./routes/settings.routes.js');
        const setupSettingsRoutes = settingsModule.setupSettingsRoutes || settingsModule.default;
        if (typeof setupSettingsRoutes === 'function') {
          this.app.use(`${apiPrefix}/settings`, setupSettingsRoutes());
          logger.info('✅ Settings routes registered');
        }
      } catch (error: any) {
        logger.warn('Settings routes not available');
      }

      // Price sync routes
      try {
        const priceSyncModule = await import('./routes/priceSync.routes.js');
        const setupPriceSyncRoutes = priceSyncModule.default;
        if (typeof setupPriceSyncRoutes === 'function') {
          this.app.use(`${apiPrefix}/price-sync`, setupPriceSyncRoutes());
          logger.info('✅ Price sync routes registered');
        }
      } catch (error: any) {
        logger.warn('Price sync routes not available');
      }

      // Exchange rate routes
      try {
        const exchangeRateModule = await import('./routes/exchangeRate.routes.js');
        const setupExchangeRateRoutes = exchangeRateModule.default;
        if (typeof setupExchangeRateRoutes === 'function') {
          this.app.use(`${apiPrefix}/exchange-rate`, setupExchangeRateRoutes());
          logger.info('✅ Exchange rate routes registered');
        }
      } catch (error: any) {
        logger.warn('Exchange rate routes not available');
      }

      // 404 handler
      this.app.use((req, res) => {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message: `Cannot ${req.method} ${req.path}`,
          timestamp: new Date().toISOString()
        });
      });

      // Error handler (must be last)
      this.app.use(errorHandler);

      logger.info('All routes setup completed');
    } catch (error: any) {
      logger.error('Failed to setup routes:', error);
      throw error;
    }
  }

  /**
   * Setup scheduled tasks
   */
  private setupScheduledTasks(): void {
    if (process.env.ENABLE_SCHEDULED_TASKS === 'false') {
      logger.info('Scheduled tasks are disabled');
      return;
    }

    try {
      // Auto recovery job
      const enableAutoRecovery = process.env.ENABLE_AUTO_RECOVERY !== 'false';
      if (enableAutoRecovery) {
        this.autoRecoveryJob = new AutoRecoveryJob(this.services.get('sync'));
        this.autoRecoveryJob.start();
        logger.info('Auto recovery job started');
      }

      // Exchange rate update job - 매일 오전 9시
      const exchangeRateTask = cron.schedule('0 9 * * *', async () => {
        logger.info('Running scheduled exchange rate update...');
        try {
          const exchangeRateService = this.services.get('exchangeRate');
          if (exchangeRateService) {
            await exchangeRateService.updateRates();
            logger.info('Exchange rate update completed');
          }
        } catch (error) {
          logger.error('Exchange rate update failed:', error);
        }
      });
      this.cronTasks.push(exchangeRateTask);

      // Inventory sync job - 매 4시간마다
      const inventorySyncTask = cron.schedule('0 */4 * * *', async () => {
        logger.info('Running scheduled inventory sync...');
        try {
          const syncService = this.services.get('sync');
          if (syncService) {
            await syncService.performInventorySync();
            logger.info('Inventory sync completed');
          }
        } catch (error) {
          logger.error('Inventory sync failed:', error);
        }
      });
      this.cronTasks.push(inventorySyncTask);

      // Database cleanup job - 매일 새벽 2시
      const cleanupTask = cron.schedule('0 2 * * *', async () => {
        logger.info('Running database cleanup...');
        try {
          // Remove old logs (30 days)
          const { SystemLog } = await import('./models/SystemLog.js');
          const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
          await SystemLog.deleteMany({ createdAt: { $lt: thirtyDaysAgo } });
          
          logger.info('Database cleanup completed');
        } catch (error) {
          logger.error('Database cleanup failed:', error);
        }
      });
      this.cronTasks.push(cleanupTask);

      logger.info(`Scheduled ${this.cronTasks.length} cron tasks`);
    } catch (error) {
      logger.error('Failed to setup scheduled tasks:', error);
      // Don't throw - allow server to start without scheduled tasks
    }
  }

  /**
   * Initialize WebSocket server with proper error handling
   */
  private setupWebSocket(): void {
    try {
      logger.info('Setting up WebSocket server...');
      initializeWebSocket(this.io);
      logger.info('WebSocket server setup complete');
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

      // Setup routes - await for async route setup
      await this.setupRoutes();

      // Setup WebSocket
      this.setupWebSocket();

      // Setup scheduled tasks
      this.setupScheduledTasks();

      // Start HTTP server
      this.httpServer.listen(this.port, () => {
        logger.info('========================================');
        logger.info(`🚀 Server is running on port ${this.port}`);
        logger.info(`🌍 Environment: ${config.env}`);
        logger.info(`📍 API Endpoint: http://localhost:${this.port}/api`);
        logger.info(`💡 Health Check: http://localhost:${this.port}/health`);
        logger.info(`🔌 WebSocket: ws://localhost:${this.port}`);
        logger.info('========================================');
        
        // 추가 정보 로그
        if (process.env.ENABLE_SCHEDULED_TASKS === 'false') {
          logger.info('⏸️  Scheduled tasks are DISABLED');
        } else {
          logger.info('▶️  Scheduled tasks are ENABLED');
        }
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