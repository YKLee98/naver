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

// 자동 복구 작업
import { AutoRecoveryJob } from './jobs/autoRecovery';

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
    
    // Rate limiting (프로덕션 환경에서만)
    if (config.env === 'production') {
      this.app.use('/api', rateLimiter);
    }
    
    // 정적 파일 제공
    this.app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
  }

  /**
   * 서비스 초기화
   */
  private async initializeServices() {
    logger.info('Initializing services...');
    
    // Redis 클라이언트
    this.redis = getRedisClient();
    
    // 네이버 서비스
    const naverAuthService = new NaverAuthService(this.redis);
    const naverProductService = new NaverProductService(naverAuthService);
    const naverOrderService = new NaverOrderService(naverAuthService);
    
    // Shopify 서비스
    const shopifyGraphQLService = new ShopifyGraphQLService();
    const shopifyBulkService = new ShopifyBulkService();
    
    // 동기화 서비스
    const mappingService = new MappingService(
      naverProductService,
      shopifyGraphQLService
    );
    
    const inventorySyncService = new InventorySyncService(
      naverProductService,
      shopifyBulkService
    );
    
    const priceSyncService = new PriceSyncService(
      this.redis,
      naverProductService,
      shopifyGraphQLService
    );
    
    const syncService = new SyncService(
      naverProductService,
      naverOrderService,
      shopifyBulkService,
      this.redis
    );
    
    const exchangeRateService = new ExchangeRateService(this.redis);
    
    // 컨트롤러는 개별적으로 import하여 생성
    const { ProductController } = await import('./controllers/ProductController');
    const { InventoryController } = await import('./controllers/InventoryController');
    const { SyncController } = await import('./controllers/SyncController');
    const { MappingController } = await import('./controllers/MappingController');
    const { DashboardController } = await import('./controllers/DashboardController');
    const { AuthController } = await import('./controllers/AuthController');
    const { WebhookController } = await import('./controllers/WebhookController');
    
    const productController = new ProductController(
      naverProductService,
      shopifyGraphQLService
    );
    
    const inventoryController = new InventoryController(inventorySyncService);
    const syncController = new SyncController(syncService, inventorySyncService);
    const mappingController = new MappingController(
      mappingService,
      naverProductService,
      shopifyGraphQLService
    );
    const dashboardController = new DashboardController();
    const authController = new AuthController();
    const webhookController = new WebhookController(inventorySyncService);
    
    // PriceController는 존재하지 않을 수 있으므로 조건부로 로드
    let priceController = null;
    try {
      const { PriceController } = await import('./controllers/PriceController');
      priceController = new PriceController(priceSyncService);
    } catch (error) {
      logger.warn('PriceController not found, skipping...');
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
      controllers: {
        productController,
        inventoryController,
        syncController,
        mappingController,
        dashboardController,
        authController,
        webhookController,
        priceController
      },
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
   * 라우트 설정
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
    
    // API 라우트 설정 - 기본 라우트만 설정
    const apiRouter = express.Router();
    
    // 각 컨트롤러별 라우트 설정
    apiRouter.get('/products', controllers.productController?.getMappedProducts || ((req, res) => res.json({ message: 'Products API' })));
    apiRouter.get('/inventory/status', controllers.inventoryController?.getAllInventoryStatus || ((req, res) => res.json({ message: 'Inventory API' })));
    apiRouter.post('/sync/full', controllers.syncController?.performFullSync || ((req, res) => res.json({ message: 'Sync API' })));
    apiRouter.get('/mappings', controllers.mappingController?.getMappings || ((req, res) => res.json({ message: 'Mappings API' })));
    apiRouter.get('/dashboard/stats', controllers.dashboardController?.getStats || ((req, res) => res.json({ message: 'Dashboard API' })));
    apiRouter.post('/auth/login', controllers.authController?.login || ((req, res) => res.json({ message: 'Auth API' })));
    apiRouter.post('/webhooks/shopify', controllers.webhookController?.handleShopifyWebhook || ((req, res) => res.json({ message: 'Webhook API' })));
    
    if (controllers.priceController) {
      apiRouter.get('/prices', controllers.priceController.getPrices || ((req, res) => res.json({ message: 'Price API' })));
    }
    
    this.app.use('/api/v1', apiRouter);
    
    // 404 핸들러
    this.app.use((req, res) => {
      res.status(404).json({
        success: false,
        message: 'Resource not found',
        path: req.path
      });
    });
    
    // 에러 핸들러 (반드시 마지막에)
    this.app.use(errorHandler);
  }

  /**
   * WebSocket 설정
   */
  private setupWebSocket(): void {
    this.io.on('connection', (socket) => {
      logger.info(`New WebSocket connection: ${socket.id}`);
      
      socket.on('join', (room) => {
        socket.join(room);
        logger.info(`Socket ${socket.id} joined room: ${room}`);
      });
      
      socket.on('sync-update', (data) => {
        this.io.to('admin').emit('sync-status', data);
      });
      
      socket.on('inventory-change', (data) => {
        this.io.emit('inventory-updated', data);
      });
      
      socket.on('price-change', (data) => {
        this.io.emit('price-updated', data);
      });
      
      socket.on('disconnect', () => {
        logger.info(`Socket disconnected: ${socket.id}`);
      });
    });
  }

  /**
   * 크론 작업 설정
   */
  private setupCronJobs(syncService: any, exchangeRateService: any): void {
    // 전체 동기화 (매일 새벽 3시)
    const fullSyncTask = cron.schedule('0 3 * * *', async () => {
      logger.info('Starting scheduled full sync...');
      try {
        await syncService.performFullSync();
        logger.info('Scheduled full sync completed');
      } catch (error) {
        logger.error('Scheduled full sync failed:', error);
      }
    }, {
      scheduled: true,
      timezone: "Asia/Seoul"
    });
    
    // 환율 업데이트 (6시간마다)
    const exchangeRateTask = cron.schedule('0 */6 * * *', async () => {
      logger.info('Updating exchange rates...');
      try {
        await exchangeRateService.updateExchangeRate();
        logger.info('Exchange rates updated');
      } catch (error) {
        logger.error('Exchange rate update failed:', error);
      }
    }, {
      scheduled: true,
      timezone: "Asia/Seoul"
    });
    
    // 재고 확인 (1시간마다)
    const inventoryCheckTask = cron.schedule('0 * * * *', async () => {
      logger.info('Checking inventory levels...');
      try {
        const lowStockItems = await syncService.checkLowStock?.();
        if (lowStockItems?.length > 0) {
          this.io.emit('low-stock-alert', lowStockItems);
        }
      } catch (error) {
        logger.error('Inventory check failed:', error);
      }
    }, {
      scheduled: true,
      timezone: "Asia/Seoul"
    });
    
    this.cronTasks = [fullSyncTask, exchangeRateTask, inventoryCheckTask];
    logger.info('Cron jobs started');
  }

  /**
   * 데이터베이스 연결
   */
  private async connectDatabase(): Promise<void> {
    try {
      await connectDatabase();
      logger.info('MongoDB connected successfully');
      
      mongoose.connection.on('error', (err) => {
        logger.error('MongoDB connection error:', err);
      });
      
      mongoose.connection.on('disconnected', () => {
        logger.warn('MongoDB disconnected');
      });
      
      mongoose.connection.on('reconnected', () => {
        logger.info('MongoDB reconnected');
      });
    } catch (error) {
      logger.error('MongoDB connection failed:', error);
      throw error;
    }
  }

  /**
   * 서버 시작
   */
  public async start(): Promise<void> {
    try {
      // 데이터베이스 연결
      await this.connectDatabase();
      
      // Redis 초기화
      await initializeRedis();
      logger.info('Redis initialized');
      
      // 미들웨어 설정
      this.setupMiddlewares();
      
      // 서비스 초기화
      const { controllers } = await this.initializeServices();
      
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
      
      // Graceful shutdown 설정
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
      logger.info(`${signal} received, starting graceful shutdown...`);
      
      try {
        // 새로운 연결 거부
        this.httpServer.close(() => {
          logger.info('HTTP server closed');
        });
        
        // WebSocket 연결 종료
        this.io.close(() => {
          logger.info('WebSocket server closed');
        });
        
        // 크론 작업 중지
        this.cronTasks.forEach(task => task.stop());
        logger.info('Cron jobs stopped');
        
        // 자동 복구 작업 중지
        if (this.autoRecoveryJob) {
          this.autoRecoveryJob.stop();
          logger.info('Auto recovery job stopped');
        }
        
        // Redis 연결 종료
        await closeRedis();
        logger.info('Redis connection closed');
        
        // MongoDB 연결 종료
        await disconnectDatabase();
        logger.info('MongoDB connection closed');
        
        logger.info('Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        logger.error('Error during graceful shutdown:', error);
        process.exit(1);
      }
    };
    
    // 시그널 핸들러
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    
    // 예외 처리
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      gracefulShutdown('UNCAUGHT_EXCEPTION');
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      gracefulShutdown('UNHANDLED_REJECTION');
    });
  }
}

// 서버 인스턴스 생성 및 시작
const server = new Server();
server.start().catch((error) => {
  logger.error('Server startup failed:', error);
  process.exit(1);
});

// 서버 인스턴스 export (테스트용)
export default server;