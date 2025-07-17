// packages/backend/src/app.ts
import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { connectDatabase } from './config/database';
import { connectRedis } from './config/redis';
import { errorMiddleware } from './middlewares/error.middleware';
import { rateLimiterMiddleware } from './middlewares/rateLimiter.middleware';
import { loggingMiddleware } from './middlewares/logging.middleware';
import apiRoutes from './routes/api.routes';
import webhookRoutes from './routes/webhook.routes';
import healthRoutes from './routes/health.routes';
import { logger } from './utils/logger';
import { SocketServer } from './websocket/SocketServer';

export class App {
  public app: Application;
  public server: any;
  public io: SocketIOServer;
  private socketServer: SocketServer;

  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.io = new SocketIOServer(this.server, {
      cors: {
        origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:5173'],
        credentials: true,
      },
    });
  }

  public async initialize(): Promise<void> {
    await this.connectDatabases();
    this.setupMiddlewares();
    this.setupRoutes();
    this.setupWebSocket();
    this.setupErrorHandling();
  }

  private async connectDatabases(): Promise<void> {
    await connectDatabase();
    await connectRedis();
  }

  private setupMiddlewares(): void {
    // Security
    this.app.use(helmet({
      contentSecurityPolicy: false, // WebSocket 호환성
    }));

    // CORS
    this.app.use(cors({
      origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:5173'],
      credentials: true,
    }));

    // Body parsing - Webhook은 raw body 필요
    this.app.use('/api/webhooks', express.raw({ type: 'application/json' }));
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Compression
    this.app.use(compression());

    // Logging
    this.app.use(morgan('combined', {
      stream: { write: (message) => logger.info(message.trim()) },
    }));
    this.app.use(loggingMiddleware);

    // Rate limiting
    this.app.use('/api', rateLimiterMiddleware);

    // Request ID
    this.app.use((req, res, next) => {
      req.id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      res.setHeader('X-Request-ID', req.id);
      next();
    });
  }

  private setupRoutes(): void {
    // Health check
    this.app.use('/health', healthRoutes);

    // API routes
    this.app.use('/api/v1', apiRoutes);

    // Webhook routes (no auth required)
    this.app.use('/api/webhooks', webhookRoutes);

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        success: false,
        message: 'Route not found',
        path: req.path,
      });
    });
  }

  private setupWebSocket(): void {
    this.socketServer = new SocketServer(this.io);
    this.socketServer.initialize();
  }

  private setupErrorHandling(): void {
    this.app.use(errorMiddleware);

    // Unhandled rejection handler
    process.on('unhandledRejection', (reason: any) => {
      logger.error('Unhandled Rejection:', reason);
    });

    // Uncaught exception handler
    process.on('uncaughtException', (error: Error) => {
      logger.error('Uncaught Exception:', error);
      process.exit(1);
    });
  }

  public listen(port: number): void {
    this.server.listen(port, () => {
      logger.info(`Server is running on port ${port}`);
      logger.info(`Environment: ${process.env.NODE_ENV}`);
    });
  }

  public getSocketServer(): SocketServer {
    return this.socketServer;
  }
}

