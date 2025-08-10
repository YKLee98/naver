// packages/backend/src/app.ts
import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import 'express-async-errors';

import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import { ServiceContainer } from './services/ServiceContainer.js';
import { setupApiRoutes } from './routes/api.routes.js';
import { setupRoutes } from './routes/index.js';

export class App {
  private app: Application;
  private io?: any;
  private services: ServiceContainer;
  private isInitialized: boolean = false;

  constructor(services: ServiceContainer) {
    this.app = express();
    this.services = services;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      throw new Error('App is already initialized');
    }

    // Setup middlewares
    this.setupMiddlewares();

    // Setup routes
    await this.setupRoutes();

    // Error handling middleware (must be last)
    this.setupErrorHandlers();

    this.isInitialized = true;
    logger.info('✅ Express app initialized successfully');
  }

  private setupMiddlewares(): void {
    // Security
    this.app.use(helmet({
      contentSecurityPolicy: config.isProduction ? undefined : false,
    }));

    // CORS
    this.app.use(cors({
      origin: config.misc.corsOrigin || '*',
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    }));

    // Body parsing
    this.app.use(express.json({ limit: '50mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '50mb' }));
    
    // Cookie parser
    this.app.use(cookieParser());

    // Compression
    this.app.use(compression());
    
    // Logging
    if (config.env !== 'test') {
      this.app.use(morgan('combined'));
    }
  }

  private async setupRoutes(): Promise<void> {
    const apiPrefix = config.api.prefix || '/api/v1';
    
    // Health check (no auth required)
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: config.env,
      });
    });

    // Metrics endpoint
    this.app.get('/metrics', (req: Request, res: Response) => {
      res.json({
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage(),
        timestamp: new Date().toISOString(),
      });
    });
    
    // Root API info
    this.app.get('/', (req: Request, res: Response) => {
      res.json({
        name: 'Hallyu ERP Backend API',
        version: '1.0.0',
        environment: config.env,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        endpoints: {
          health: '/health',
          metrics: '/metrics',
          api: apiPrefix,
          swagger: '/api-docs',
        }
      });
    });

    // API Version info
    this.app.get(apiPrefix, (req: Request, res: Response) => {
      res.json({
        version: 'v1',
        status: 'active',
        timestamp: new Date().toISOString(),
      });
    });

    // Setup main API routes using the function from api.routes.ts
    try {
      const apiRouter = setupApiRoutes();
      this.app.use(apiPrefix, apiRouter);
      logger.info('✅ API routes mounted at', apiPrefix);
    } catch (error) {
      logger.error('Failed to setup API routes:', error);
      // Continue even if some routes fail
    }

    // Setup additional routes from routes/index.ts
    try {
      const additionalRoutes = await setupRoutes();
      this.app.use(apiPrefix, additionalRoutes);
      logger.info('✅ Additional routes mounted');
    } catch (error) {
      logger.warn('Some additional routes could not be loaded:', error);
      // Continue even if some routes fail
    }

    // Swagger documentation (if enabled)
    if (config.isDevelopment) {
      this.app.get('/api-docs', (req: Request, res: Response) => {
        res.json({
          message: 'API documentation will be available here',
          swagger: '/api-docs/swagger.json',
        });
      });
    }

    // 404 handler (must be last)
    this.app.use((req: Request, res: Response) => {
      logger.warn(`404 - ${req.method} ${req.originalUrl}`);
      res.status(404).json({
        success: false,
        error: 'Resource not found',
        path: req.originalUrl,
        method: req.method,
      });
    });
  }

  private setupErrorHandlers(): void {
    // Global error handler
    this.app.use((err: any, req: Request, res: Response, next: NextFunction) => {
      // Log error
      logger.error('Express error handler:', {
        error: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
        body: req.body,
      });

      // Don't leak error details in production
      const isDev = config.isDevelopment;
      
      // Default error status
      const status = err.statusCode || err.status || 500;
      
      res.status(status).json({
        success: false,
        error: isDev ? err.message : 'Internal server error',
        ...(isDev && { stack: err.stack }),
        ...(isDev && { details: err }),
      });
    });
  }

  async initializeWebSocket(server: any): Promise<void> {
    try {
      const { Server } = await import('socket.io');
      this.io = new Server(server, {
        cors: {
          origin: config.misc.corsOrigin || '*',
          methods: ['GET', 'POST'],
        },
      });

      this.io.on('connection', (socket: any) => {
        logger.info('WebSocket client connected:', socket.id);

        socket.on('disconnect', () => {
          logger.info('WebSocket client disconnected:', socket.id);
        });

        // Add your WebSocket event handlers here
        socket.on('subscribe', (channel: string) => {
          socket.join(channel);
          logger.debug(`Client ${socket.id} subscribed to ${channel}`);
        });

        socket.on('unsubscribe', (channel: string) => {
          socket.leave(channel);
          logger.debug(`Client ${socket.id} unsubscribed from ${channel}`);
        });
      });

      logger.info('✅ WebSocket server initialized');
    } catch (error) {
      logger.error('Failed to initialize WebSocket:', error);
    }
  }

  getApp(): Application {
    return this.app;
  }

  getIO(): any {
    return this.io;
  }

  getServices(): ServiceContainer {
    return this.services;
  }
}