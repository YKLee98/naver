// packages/backend/src/server.ts
import 'dotenv/config';
import { createServer } from 'http';
import cluster from 'cluster';
import os from 'os';
import { App } from './app.js';
import { logger } from './utils/logger.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { initializeRedis, closeRedis } from './config/redis.js';
import { setupCronJobs, stopCronJobs } from './utils/cronjobs.js';
import { validateConfig } from './config/index.js';
import { ServiceContainer } from './services/ServiceContainer.js';
import { performHealthCheck } from './utils/healthcheck.js';

const PORT = parseInt(process.env.PORT || '3000', 10);
const WS_PORT = parseInt(process.env.WS_PORT || '3001', 10);
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const ENABLE_CLUSTERING = process.env.ENABLE_CLUSTERING === 'true';
const WORKER_COUNT = parseInt(process.env.WORKER_COUNT || String(os.cpus().length), 10);

// 클러스터링 설정 (프로덕션 환경)
if (IS_PRODUCTION && ENABLE_CLUSTERING && cluster.isPrimary) {
  logger.info(`Master process ${process.pid} is running`);
  logger.info(`Starting ${WORKER_COUNT} workers...`);

  // 워커 프로세스 생성
  for (let i = 0; i < WORKER_COUNT; i++) {
    cluster.fork();
  }

  // 워커 재시작 처리
  cluster.on('exit', (worker, code, signal) => {
    logger.error(`Worker ${worker.process.pid} died (${signal || code}). Restarting...`);
    cluster.fork();
  });

  // 마스터 프로세스 health check
  setInterval(async () => {
    try {
      const health = await performHealthCheck();
      if (!health.healthy) {
        logger.warn('Health check failed:', health);
      }
    } catch (error) {
      logger.error('Health check error:', error);
    }
  }, 30000); // 30초마다 체크

} else {
  // 워커 프로세스 또는 단일 프로세스 모드
  startServer().catch(error => {
    logger.error('Failed to start server:', error);
    process.exit(1);
  });
}

