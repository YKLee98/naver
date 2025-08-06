// ===== 4. packages/backend/src/app.ts =====
import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { createServer, Server } from 'http';
import { config } from './config';
import { logger, stream } from './utils/logger';
import { errorHandler } from './middlewares/error.middleware';
import { rateLimiter } from './middlewares/rateLimit.middleware';
import { requestLogger } from './middlewares/logger.middleware';
import { healthCheck } from './middlewares/health.middleware';

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
      // 미들웨어 설정
      this.setupMiddlewares();

      // 라우트 설정 - Redis 초기화 이후에 호출됨
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
    // 동적 import를 사용하여 라우트 설정
    // 이렇게 하면 Redis가 초기화된 후에 라우트가 설정됨
    
    // API 버전 정보
    this.app.get('/', (req: Request, res: Response) => {
      res.json({
        name: 'Hallyu Pomaholic ERP API',
        version: '1.0.0',
        environment: config.env,
        timestamp: new Date().toISOString(),
      });
    });

    // Health 라우트 (인증 불필요)
    const healthRoutes = require('./routes/health.routes').default;
    this.app.use('/health', healthRoutes);

    // Webhook 라우트
    const webhookRoutes = require('./routes/webhook.routes').default;
    this.app.use(`${config.apiPrefix}/webhooks`, webhookRoutes);

    // Dashboard 라우트
    const dashboardRoutes = require('./routes/dashboard.routes').default;
    this.app.use(`${config.apiPrefix}/dashboard`, dashboardRoutes);

    // API 라우트 - 함수 호출로 변경
    const { setupApiRoutes } = require('./routes/api.routes');
    this.app.use(`${config.apiPrefix}`, setupApiRoutes());

    // Settings 라우트 - 함수 호출로 변경
    const setupSettingsRoutes = require('./routes/settings.routes').default;
    this.app.use(`${config.apiPrefix}/settings`, setupSettingsRoutes());

    // Price Sync 라우트 - 함수 호출로 변경
    const setupPriceSyncRoutes = require('./routes/priceSync.routes').default;
    this.app.use(`${config.apiPrefix}/price-sync`, setupPriceSyncRoutes());
    // Price 라우트
    const setupPriceRoutes = require('./routes/price.routes').default;
    this.app.use(`${config.apiPrefix}/prices`, setupPriceRoutes());

    // Exchange Rates 라우트  
    const setupExchangeRatesRoutes = require('./routes/exchangeRates.routes').default;
    this.app.use(`${config.apiPrefix}/exchange-rates`, setupExchangeRatesRoutes());

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