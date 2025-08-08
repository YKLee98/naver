// packages/backend/src/server.ts
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import mongoose from 'mongoose';
import { initializeRedis, closeRedis } from './config/redis';
import { setupRoutes } from './routes';
import { errorHandler } from './middlewares/error.middleware';
import { requestLogger } from './middlewares/logger.middleware';
import { config } from './config';
import { logger } from './utils/logger';
import path from 'path';

// 환경 변수 로드
import * as dotenv from 'dotenv';
dotenv.config();

const app = express();
const httpServer = createServer(app);

// WebSocket 서버 설정
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  },
  path: '/socket.io',
  transports: ['websocket', 'polling'],
});

// 미들웨어 설정
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: false,
}));
app.use(compression());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(requestLogger);

// 정적 파일 제공
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.env,
  });
});

// API 라우트 설정
const apiRouter = setupRoutes(app);
app.use('/api/v1', apiRouter);

// 에러 핸들러 (반드시 마지막에 위치)
app.use(errorHandler);

// MongoDB 연결 함수
async function connectDatabase() {
  try {
    const mongoUri = config.mongodb?.uri || process.env.MONGODB_URI || 'mongodb://localhost:27017/ERP_NAVER';
    
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    } as any);
    
    logger.info('MongoDB connected successfully');
    logger.info(`MongoDB connected to ${mongoUri}`);
    
    // 연결 이벤트 리스너
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

// 서버 시작
async function startServer() {
  try {
    // MongoDB 연결
    await connectDatabase();
    logger.info('MongoDB connected');
    
    // Redis 연결 (실제 Redis 사용)
    try {
      await initializeRedis();
      logger.info('Redis initialized successfully');
    } catch (redisError) {
      logger.error('Redis initialization failed:', redisError);
      // Redis 연결 실패해도 서버는 계속 실행 (MockRedis로 대체됨)
      logger.warn('⚠️  Running with MockRedis - some features may be limited');
    }
    
    // HTTP 서버 시작
    const port = parseInt(process.env.PORT || '3000', 10);
    httpServer.listen(port, () => {
      logger.info(`🚀 Server is running on port ${port}`);
      logger.info(`🌍 Environment: ${config.env}`);
      logger.info(`📍 API Endpoint: http://localhost:${port}/api/v1`);
      logger.info(`💡 Health Check: http://localhost:${port}/health`);
      logger.info(`📝 Dashboard Stats: http://localhost:${port}/api/v1/dashboard/stats`);
      logger.info(`🔐 Login Endpoint: http://localhost:${port}/api/v1/auth/login`);
    });
    
    // WebSocket 서버 시작
    const wsPort = parseInt(process.env.WS_PORT || '3001', 10);
    const wsServer = createServer();
    const wsIo = new SocketIOServer(wsServer, {
      cors: {
        origin: process.env.CORS_ORIGIN || '*',
        credentials: true,
      },
    });
    
    // WebSocket 핸들러 설정
    wsIo.on('connection', (socket) => {
      logger.info('New WebSocket connection:', socket.id);
      
      socket.on('join', (room) => {
        socket.join(room);
        logger.info(`Socket ${socket.id} joined room: ${room}`);
      });

      socket.on('sync-update', (data) => {
        wsIo.to('admin').emit('sync-status', data);
      });

      socket.on('disconnect', () => {
        logger.info('Socket disconnected:', socket.id);
      });
    });
    
    wsServer.listen(wsPort, () => {
      logger.info(`🔌 WebSocket server is running on port ${wsPort}`);
    });
    
    // Graceful shutdown
    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);
    
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

async function gracefulShutdown() {
  logger.info('Graceful shutdown initiated...');
  
  try {
    // 새로운 연결 거부
    httpServer.close(() => {
      logger.info('HTTP server closed');
    });
    
    // WebSocket 연결 종료
    io.close(() => {
      logger.info('WebSocket server closed');
    });
    
    // Redis 연결 종료
    try {
      await closeRedis();
      logger.info('Redis connection closed');
    } catch (error) {
      logger.warn('Could not close Redis connection:', error);
    }
    
    // MongoDB 연결 종료
    await mongoose.connection.close();
    logger.info('MongoDB connection closed');
    
    logger.info('Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('Error during graceful shutdown:', error);
    process.exit(1);
  }
}

// 시작
startServer();