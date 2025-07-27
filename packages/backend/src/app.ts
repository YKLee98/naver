// packages/backend/src/app.ts
import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { createServer, Server } from 'http';
import { config } from './config';
import { logger, stream } from './utils/logger';
import { connectDatabase } from './config/database';
import { errorHandler } from './middlewares/error.middleware';
import { rateLimiter } from './middlewares/rateLimit.middleware';
import { requestLogger } from './middlewares/logger.middleware';
import { healthCheck } from './middlewares/health.middleware';

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
      contentSecurityPolicy: process.env.NODE_ENV === 'production',
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
    this.app.use(requestLogger);

    // Rate limiting
    if (config.env === 'production') {
      this.app.use(config.apiPrefix, rateLimiter);
    }

    // Health check
    this.app.use('/health', healthCheck);
  }

  /**
   * 라우트 설정
   */
  private setupRoutes(): void {
    // API 버전 정보
    this.app.get('/', (req: Request, res: Response) => {
      res.json({
        name: 'Hallyu Pomaholic ERP API',
        version: '1.0.0',
        environment: config.env,
        timestamp: new Date().toISOString(),
      });
    });

    // API 라우트
    this.app.use(`${config.apiPrefix}`, apiRoutes);
    this.app.use(`${config.apiPrefix}/webhooks`, webhookRoutes);
    this.app.use(`${config.apiPrefix}/settings`, settingsRoutes);
    this.app.use(`${config.apiPrefix}/price-sync`, priceSyncRoutes);

    // 404 핸들러
    this.app.use((req: Request, res: Response) => {
      res.status(404).json({
        success: false,
        message: 'Resource not found',
        path: req.path,
      });
    });
  }

  /**
   * 에러 핸들러 설정
   */
  private setupErrorHandlers(): void {
    // 글로벌 에러 핸들러
    this.app.use(errorHandler);

    // 서버 에러 이벤트 핸들러
    this.server.on('error', (error: NodeJS.ErrnoException) => {
      if (error.syscall !== 'listen') {
        throw error;
      }

      switch (error.code) {
        case 'EACCES':
          logger.error('Port requires elevated privileges');
          process.exit(1);
          break;
        case 'EADDRINUSE':
          logger.error('Port is already in use');
          process.exit(1);
          break;
        default:
          throw error;
      }
    });
  }

  /**
   * 서버 시작
   */
  listen(port: number): void {
    if (!this.isInitialized) {
      throw new Error('App must be initialized before starting');
    }

    this.server.listen(port, () => {
      logger.info(`🚀 Server is running on port ${port}`);
      logger.info(`🌍 Environment: ${config.env}`);
      logger.info(`📍 API Endpoint: http://localhost:${port}${config.apiPrefix}`);
    });

    // 서버 시작 이벤트
    this.server.on('listening', () => {
      const addr = this.server.address();
      const bind = typeof addr === 'string' ? `pipe ${addr}` : `port ${addr?.port}`;
      logger.info(`Listening on ${bind}`);
    });
  }

  /**
   * 서버 종료
   */
  close(callback?: () => void): void {
    logger.info('Closing server...');
    
    this.server.close((err) => {
      if (err) {
        logger.error('Error closing server:', err);
      } else {
        logger.info('Server closed successfully');
      }
      
      if (callback) {
        callback();
      }
    });
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