// packages/backend/src/app.ts
import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';
import hpp from 'hpp';
import { createServer, Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import swaggerUi from 'swagger-ui-express';
import { config } from './config/index.js';
import { logger, stream } from './utils/logger.js';
import { ServiceContainer } from './services/ServiceContainer.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { notFoundHandler } from './middlewares/notFoundHandler.js';
import { requestLogger } from './middlewares/requestLogger.js';
import { setupRoutes } from './routes/index.js';
import { setupSocketHandlers } from './websocket/index.js';
import { swaggerSpec } from './config/swagger.js';

export class App {
  private app: Application;
  private httpServer?: HttpServer;
  private io?: SocketIOServer;
  private services: ServiceContainer;
  private isInitialized = false;

  constructor(services: ServiceContainer) {
    this.app = express();
    this.services = services;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn('App is already initialized');
      return;
    }

    try {
      // Setup middleware
      this.setupSecurityMiddleware();
      this.setupCommonMiddleware();
      this.setupLoggingMiddleware();

      // Setup routes
      await this.setupRoutes();

      // Setup WebSocket
      this.setupWebSocket();

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
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
        exposedHeaders: ['X-Total-Count', 'X-Page', 'X-Per-Page'],
      })
    );

    // Rate limiting
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

    // Request ID
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      req.id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      res.setHeader('X-Request-Id', req.id);
      next();
    });

    // Trust proxy
    if (config.isProduction) {
      this.app.set('trust proxy', 1);
    }
  }

  private setupLoggingMiddleware(): void {
    // Morgan HTTP logger
    const morganFormat = config.isDevelopment
      ? 'dev'
      : ':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" :response-time ms';

    this.app.use(
      morgan(morganFormat, {
        stream,
        skip: (req, res) => {
          // Skip health check logs
          return req.url === '/health' && res.statusCode === 200;
        },
      })
    );

    // Custom request logger
    this.app.use(requestLogger);
  }

  private async setupRoutes(): Promise<void> {
    // API documentation
    this.app.use(
      '/api-docs',
      swaggerUi.serve,
      swaggerUi.setup(swaggerSpec, {
        customCss: '.swagger-ui .topbar { display: none }',
        customSiteTitle: 'Hallyu Fomaholic API Documentation',
      })
    );

    // Health check
    this.app.get('/health', async (_req, res) => {
      try {
        // Basic health check - can be enhanced with actual service checks
        const health = {
          status: 'healthy',
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          environment: config.env,
        };
        res.status(200).json(health);
      } catch (error) {
        res.status(503).json({
          status: 'unhealthy',
          error: (error as Error).message,
        });
      }
    });

    // Metrics endpoint
    this.app.get('/metrics', async (_req, res) => {
      try {
        // Basic metrics - can be enhanced with actual metrics collection
        const metrics = {
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          cpu: process.cpuUsage(),
        };
        res.json(metrics);
      } catch (error) {
        res.status(500).json({
          error: 'Failed to get metrics',
        });
      }
    });

    // API routes
    const router = await setupRoutes();
    this.app.use('/api', router);

    // Static files (if needed)
    if (config.isDevelopment) {
      this.app.use('/uploads', express.static('uploads'));
    }
  }

  private setupWebSocket(): void {
    this.httpServer = createServer(this.app);

    this.io = new SocketIOServer(this.httpServer, {
      cors: {
        origin: config.misc.corsOrigin,
        credentials: true,
      },
      transports: ['websocket', 'polling'],
      pingTimeout: 60000,
      pingInterval: 25000,
    });

    // Setup WebSocket handlers
    setupSocketHandlers(this.io, this.services);

    // Attach WebSocket to services container
    this.services.io = this.io;

    logger.info('✅ WebSocket server initialized');
  }

  private setupErrorHandling(): void {
    // 404 handler
    this.app.use(notFoundHandler);

    // Global error handler
    this.app.use(errorHandler);
  }

  getApp(): Application {
    return this.app;
  }

  getHttpServer(): HttpServer | undefined {
    return this.httpServer;
  }

  getSocketServer(): SocketIOServer | undefined {
    return this.io;
  }

  listen(port: number, callback?: () => void): HttpServer {
    if (!this.httpServer) {
      this.httpServer = createServer(this.app);
    }

    return this.httpServer.listen(port, callback);
  }

  close(callback?: () => void): void {
    if (this.httpServer) {
      this.httpServer.close(callback);
    }

    if (this.io) {
      this.io.close();
    }
  }
}

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      id?: string;
      rawBody?: string;
      user?: any;
      startTime?: number;
    }
  }
}
