// packages/backend/src/server.ts
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import mongoose from 'mongoose';
import path from 'path';
import * as cron from 'node-cron';

// 설정 및 유틸리티
import { logger, stream } from './utils/logger';
import { config } from './config';

// 데이터베이스 및 Redis
import { connectDatabase, disconnectDatabase, isDatabaseConnected } from './config/database';
import { initializeRedis, getRedisClient, closeRedis, isRedisConnected } from './config/redis';

// 미들웨어
import { errorHandler } from './middlewares/error.middleware';
import { requestLogger } from './middlewares/logger.middleware';
import { authMiddleware } from './middlewares/auth.middleware';
import { rateLimiter } from './middlewares/rateLimit.middleware';

// 서비스
import {
  NaverAuthService,
  NaverProductService,
  NaverOrderService
} from './services/naver';
import {
  ShopifyGraphQLService,
  ShopifyBulkService
} from './services/shopify';
import {
  SyncService,
  InventorySyncService,
  MappingService,
  PriceSyncService
} from './services/sync';
import { ExchangeRateService } from './services/exchangeRate';

// 컨트롤러 - 개별 import로 변경하여 에러 방지
import { AuthController } from './controllers/AuthController';
import { ProductController } from './controllers/ProductController';
import { InventoryController } from './controllers/InventoryController';
import { SyncController } from './controllers/SyncController';
import { MappingController } from './controllers/MappingController';
import { DashboardController } from './controllers/DashboardController';
import { WebhookController } from './controllers/WebhookController';

// 자동 복구 작업
import { AutoRecoveryJob } from './jobs/autoRecovery';

// WebSocket
import { initializeWebSocket } from './websocket';

class Server {
  private app: express.Application;
  private httpServer: any;
  private io: SocketIOServer;
  private port: number;
  private wsPort: number;
  private autoRecoveryJob: AutoRecoveryJob | null = null;
  private cronTasks: cron.ScheduledTask[] = [];
  private redis: any;

  constructor() {
    this.app = express();
    this.httpServer = createServer(this.app);
    this.port = parseInt(process.env.PORT || '3000', 10);
    this.wsPort = parseInt(process.env.WS_PORT || '3001', 10);
    
    // WebSocket 서버 설정
    this.io = new SocketIOServer(this.httpServer, {
      cors: {
        origin: process.env.CORS_ORIGIN || '*',
        credentials: true,
      },
      path: '/socket.io',
      transports: ['websocket', 'polling'],
    });
  }

