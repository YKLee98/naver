// packages/backend/src/app.ts
import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { createServer, Server } from 'http';
import { Redis } from 'ioredis';
import { config } from './config';
import { logger, stream } from './utils/logger';
import { errorMiddleware } from './middlewares/error.middleware';
import { rateLimiter } from './middlewares/rateLimit.middleware';

// Route creators
import { createApiRouter } from './routes/api.routes';
import { createWebhookRouter } from './routes/webhook.routes';
import healthRoutes from './routes/health.routes';

export class App {
  private app: Application;
  private server: Server;
  private redis: Redis;
  private isInitialized: boolean = false;

  constructor(redis: Redis) {
    this.app = express();
    this.server = createServer(this.app);
    this.redis = redis;
  }

  /**
   * 앱 초기화
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // 미들웨어 설정
      this.setupMiddlewares();

      // 라우트 설정
      this.setupRoutes();

      // 에러 핸들러 (반드시 마지막에)
      this.setupErrorHandlers();

      this.isInitialized = true;
      logger.info('App initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize app:', error);
      throw error;
    }
  }

  /**
   * 미들웨어 설정
   */
  private setupMiddlewares(): void {
    // 보안 미들웨어
    this.app.use(helmet({
      contentSecurityPolicy: process.env['NODE_ENV'] === 'production',
    }));

    // CORS 설정
    this.app.use(cors({
      origin: config.corsOrigin,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    }));

    // Body parser
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // 압축
    this.app.use(compression());

    // 로깅
    this.app.use(morgan(config.env === 'production' ? 'combined' : 'dev', { stream }));

    // Rate limiting
    if (config.env === 'production') {
      this.app.use('/api', rateLimiter);
    }
  }

  /**
   * 라우트 설정
   */
  private setupRoutes(): void {
    // Root endpoint
    this.app.get('/', (req: Request, res: Response) => {
      res.json({
        name: 'Hallyu Pomaholic ERP API',
        version: '1.0.0',
        environment: config.env,
        timestamp: new Date().toISOString(),
      });
    });

    // Health check (인증 불필요)
    this.app.use('/health', healthRoutes);

    // Webhook routes with Redis injection
    this.app.use('/webhooks', createWebhookRouter(this.redis));

    // API routes with Redis injection
    this.app.use('/api/v1', createApiRouter(this.redis));

    // 404 Handler
    this.app.use('*', (req: Request, res: Response) => {
      res.status(404).json({
        status: 'error',
        message: 'Route not found',
      });
    });
  }

  /**
   * 에러 핸들러 설정
   */
  private setupErrorHandlers(): void {
    // Global error handler
    this.app.use(errorMiddleware);
  }

  /**
   * 서버 시작
   */
  listen(port: number): void {
    this.server.listen(port, () => {
      logger.info(`Server is running on port ${port}`);
      logger.info(`Environment: ${config.env}`);
      logger.info(`API URL: http://localhost:${port}/api/v1`);
    });
  }

  /**
   * 서버 종료
   */
  close(callback?: () => void): void {
    this.server.close(callback);
  }

  /**
   * Express 앱 인스턴스 반환
   */
  getApp(): Application {
    return this.app;
  }

  /**
   * HTTP 서버 인스턴스 반환
   */
  getServer(): Server {
    return this.server;
  }
}