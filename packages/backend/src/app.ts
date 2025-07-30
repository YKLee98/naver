// packages/backend/src/app.ts
import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { createServer, Server } from 'http';
import { config } from './config';
import { logger, stream } from './utils/logger';
import { connectDatabase } from './config/database';
import { errorMiddleware } from './middlewares/error.middleware';

// Routes
import apiRoutes from './routes/api.routes';
import webhookRoutes from './routes/webhook.routes';
import settingsRoutes from './routes/settings.routes';
import priceSyncRoutes from './routes/priceSync.routes';

export class App {
  private app: Application;
  private server: Server;
  private isInitialized: boolean = false;

  constructor() {
    this.app = express();
    this.server = createServer(this.app);
  }

  /**
   * 앱 초기화
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // 데이터베이스 연결
      await connectDatabase();

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

    // Health check
    this.app.get('/health', (_req: Request, res: Response) => {
      res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      });
    });
  }

  /**
   * 라우트 설정
   */
  private setupRoutes(): void {
    // API 라우트
    this.app.use('/api', apiRoutes);

    // Webhook 라우트
    this.app.use('/webhooks', webhookRoutes);

    // Settings 라우트
    this.app.use('/settings', settingsRoutes);

    // Price sync 라우트
    this.app.use('/price-sync', priceSyncRoutes);

    // 루트 경로
    this.app.get('/', (_req: Request, res: Response) => {
      res.json({
        name: '@hallyu/backend',
        version: '1.0.0',
        environment: config.env,
      });
    });

    // 404 핸들러
    this.app.use('*', (_req: Request, res: Response) => {
      res.status(404).json({
        success: false,
        message: 'Resource not found',
      });
    });
  }

  /**
   * 에러 핸들러 설정
   */
  private setupErrorHandlers(): void {
    this.app.use(errorMiddleware);
  }

  /**
   * 서버 시작
   */
  listen(port: number): void {
    this.server.listen(port, () => {
      logger.info(`Server is running on port ${port}`);
    });
  }

  /**
   * 서버 종료
   */
  close(callback?: () => void): void {
    this.server.close(callback);
  }
}