  /**
   * 미들웨어 설정
   */
  private setupMiddlewares(): void {
    // 보안 미들웨어
    this.app.use(helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
      contentSecurityPolicy: false,
    }));
    
    // 압축
    this.app.use(compression());
    
    // CORS
    this.app.use(cors({
      origin: process.env.CORS_ORIGIN || '*',
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    }));
    
    // Body parser
    this.app.use(express.json({ limit: '50mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '50mb' }));
    
    // 로깅
    this.app.use(morgan(config.env === 'production' ? 'combined' : 'dev', { stream }));
    this.app.use(requestLogger);
    
    // Rate limiting (production only)
    if (config.env === 'production') {
      this.app.use(config.apiPrefix, rateLimiter);
    }
  }

  /**
   * 서비스 초기화
   */
  private async initializeServices() {
    // Redis 인스턴스
    this.redis = getRedisClient();
    
    // 네이버 서비스
    const naverAuthService = new NaverAuthService(this.redis);
    const naverProductService = new NaverProductService(naverAuthService);
    const naverOrderService = new NaverOrderService(naverAuthService);
    
    // Shopify 서비스
    const shopifyGraphQLService = new ShopifyGraphQLService();
    const shopifyBulkService = new ShopifyBulkService();
    
    // 동기화 서비스
    const syncService = new SyncService(
      naverProductService,
      naverOrderService,
      shopifyBulkService,
      this.redis
    );
    
    const inventorySyncService = new InventorySyncService(
      naverProductService,
      shopifyBulkService
    );
    
    const mappingService = new MappingService(
      naverProductService,
      shopifyGraphQLService
    );
    
    const priceSyncService = new PriceSyncService(
      this.redis,
      naverProductService,
      shopifyBulkService
    );
    
    const exchangeRateService = new ExchangeRateService(this.redis);
    
    // 컨트롤러 인스턴스 생성 - 선택적으로 생성
    const controllers: any = {};
    
    // 필수 컨트롤러
    try {
      controllers.authController = new AuthController();
    } catch (e) {
      logger.warn('AuthController not available');
    }
    
    try {
      controllers.productController = new ProductController(naverProductService, shopifyGraphQLService);
    } catch (e) {
      logger.warn('ProductController not available');
    }
    
    try {
      controllers.inventoryController = new InventoryController(inventorySyncService);
    } catch (e) {
      logger.warn('InventoryController not available');
    }
    
    try {
      controllers.syncController = new SyncController(syncService);
    } catch (e) {
      logger.warn('SyncController not available');
    }
    
    try {
      controllers.mappingController = new MappingController(mappingService, naverProductService, shopifyGraphQLService);
    } catch (e) {
      logger.warn('MappingController not available');
    }
    
    try {
      controllers.dashboardController = new DashboardController();
    } catch (e) {
      logger.warn('DashboardController not available');
    }
    
    try {
      controllers.webhookController = new WebhookController();
    } catch (e) {
      logger.warn('WebhookController not available');
    }
    
    // 선택적 컨트롤러 - 동적 import 시도
    try {
      const { PriceSyncController } = require('./controllers/PriceSyncController');
      controllers.priceSyncController = new PriceSyncController(priceSyncService);
    } catch (e) {
      logger.warn('PriceSyncController not available');
    }
    
    try {
      const { PriceController } = require('./controllers/PriceController');
      controllers.priceController = new PriceController();
    } catch (e) {
      logger.warn('PriceController not available');
    }
    
    try {
      const { ExchangeRateController } = require('./controllers/ExchangeRateController');
      controllers.exchangeRateController = new ExchangeRateController(exchangeRateService);
    } catch (e) {
      logger.warn('ExchangeRateController not available');
    }
    
    // 자동 복구 작업 시작
    this.autoRecoveryJob = new AutoRecoveryJob(
      naverProductService,
      shopifyGraphQLService
    );
    this.autoRecoveryJob.start();
    logger.info('Auto recovery job started');
    
    // 크론 작업 설정
    this.setupCronJobs(syncService, exchangeRateService);
    
    return {
      controllers,
      services: {
        naverAuthService,
        naverProductService,
        naverOrderService,
        shopifyGraphQLService,
        shopifyBulkService,
        mappingService,
        inventorySyncService,
        priceSyncService,
        syncService,
        exchangeRateService
      }
    };
  }

  /**
   * 라우트 설정 - 수정된 부분
   */
  private setupRoutes(controllers: any): void {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: config.env,
        database: isDatabaseConnected() ? 'connected' : 'disconnected',
        redis: isRedisConnected() ? 'connected' : 'disconnected'
      });
    });
    
    // API 정보
    this.app.get('/', (req, res) => {
      res.json({
        name: 'Hallyu-Pomaholic ERP API',
        version: '1.0.0',
        environment: config.env,
        timestamp: new Date().toISOString(),
        endpoints: {
          health: '/health',
          api: '/api/v1',
          docs: '/api/v1/docs'
        }
      });
    });

    // ✅ Auth 라우트 (인증 불필요)
    try {
      const authRoutes = require('./routes/auth.routes').default;
      this.app.use(`${config.apiPrefix}/auth`, authRoutes);
      logger.info('✅ Auth routes registered');
    } catch (error) {
      logger.warn('Auth routes not available');
    }

    // ✅ Webhook 라우트 (특별 인증)
    try {
      const webhookRoutes = require('./routes/webhook.routes').default;
      this.app.use(`${config.apiPrefix}/webhooks`, webhookRoutes);
      logger.info('✅ Webhook routes registered');
    } catch (error) {
      logger.warn('Webhook routes not available');
    }

    // ✅ Dashboard 라우트 - 수정된 메서드 이름으로 등록
    try {
      const { setupDashboardRoutes } = require('./routes/dashboard.routes');
      const dashboardRouter = setupDashboardRoutes();
      this.app.use(`${config.apiPrefix}/dashboard`, dashboardRouter);
      logger.info('✅ Dashboard routes registered at /api/v1/dashboard');
    } catch (error) {
      logger.error('❌ Dashboard routes error:', error.message);
    }

    // ✅ API 라우트 - SKU 검색 포함
    try {
      const { setupApiRoutes } = require('./routes/api.routes');
      const apiRouter = setupApiRoutes();
      this.app.use(`${config.apiPrefix}`, apiRouter);
      logger.info('✅ API routes registered');
    } catch (error) {
      logger.error('❌ API routes error:', error.message);
    }

    // ✅ Settings 라우트
    try {
      const setupSettingsRoutes = require('./routes/settings.routes').default;
      if (typeof setupSettingsRoutes === 'function') {
        this.app.use(`${config.apiPrefix}/settings`, setupSettingsRoutes());
        logger.info('✅ Settings routes registered');
      }
    } catch (error) {
      logger.warn('Settings routes not available');
    }

    // ✅ Price Sync 라우트
    try {
      const setupPriceSyncRoutes = require('./routes/priceSync.routes').default;
      if (typeof setupPriceSyncRoutes === 'function') {
        this.app.use(`${config.apiPrefix}/price-sync`, setupPriceSyncRoutes());
        logger.info('✅ Price sync routes registered');
      }
    } catch (error) {
      logger.warn('Price sync routes not available');
    }

    // ✅ Price 라우트 - 중요!
    try {
      const setupPriceRoutes = require('./routes/price.routes').default;
      if (typeof setupPriceRoutes === 'function') {
        this.app.use(`${config.apiPrefix}/prices`, setupPriceRoutes());
        logger.info('✅ Price routes registered at /api/v1/prices');
      }
    } catch (error) {
      logger.error('❌ Price routes error:', error.message);
    }

    // ✅ Exchange Rates 라우트 - 중요!
    try {
      const setupExchangeRatesRoutes = require('./routes/exchangeRates.routes').default;
      if (typeof setupExchangeRatesRoutes === 'function') {
        this.app.use(`${config.apiPrefix}/exchange-rates`, setupExchangeRatesRoutes());
        logger.info('✅ Exchange rates routes registered at /api/v1/exchange-rates');
      }
    } catch (error) {
      logger.error('❌ Exchange rates routes error:', error.message);
    }

    // 404 핸들러 - 모든 라우트 등록 후 마지막에 추가
    this.app.use((req, res) => {
      logger.warn(`404 - Route not found: ${req.method} ${req.path}`);
      res.status(404).json({
        success: false,
        message: 'Resource not found',
        path: req.path,
        method: req.method,
        timestamp: new Date().toISOString()
      });
    });

    // 에러 핸들러
    this.app.use(errorHandler);
  }

  /**
   * 크론 작업 설정
   */
  private setupCronJobs(syncService: SyncService, exchangeRateService: ExchangeRateService): void {
    // 재고 동기화 (매 30분)
    const inventorySyncJob = cron.schedule('*/30 * * * *', async () => {
      logger.info('Starting scheduled inventory sync');
      try {
        await syncService.performFullSync({ skipPrices: true });
      } catch (error) {
        logger.error('Scheduled inventory sync failed:', error);
      }
    });
    
    // 가격 동기화 (매 1시간)
    const priceSyncJob = cron.schedule('0 * * * *', async () => {
      logger.info('Starting scheduled price sync');
      try {
        await syncService.performFullSync({ skipInventory: true });
      } catch (error) {
        logger.error('Scheduled price sync failed:', error);
      }
    });
    
    // 환율 업데이트 (매일 오전 9시)
    const exchangeRateJob = cron.schedule('0 9 * * *', async () => {
      logger.info('Starting scheduled exchange rate update');
      try {
        await exchangeRateService.updateExchangeRate();
      } catch (error) {
        logger.error('Scheduled exchange rate update failed:', error);
      }
    });
    
    this.cronTasks = [inventorySyncJob, priceSyncJob, exchangeRateJob];
    
    // 크론 작업 시작
    this.cronTasks.forEach(task => task.start());
    logger.info('Cron jobs started');
  }

  /**
   * WebSocket 초기화
   */
  private setupWebSocket(): void {
    initializeWebSocket(this.io);
    logger.info('WebSocket server initialized');
  }

  /**
   * 서버 시작
   */
  async start(): Promise<void> {
    try {
      // 데이터베이스 연결
      await connectDatabase();
      logger.info('MongoDB connected successfully');
      
      // Redis 초기화
      await initializeRedis();
      logger.info('Redis initialized successfully');
      
      // 미들웨어 설정
      this.setupMiddlewares();
      
      // 서비스 초기화
      const { controllers, services } = await this.initializeServices();
      logger.info('Services initialized successfully');
      
      // 라우트 설정
      this.setupRoutes(controllers);
      
      // WebSocket 설정
      this.setupWebSocket();
      
      // HTTP 서버 시작
      this.httpServer.listen(this.port, () => {
        logger.info('========================================');
        logger.info(`🚀 Server is running on port ${this.port}`);
        logger.info(`🌍 Environment: ${config.env}`);
        logger.info(`📍 API Endpoint: http://localhost:${this.port}/api/v1`);
        logger.info(`💡 Health Check: http://localhost:${this.port}/health`);
        logger.info(`🔌 WebSocket: ws://localhost:${this.port}`);
        logger.info('========================================');
      });
      
      // Graceful shutdown 처리
      this.setupGracefulShutdown();
      
    } catch (error) {
      logger.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  /**
   * Graceful shutdown 설정
   */
  private setupGracefulShutdown(): void {
    const gracefulShutdown = async (signal: string) => {
      logger.info(`${signal} received, shutting down gracefully`);
      
      try {
        // 크론 작업 중지
        this.cronTasks.forEach(task => task.stop());
        logger.info('Cron jobs stopped');
        
        // 자동 복구 작업 중지
        if (this.autoRecoveryJob) {
          this.autoRecoveryJob.stop();
          logger.info('Auto recovery job stopped');
        }
        
        // HTTP 서버 종료
        this.httpServer.close(() => {
          logger.info('HTTP server closed');
        });
        
        // WebSocket 연결 종료
        this.io.close(() => {
          logger.info('WebSocket server closed');
        });
        
        // 데이터베이스 연결 해제
        await disconnectDatabase();
        logger.info('Database disconnected');
        
        // Redis 연결 해제
        await closeRedis();
        logger.info('Redis disconnected');
        
        logger.info('All connections closed successfully');
        process.exit(0);
      } catch (error) {
        logger.error('Error during graceful shutdown:', error);
        process.exit(1);
      }
    };

    // 시그널 핸들러 등록
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // 예외 처리
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      process.exit(1);
    });
  }
}

// 서버 인스턴스 생성 및 시작
const server = new Server();
server.start();

export default server;