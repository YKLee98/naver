// packages/backend/src/server.ts
import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { createServer, Server as HttpServer } from 'http';
import { config } from './config/index.js';
import { logger, stream } from './utils/logger.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { initializeRedis, getRedisClient } from './config/redis.js';
import { errorHandler } from './middlewares/error.middleware.js';
import { rateLimiter } from './middlewares/rateLimit.middleware.js';
import { requestLogger } from './middlewares/logger.middleware.js';

export class Server {
  private app: Application;
  private server: HttpServer;
  private port: number;
  private isInitialized: boolean = false;

  constructor() {
    this.app = express();
    this.port = config.port || 3000;
    this.server = createServer(this.app);
  }

  /**
   * Initialize the server
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn('Server already initialized');
      return;
    }

    try {
      // Connect to database
      await connectDatabase();
      logger.info('✅ Database connected');

      // Initialize Redis (optional - won't fail if not available)
      try {
        await initializeRedis();
        logger.info('✅ Redis connected');
      } catch (error) {
        logger.warn('⚠️ Redis not available, continuing without cache');
      }

      // Setup middlewares
      this.setupMiddlewares();

      // Setup routes
      await this.setupRoutes();

      // Setup error handlers (must be last)
      this.setupErrorHandlers();

      this.isInitialized = true;
      logger.info('✅ Server initialized successfully');
    } catch (error) {
      logger.error('❌ Failed to initialize server:', error);
      throw error;
    }
  }

  /**
   * Setup middlewares
   */
  private setupMiddlewares(): void {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: config.env === 'production',
      crossOriginEmbedderPolicy: false
    }));

    // CORS configuration
    this.app.use(cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        
        const allowedOrigins = config.corsOrigin.split(',').map(o => o.trim());
        
        if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
      exposedHeaders: ['X-Total-Count', 'X-Page', 'X-Per-Page'],
      maxAge: 86400 // 24 hours
    }));

    // Body parsing middleware
    this.app.use(express.json({ 
      limit: '10mb',
      verify: (req: any, res, buf) => {
        // Store raw body for webhook signature verification
        req.rawBody = buf.toString('utf8');
      }
    }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Compression
    this.app.use(compression());

    // Request logging
    this.app.use(morgan(config.env === 'production' ? 'combined' : 'dev', { stream }));
    this.app.use(requestLogger);

    // Rate limiting for production
    if (config.env === 'production') {
      this.app.use(`${config.apiPrefix}`, rateLimiter);
    }

    logger.info('✅ Middlewares configured');
  }

  /**
   * Setup routes
   */
  private async setupRoutes(): Promise<void> {
    const apiPrefix = config.apiPrefix || '/api/v1';

    // Root endpoint
    this.app.get('/', (req: Request, res: Response) => {
      res.json({
        name: 'Hallyu Pomaholic ERP API',
        version: '1.0.0',
        environment: config.env,
        timestamp: new Date().toISOString(),
        endpoints: {
          health: '/health',
          api: apiPrefix,
          documentation: '/api-docs'
        }
      });
    });

    // Health check endpoint
    this.app.get('/health', async (req: Request, res: Response) => {
      try {
        const redis = getRedisClient();
        const redisStatus = redis ? await redis.ping() === 'PONG' : false;

        res.json({
          status: 'healthy',
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          services: {
            database: 'connected',
            redis: redisStatus ? 'connected' : 'not available',
            memory: {
              used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
              total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
              unit: 'MB'
            }
          }
        });
      } catch (error) {
        res.status(503).json({
          status: 'unhealthy',
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    // Auth routes (no authentication required)
    try {
      const authModule = await import('./routes/auth.routes.js');
      const authRoutes = authModule.default;
      if (authRoutes) {
        this.app.use(`${apiPrefix}/auth`, authRoutes);
        logger.info('✅ Auth routes registered');
      }
    } catch (error) {
      logger.error('❌ Failed to load auth routes:', error);
    }

    // Webhook routes (special authentication via signature)
    try {
      const webhookModule = await import('./routes/webhook.routes.js');
      const webhookRoutes = webhookModule.default;
      if (webhookRoutes) {
        this.app.use(`${apiPrefix}/webhooks`, webhookRoutes);
        logger.info('✅ Webhook routes registered');
      }
    } catch (error) {
      logger.warn('⚠️ Webhook routes not available');
    }

    // Main API routes with all endpoints including dashboard
    try {
      const apiModule = await import('./routes/api.routes.js');
      const setupApiRoutes = apiModule.setupApiRoutes || apiModule.default;
      
      if (typeof setupApiRoutes === 'function') {
        const apiRouter = setupApiRoutes();
        this.app.use(apiPrefix, apiRouter);
        logger.info('✅ API routes registered (including dashboard)');
      } else {
        logger.error('❌ setupApiRoutes is not a function');
      }
    } catch (error) {
      logger.error('❌ Failed to load API routes:', error);
    }

    // Settings routes
    try {
      const settingsModule = await import('./routes/settings.routes.js');
      const setupSettingsRoutes = settingsModule.setupSettingsRoutes || settingsModule.default;
      
      if (typeof setupSettingsRoutes === 'function') {
        const settingsRouter = setupSettingsRoutes();
        this.app.use(`${apiPrefix}/settings`, settingsRouter);
        logger.info('✅ Settings routes registered');
      }
    } catch (error) {
      logger.warn('⚠️ Settings routes not available');
    }

    // Price sync routes
    try {
      const priceSyncModule = await import('./routes/priceSync.routes.js');
      const setupPriceSyncRoutes = priceSyncModule.setupPriceSyncRoutes || priceSyncModule.default;
      
      if (typeof setupPriceSyncRoutes === 'function') {
        const priceSyncRouter = setupPriceSyncRoutes();
        this.app.use(`${apiPrefix}/price-sync`, priceSyncRouter);
        logger.info('✅ Price sync routes registered');
      }
    } catch (error) {
      logger.warn('⚠️ Price sync routes not available');
    }

    // Exchange rate routes
    try {
      const exchangeRateModule = await import('./routes/exchangeRate.routes.js');
      const setupExchangeRateRoutes = exchangeRateModule.setupExchangeRateRoutes || exchangeRateModule.default;
      
      if (typeof setupExchangeRateRoutes === 'function') {
        const exchangeRateRouter = setupExchangeRateRoutes();
        this.app.use(`${apiPrefix}/exchange-rate`, exchangeRateRouter);
        logger.info('✅ Exchange rate routes registered');
      }
    } catch (error) {
      logger.warn('⚠️ Exchange rate routes not available');
    }

    // API documentation (Swagger)
    if (config.env !== 'production') {
      try {
        const swaggerUi = await import('swagger-ui-express');
        const swaggerDocument = await import('./swagger.json', { assert: { type: 'json' } });
        
        this.app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument.default));
        logger.info('✅ API documentation available at /api-docs');
      } catch (error) {
        logger.warn('⚠️ Swagger documentation not available');
      }
    }

    logger.info('✅ All routes configured');
  }

  /**
   * Setup error handlers
   */
  private setupErrorHandlers(): void {
    // 404 handler
    this.app.use((req: Request, res: Response) => {
      logger.warn(`404 - Route not found: ${req.method} ${req.originalUrl}`);
      
      res.status(404).json({
        success: false,
        error: 'Not Found',
        message: `Cannot ${req.method} ${req.originalUrl}`,
        path: req.originalUrl,
        timestamp: new Date().toISOString()
      });
    });

    // Global error handler
    this.app.use(errorHandler);

    logger.info('✅ Error handlers configured');
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    return new Promise((resolve) => {
      this.server.listen(this.port, () => {
        logger.info(`
╔════════════════════════════════════════════════════════╗
║                                                        ║
║     🚀 Hallyu Pomaholic ERP Server Started!           ║
║                                                        ║
║     Environment: ${config.env.padEnd(37)}║
║     Port: ${String(this.port).padEnd(44)}║
║     API Prefix: ${config.apiPrefix.padEnd(38)}║
║                                                        ║
║     Dashboard: http://localhost:${this.port}/api/v1/dashboard    ║
║     Health: http://localhost:${this.port}/health              ║
║     API Docs: http://localhost:${this.port}/api-docs          ║
║                                                        ║
╚════════════════════════════════════════════════════════╝
        `);
        resolve();
      });
    });
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      this.server.close(async () => {
        logger.info('Server stopped');
        
        // Disconnect from database
        await disconnectDatabase();
        
        // Close Redis connection
        try {
          const redis = getRedisClient();
          if (redis) {
            await redis.quit();
          }
        } catch (error) {
          // Ignore Redis errors on shutdown
        }

        resolve();
      });
    });
  }

  /**
   * Get Express app instance
   */
  getApp(): Application {
    return this.app;
  }

  /**
   * Get HTTP server instance
   */
  getServer(): HttpServer {
    return this.server;
  }
}

// Create and export server instance
const server = new Server();

// Handle process events
process.on('SIGTERM', async () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  await server.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT signal received: closing HTTP server');
  await server.stop();
  process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit the process in production
  if (config.env !== 'production') {
    process.exit(1);
  }
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  // Don't exit the process in production
  if (config.env !== 'production') {
    process.exit(1);
  }
});

export default server;