async function startServer() {
  const startTime = Date.now();
  
  try {
    // 1. 설정 검증
    logger.info('🔍 Validating configuration...');
    validateConfig();
    
    // 2. 데이터베이스 연결
    logger.info('🔌 Connecting to MongoDB...');
    await connectDatabase();
    
    // 3. Redis 초기화
    logger.info('🔌 Initializing Redis...');
    const redis = await initializeRedis();
    
    // 4. 서비스 컨테이너 초기화
    logger.info('📦 Initializing services...');
    const services = await ServiceContainer.initialize(redis);
    
    // 5. Express 앱 초기화
    logger.info('🚀 Initializing Express app...');
    const app = new App(services);
    await app.initialize();
    
    // 6. HTTP 서버 생성
    const httpServer = createServer(app.getApp());
    
    // 7. WebSocket 서버 초기화 (필요한 경우)
    if (process.env.ENABLE_WEBSOCKET === 'true') {
      logger.info('🔌 Initializing WebSocket server...');
      await app.initializeWebSocket(httpServer);
    }
    
    // 8. 크론 작업 설정 (워커 프로세스 하나에서만)
    if (!cluster.isWorker || cluster.worker?.id === 1) {
      logger.info('⏰ Setting up cron jobs...');
      setupCronJobs(services);
    }
    
    // 9. 서버 시작
    await new Promise<void>((resolve, reject) => {
      httpServer.listen(PORT, () => {
        const elapsed = Date.now() - startTime;
        logger.info(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║   🚀 Hallyu ERP Backend Server Started Successfully! 🚀   ║
║                                                            ║
╠════════════════════════════════════════════════════════════╣
║   Environment : ${process.env.NODE_ENV?.padEnd(42)}║
║   Port        : ${String(PORT).padEnd(42)}║
║   WebSocket   : ${String(WS_PORT).padEnd(42)}║
║   Process ID  : ${String(process.pid).padEnd(42)}║
║   Worker ID   : ${String(cluster.worker?.id || 'master').padEnd(42)}║
║   Start Time  : ${new Date().toISOString().padEnd(42)}║
║   Boot Time   : ${String(elapsed + 'ms').padEnd(42)}║
║                                                            ║
╠════════════════════════════════════════════════════════════╣
║   API URL     : http://localhost:${PORT}/api/v1          ║
║   Health      : http://localhost:${PORT}/health          ║
║   Metrics     : http://localhost:${PORT}/metrics         ║
║   Swagger     : http://localhost:${PORT}/api-docs        ║
╚════════════════════════════════════════════════════════════╝
        `);
        resolve();
      });

      httpServer.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EADDRINUSE') {
          logger.error(`Port ${PORT} is already in use`);
        } else if (error.code === 'EACCES') {
          logger.error(`Port ${PORT} requires elevated privileges`);
        } else {
          logger.error('Server error:', error);
        }
        reject(error);
      });
    });
    
    // Graceful shutdown 설정
    setupGracefulShutdown(httpServer, services);
    
    // 예외 처리 설정
    setupExceptionHandlers();
    
  } catch (error) {
    logger.error('Failed to start server:', error);
    throw error;
  }
}

function setupGracefulShutdown(server: any, services: ServiceContainer) {
  let isShuttingDown = false;
  
  const shutdown = async (signal: string) => {
    if (isShuttingDown) {
      logger.warn('Shutdown already in progress...');
      return;
    }
    
    isShuttingDown = true;
    logger.info(`\n📍 ${signal} received, starting graceful shutdown...`);
    
    const shutdownTimeout = setTimeout(() => {
      logger.error('Forcefully shutting down after timeout');
      process.exit(1);
    }, 30000); // 30초 타임아웃
    
    try {
      // 1. 새로운 연결 거부
      logger.info('🚫 Stopping accepting new connections...');
      server.close();
      
      // 2. 크론 작업 중지
      logger.info('⏰ Stopping cron jobs...');
      await stopCronJobs();
      
      // 3. 서비스 정리
      logger.info('📦 Cleaning up services...');
      await services.cleanup();
      
      // 4. 활성 연결 종료 대기
      logger.info('⏳ Waiting for active connections to close...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // 5. Redis 연결 종료
      logger.info('🔌 Closing Redis connection...');
      await closeRedis();
      
      // 6. 데이터베이스 연결 종료
      logger.info('🔌 Closing database connection...');
      await disconnectDatabase();
      
      clearTimeout(shutdownTimeout);
      logger.info('✅ Graceful shutdown completed');
      process.exit(0);
      
    } catch (error) {
      logger.error('Error during graceful shutdown:', error);
      clearTimeout(shutdownTimeout);
      process.exit(1);
    }
  };
  
  // 시그널 핸들러 등록
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGUSR2', () => shutdown('SIGUSR2')); // nodemon restart
}

function setupExceptionHandlers() {
  // Uncaught Exception Handler
  process.on('uncaughtException', (error: Error) => {
    logger.error('🔥 Uncaught Exception:', error);
    
    // 로그 플러시 후 종료
    setTimeout(() => {
      process.exit(1);
    }, 1000);
  });
  
  // Unhandled Rejection Handler
  process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    logger.error('🔥 Unhandled Rejection at:', promise, 'reason:', reason);
    
    // 프로덕션에서는 종료, 개발에서는 계속 실행
    if (IS_PRODUCTION) {
      setTimeout(() => {
        process.exit(1);
      }, 1000);
    }
  });
  
  // Warning Handler
  process.on('warning', (warning: Error) => {
    logger.warn('⚠️ Node.js Warning:', warning);
  });
  
  // 메모리 사용량 모니터링
  setInterval(() => {
    const memUsage = process.memoryUsage();
    const formatMemory = (bytes: number) => (bytes / 1024 / 1024).toFixed(2) + ' MB';
    
    logger.debug('Memory Usage:', {
      rss: formatMemory(memUsage.rss),
      heapTotal: formatMemory(memUsage.heapTotal),
      heapUsed: formatMemory(memUsage.heapUsed),
      external: formatMemory(memUsage.external),
      arrayBuffers: formatMemory(memUsage.arrayBuffers)
    });
    
    // 메모리 임계값 체크 (1GB)
    if (memUsage.heapUsed > 1024 * 1024 * 1024) {
      logger.warn('⚠️ High memory usage detected:', formatMemory(memUsage.heapUsed));
    }
  }, 60000); // 1분마다 체크
}

// PM2 graceful reload 지원
if (process.env.PM2_HOME) {
  process.on('message', (msg) => {
    if (msg === 'shutdown') {
      logger.info('PM2 shutdown signal received');
      process.emit('SIGTERM');
    }
  });
}