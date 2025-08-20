// packages/backend/src/app.ts
import express, { Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import compression from 'compression';
import mongoSanitize from 'express-mongo-sanitize';
import rateLimit from 'express-rate-limit';
import hpp from 'hpp';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import { ServiceContainer } from './services/ServiceContainer.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { notFoundHandler } from './middlewares/notFoundHandler.js';
import { requestLogger } from './middlewares/requestLogger.js';
import { EnhancedInventorySyncJob } from './jobs/EnhancedInventorySyncJob.js';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger.js';
import type { Server } from 'http';

export class App {
  public app: Express;
  private services: ServiceContainer;
  private isInitialized: boolean = false;
  private io: any;
  private inventorySyncJob: EnhancedInventorySyncJob | null = null;

  constructor(services: ServiceContainer) {
    this.app = express();
    this.services = services;
  }

  get express(): Express {
    return this.app;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn('App already initialized');
      return;
    }

    try {
      logger.info('🔧 Initializing app middleware and routes...');

      // Setup security middleware
      this.setupSecurityMiddleware();

      // Setup common middleware
      this.setupCommonMiddleware();

      // Setup routes
      await this.setupRoutes();

      // Setup WebSocket
      this.setupWebSocket();
      
      // Setup Enhanced Inventory Sync Job
      await this.setupInventorySyncJob();

      // Setup error handling
      this.setupErrorHandling();

      this.isInitialized = true;
      logger.info('✅ App initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize app:', error);
      throw error;
    }
  }

  private setupSecurityMiddleware(): void {
    // Helmet for security headers
    this.app.use(
      helmet({
        contentSecurityPolicy: config.isProduction ? undefined : false,
        crossOriginEmbedderPolicy: false,
      } as any)
    );

    // CORS configuration
    this.app.use(
      cors({
        origin: (origin, callback) => {
          // Allow requests with no origin (mobile apps, Postman, etc)
          if (!origin) return callback(null, true);

          // ngrok 도메인 자동 허용
          if (origin.match(/https:\/\/[a-z0-9]+\.ngrok-free\.app$/) || 
              origin.match(/https:\/\/[a-z0-9]+\.ngrok\.io$/)) {
            return callback(null, true);
          }

          // 개발 환경에서 localhost 허용
          if (config.isDevelopment && (origin.includes('localhost') || origin.includes('127.0.0.1'))) {
            return callback(null, true);
          }

          const allowedOrigins = Array.isArray(config.misc.corsOrigin)
            ? config.misc.corsOrigin
            : [config.misc.corsOrigin];

          if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
            callback(null, true);
          } else {
            callback(new Error('Not allowed by CORS'));
          }
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'ngrok-skip-browser-warning', 'X-Forwarded-Host'],
        exposedHeaders: ['X-Total-Count', 'X-Page', 'X-Per-Page'],
      })
    );

    // Rate limiting - 개발 환경에서는 매우 관대하게 설정
    if (config.isProduction) {
      const limiter = rateLimit({
        windowMs: config.api.rateLimit.windowMs,
        max: config.api.rateLimit.maxRequests,
        message: 'Too many requests from this IP, please try again later.',
        standardHeaders: true,
        legacyHeaders: false,
        handler: (req, res) => {
          logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
          res.status(429).json({
            error: 'Too many requests',
            message: 'Rate limit exceeded. Please try again later.',
            retryAfter: Math.ceil(config.api.rateLimit.windowMs / 1000),
          });
        },
      });
      this.app.use('/api/', limiter);
    } else {
      // 개발 환경에서는 매우 관대한 rate limit 설정
      const devLimiter = rateLimit({
        windowMs: 1000, // 1초
        max: 1000, // 초당 1000개 요청 허용
        message: 'Too many requests',
        standardHeaders: true,
        legacyHeaders: false,
        skip: () => true, // 개발 환경에서는 모든 요청 허용
      });
      this.app.use('/api/', devLimiter);
      logger.info('🔓 Rate limiting disabled for development');
    }

    // Prevent MongoDB injection attacks
    this.app.use(
      mongoSanitize({
        replaceWith: '_',
        onSanitize: ({ req, key }) => {
          logger.warn(
            `Sanitized MongoDB injection attempt in ${key} from IP: ${req.ip}`
          );
        },
      })
    );

    // Prevent HTTP Parameter Pollution
    this.app.use(
      hpp({
        whitelist: ['sort', 'page', 'limit', 'filter'],
      })
    );

    // Custom security headers
    this.app.use((_req, res, next) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('X-XSS-Protection', '1; mode=block');
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

      if (config.isProduction) {
        res.setHeader(
          'Strict-Transport-Security',
          'max-age=31536000; includeSubDomains'
        );
      }

      next();
    });
  }

  private setupCommonMiddleware(): void {
    // Body parsing
    this.app.use(
      express.json({
        limit: '10mb',
        verify: (req: any, _res, buf) => {
          req.rawBody = buf.toString('utf-8');
        },
      })
    );

    this.app.use(
      express.urlencoded({
        extended: true,
        limit: '10mb',
      })
    );

    // Compression
    this.app.use(
      compression({
        filter: (req, res) => {
          if (req.headers['x-no-compression']) {
            return false;
          }
          return compression.filter(req, res);
        },
        level: 6,
      })
    );

    // Static files
    this.app.use(express.static('public'));

    // Request logging
    if (config.isProduction) {
      this.app.use(
        morgan('combined', {
          stream: {
            write: (message: string) => logger.http(message.trim()),
          },
          skip: (req) => req.url === '/health' || req.url === '/health/live',
        })
      );
    } else {
      this.app.use(
        morgan('dev', {
          skip: (req) => req.url === '/health' || req.url === '/health/live',
        })
      );
    }

    // Custom request logger
    this.app.use(requestLogger);

    // Trust proxy
    this.app.set('trust proxy', 1);

    // View engine
    this.app.set('view engine', 'ejs');
  }

  private async setupRoutes(): Promise<void> {
    logger.info('📍 Setting up routes...');

    // API Documentation
    this.app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

    // Health check - should be before auth
    this.app.get('/health', (_req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: config.nodeEnv,
      });
    });

    // Main API routes
    const { setupRoutes } = await import('./routes/index.js');
    const router = await setupRoutes(this.services);
    this.app.use('/api/v1', router);
    // 백업 경로 (둘 다 지원)
    this.app.use('/api', router);

    // Root route
    this.app.get('/', (_req, res) => {
      res.json({
        message: 'Naver-Shopify Sync API',
        version: '2.0.0',
        environment: config.nodeEnv,
        documentation: '/api-docs',
        health: '/health',
      });
    });

    logger.info('✅ Routes configured');
  }

  private setupWebSocket(): void {
    // WebSocket will be initialized in server.ts
    logger.info('WebSocket setup delegated to server initialization');
  }
  
  private async setupInventorySyncJob(): Promise<void> {
    // Check if inventory sync is enabled
    if (process.env.ENABLE_INVENTORY_SYNC === 'false') {
      logger.info('Inventory sync job is disabled');
      return;
    }
    
    try {
      logger.info('⏰ Setting up Enhanced Inventory Sync Job...');
      
      // Initialize the enhanced inventory sync job
      this.inventorySyncJob = new EnhancedInventorySyncJob(this.services);
      
      // Start the cron job (runs every 5 minutes)
      this.inventorySyncJob.start();
      
      // Add API endpoints for manual control
      this.app.get('/api/inventory/sync/status', async (_req, res) => {
        if (!this.inventorySyncJob) {
          return res.status(503).json({ error: 'Inventory sync job not initialized' });
        }
        
        const status = await this.inventorySyncJob.getStatus();
        res.json(status);
      });
      
      this.app.post('/api/inventory/sync/trigger', async (_req, res) => {
        if (!this.inventorySyncJob) {
          return res.status(503).json({ error: 'Inventory sync job not initialized' });
        }
        
        const result = await this.inventorySyncJob.triggerManualSync();
        res.json(result);
      });
      
      this.app.post('/api/inventory/sync/sku/:sku', async (req, res) => {
        if (!this.inventorySyncJob) {
          return res.status(503).json({ error: 'Inventory sync job not initialized' });
        }
        
        const { sku } = req.params;
        const result = await this.inventorySyncJob.syncSpecificSku(sku);
        res.json(result);
      });
      
      this.app.get('/api/inventory/sync/discrepancies', async (_req, res) => {
        if (!this.inventorySyncJob) {
          return res.status(503).json({ error: 'Inventory sync job not initialized' });
        }
        
        const report = await this.inventorySyncJob.getDiscrepancyReport();
        res.json(report);
      });
      
      logger.info('✅ Enhanced Inventory Sync Job initialized and started');
    } catch (error) {
      logger.error('Failed to setup inventory sync job:', error);
      // Don't throw - allow server to continue without sync job
    }
  }

  private setupErrorHandling(): void {
    // 404 handler
    this.app.use(notFoundHandler);

    // Global error handler
    this.app.use(errorHandler);

    // Unhandled rejection handler
    process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      // Application specific logging, throwing an error, or other logic here
    });

    // Uncaught exception handler
    process.on('uncaughtException', (error: Error) => {
      logger.error('Uncaught Exception:', error);
      // Application specific logging, throwing an error, or other logic here
      process.exit(1); // Exit the process to avoid undefined behavior
    });
  }

  listen(port: number): Server {
    return this.app.listen(port);
  }
  
  async shutdown(): Promise<void> {
    logger.info('Shutting down app...');
    
    // Stop inventory sync job if running
    if (this.inventorySyncJob) {
      this.inventorySyncJob.stop();
      await this.inventorySyncJob.cleanup();
      this.inventorySyncJob = null;
    }
    
    // Close other resources...
    logger.info('App shutdown complete');
  }
}