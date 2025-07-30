// packages/backend/src/server.ts
import 'dotenv/config';
import { App } from './app';
import { logger } from './utils/logger';
import { connectDatabase, disconnectDatabase } from './config/database';
import { setupCronJobs, setCronServices } from './utils/cronjobs';
import { connectRedis } from './config/redis'; 
import {
  NaverAuthService,
  NaverProductService,
  NaverOrderService
} from './services/naver';
import { 
  ShopifyBulkService,
  ShopifyGraphQLService 
} from './services/shopify';
import { SyncService } from './services/sync';
import { ExchangeRateService } from './services/exchangeRate';  

const PORT = parseInt(process.env['PORT'] || '3000', 10);

async function startServer() {
  try {
    // 데이터베이스 연결
    await connectDatabase();
    
    // Redis 클라이언트 초기화
    const redis = connectRedis();
    
    // 서비스 인스턴스 생성 (의존성 주입)
    const naverAuthService = new NaverAuthService(redis);
    const naverProductService = new NaverProductService(naverAuthService);
    const naverOrderService = new NaverOrderService(naverAuthService);
    const shopifyBulkService = new ShopifyBulkService();
    const shopifyGraphQLService = new ShopifyGraphQLService();
    
    // SyncService에 모든 필요한 의존성 전달
    const syncService = new SyncService(
      naverProductService,
      naverOrderService,
      shopifyBulkService,
      shopifyGraphQLService,
      redis
    );
    
    const exchangeRateService = new ExchangeRateService(redis);

    // 크론 작업에 서비스 전달
    setCronServices({
      syncService,
      exchangeRateService
    });

    // 앱 인스턴스 생성 및 초기화
    const app = new App(redis);
    await app.initialize();
    
    // 크론 작업 시작
    setupCronJobs();
    
    // 서버 시작
    app.listen(PORT);

    // Graceful shutdown 처리
    const gracefulShutdown = async (signal: string) => {
      logger.info(`${signal} received, shutting down gracefully`);
      
      try {
        // 서버 종료
        app.close(() => {
          logger.info('HTTP server closed');
        });
        
        // 데이터베이스 연결 해제
        await disconnectDatabase();
        
        // Redis 연결 해제
        await redis.quit();
        
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

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// 서버 시작
startServer();