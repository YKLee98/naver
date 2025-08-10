// packages/backend/src/app.ts
import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import { ServiceContainer } from './services/ServiceContainer.js';
import { setupApiRoutes } from './routes/api.routes.js';
import { setupHealthRoutes } from './routes/health.routes.js';
import { setupAuthRoutes } from './routes/auth.routes.js';
import { setupWebhookRoutes } from './routes/webhook.routes.js';
import { setupSettingsRoutes } from './routes/settings.routes.js';
import { setupDashboardRoutes } from './routes/dashboard.routes.js';
import { errorHandler } from './middlewares/error.middleware.js';
import { requestLogger } from './middlewares/logger.middleware.js';
import { logger } from './utils/logger.js';
import { config } from './config/index.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class App {
  private app: Application;
  private services: ServiceContainer;
  private io?: any;

  constructor(services: ServiceContainer) {
    this.app = express();
    this.services = services;
  }

  async initialize(): Promise<void> {
    try {
      // Basic middleware
      this.setupBasicMiddleware();
      
      // Security middleware
      this.setupSecurityMiddleware();
      
      // Routes
      await this.setupRoutes();
      
      // Error handling
      this.setupErrorHandling();
      
      logger.info('✅ Express application initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Express application:', error);
      throw error;
    }
  }

  private setupBasicMiddleware(): void {
    // Body parsing
    this.app.use(express.json({ limit: '50mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '50mb' }));
    
    // Cookie parsing
    this.app.use(cookieParser());
    
    // Compression
    this.app.use(compression());
    
    // Request logging
    if (process.env.NODE_ENV !== 'test') {
      this.app.use(morgan('combined', {
        stream: {
          write: (message: string) => logger.http(message.trim())
        }
      }));
    }
    
    // Custom request logger
    this.app.use(requestLogger);
    
    // Static files (if needed)
    this.app.use('/static', express.static(path.join(__dirname, '../public')));
  }

  private setupSecurityMiddleware(): void {
    // Helmet for security headers
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
    const corsOptions = {
      origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
        const allowedOrigins = config.misc?.corsOrigin?.split(',') || ['http://localhost:5173'];
        
        // Allow requests with no origin (like mobile apps or Postman)
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-API-Key'],
      exposedHeaders: ['X-Total-Count', 'X-Page', 'X-Per-Page'],
    };
    
    this.app.use(cors(corsOptions));
    
    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
      message: 'Too many requests from this IP, please try again later.',
      standardHeaders: true,
      legacyHeaders: false,
    });
    
    // Apply rate limiting to API routes
    this.app.use('/api/', limiter);
    
    // Stricter rate limiting for auth routes
    const authLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 5,
      message: 'Too many authentication attempts, please try again later.',
    });
    
    this.app.use('/auth/login', authLimiter);
    this.app.use('/auth/register', authLimiter);
  }

  private async setupRoutes(): Promise<void> {
    // Health check routes (no auth required)
    const healthRoutes = setupHealthRoutes();
    this.app.use('/health', healthRoutes);
    logger.info('✅ Health routes registered at /health');
    
    // Auth routes
    const authRoutes = setupAuthRoutes(this.services.authController);
    this.app.use('/auth', authRoutes);
    logger.info('✅ Auth routes registered at /auth');
    
    // Webhook routes (no auth but with signature validation)
    const webhookRoutes = setupWebhookRoutes(this.services);
    this.app.use('/webhooks', webhookRoutes);
    logger.info('✅ Webhook routes registered at /webhooks');
    
    // API routes (with auth)
    const apiRoutes = setupApiRoutes(this.services);
    this.app.use('/api/v1', apiRoutes);
    logger.info('✅ API routes registered at /api/v1');
    
    // Dashboard routes (optional)
    try {
      const dashboardRoutes = setupDashboardRoutes(this.services);
      this.app.use('/dashboard', dashboardRoutes);
      logger.info('✅ Dashboard routes registered at /dashboard');
    } catch (error) {
      logger.warn('Dashboard routes not available:', error);
    }
    
    // Settings routes (optional)
    try {
      const settingsRoutes = setupSettingsRoutes(this.services);
      this.app.use('/settings', settingsRoutes);
      logger.info('✅ Settings routes registered at /settings');
    } catch (error) {
      logger.warn('Settings routes not available:', error);
    }
    
    // Root route
    this.app.get('/', (req, res) => {
      res.json({
        name: 'Hallyu ERP Backend',
        version: process.env.npm_package_version || '1.0.0',
        status: 'running',
        timestamp: new Date().toISOString(),
        endpoints: {
          health: '/health',
          api: '/api/v1',
          auth: '/auth',
          webhooks: '/webhooks',
          dashboard: '/dashboard',
          settings: '/settings'
        }
      });
    });
  }

  private setupErrorHandling(): void {
    // 404 handler
    this.app.use((req, res, next) => {
      res.status(404).json({
        success: false,
        error: 'Route not found',
        path: req.originalUrl,
        method: req.method
      });
    });
    
    // Global error handler
    this.app.use(errorHandler);
    
    // Unhandled rejection handler
    this.app.use((err: any, req: Request, res: Response, next: NextFunction) => {
      logger.error('Unhandled error:', err);
      
      const isDev = process.env.NODE_ENV === 'development';
      
      res.status(err.status || 500).json({
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
          origin: config.misc?.corsOrigin?.split(',') || ['http://localhost:5173'],
          methods: ['GET', 'POST'],
          credentials: true
        },
        transports: ['websocket', 'polling'],
        pingTimeout: 60000,
        pingInterval: 25000
      });

      // Attach WebSocket to service container
      this.services.setWebSocket(this.io);

      // WebSocket middleware for authentication
      this.io.use(async (socket: any, next: any) => {
        try {
          const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization;
          
          if (!token) {
            return next(new Error('Authentication required'));
          }
          
          // TODO: Verify JWT token and attach user to socket
          // const user = await verifyToken(token);
          // socket.userId = user.id;
          
          next();
        } catch (error) {
          next(new Error('Authentication failed'));
        }
      });

      // Connection handler
      this.io.on('connection', (socket: any) => {
        logger.info(`WebSocket client connected: ${socket.id}`);
        
        // Join user-specific room
        if (socket.userId) {
          socket.join(`user:${socket.userId}`);
        }

        // Handle disconnection
        socket.on('disconnect', (reason: string) => {
          logger.info(`WebSocket client disconnected: ${socket.id}, reason: ${reason}`);
        });

        // Subscribe to channels
        socket.on('subscribe', (channels: string | string[]) => {
          const channelList = Array.isArray(channels) ? channels : [channels];
          channelList.forEach(channel => {
            socket.join(channel);
            logger.debug(`Client ${socket.id} subscribed to ${channel}`);
          });
        });

        // Unsubscribe from channels
        socket.on('unsubscribe', (channels: string | string[]) => {
          const channelList = Array.isArray(channels) ? channels : [channels];
          channelList.forEach(channel => {
            socket.leave(channel);
            logger.debug(`Client ${socket.id} unsubscribed from ${channel}`);
          });
        });

        // Handle ping/pong for keep-alive
        socket.on('ping', () => {
          socket.emit('pong', { timestamp: Date.now() });
        });
      });

      // Setup WebSocket event handlers
      await this.setupWebSocketHandlers();

      logger.info('✅ WebSocket server initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize WebSocket:', error);
      // Don't throw - WebSocket is optional
    }
  }

  private async setupWebSocketHandlers(): Promise<void> {
    if (!this.io) return;

    try {
      // Import WebSocket event handlers
      const { registerInventoryEvents } = await import('./websocket/events/inventory.events.js');
      const { registerSyncEvents } = await import('./websocket/events/sync.events.js');
      const { registerPriceEvents } = await import('./websocket/events/price.events.js');
      const { registerNotificationEvents } = await import('./websocket/events/notification.events.js');

      this.io.on('connection', (socket: any) => {
        // Register event handlers for each socket
        registerInventoryEvents(this.io, socket);
        registerSyncEvents(this.io, socket);
        registerPriceEvents(this.io, socket);
        registerNotificationEvents(this.io, socket);
      });

      logger.info('✅ WebSocket event handlers registered');
    } catch (error) {
      logger.warn('Some WebSocket event handlers not available:', error);
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