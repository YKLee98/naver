// packages/backend/src/server.ts
import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import dotenv from 'dotenv';
import path from 'path';
import http from 'http';
import { Server } from 'socket.io';
import { connectDB } from './config/database';
import { initializeRedis } from './config/redis';
import { setupRoutes } from './routes';
import { errorHandler } from './middlewares/error.middleware';
import { logger } from './utils/logger';
import { AppError } from './utils/errors';

// 환경 변수 로드
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

// Express 앱 초기화
const app: Application = express();
const server = http.createServer(app);

// 포트 설정
const PORT = process.env.PORT || 3000;
const WS_PORT = process.env.WS_PORT || 3001;

// WebSocket 설정
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:5173'],
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// 미들웨어 설정
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:5173'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 로깅 미들웨어
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// 간단한 요청 로깅
app.use((req: Request, res: Response, next: NextFunction) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('user-agent'),
    body: req.body,
    query: req.query,
    params: req.params
  });
  next();
});

// 기본 헬스 체크
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    uptime: process.uptime()
  });
});

// API 라우트 설정
const apiPrefix = process.env.API_PREFIX || '/api/v1';
const routes = setupRoutes();
app.use(apiPrefix, routes);

// 404 처리
app.use((req: Request, res: Response) => {
  logger.warn(`Route not found: ${req.method} ${req.path}`);
  res.status(404).json({
    success: false,
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: `Route ${req.path} not found`
    }
  });
});

// 에러 핸들러
app.use(errorHandler);

// WebSocket 이벤트 핸들러
io.on('connection', (socket) => {
  logger.info('New WebSocket connection:', socket.id);

  socket.on('join', (room) => {
    socket.join(room);
    logger.info(`Socket ${socket.id} joined room: ${room}`);
  });

  socket.on('leave', (room) => {
    socket.leave(room);
    logger.info(`Socket ${socket.id} left room: ${room}`);
  });

  socket.on('disconnect', () => {
    logger.info('Socket disconnected:', socket.id);
  });
});

// 서버 시작
async function startServer() {
  try {
    // MongoDB 연결
    await connectDB();
    logger.info('MongoDB connected');

    // Redis 초기화
    await initializeRedis();
    logger.info('Redis initialized');

    // 스케줄 작업 초기화 (프로덕션 환경에서만)
    if (process.env.NODE_ENV === 'production') {
      try {
        const { initializeScheduledJobs } = require('./jobs');
        initializeScheduledJobs();
        logger.info('Scheduled jobs initialized');
      } catch (error) {
        logger.warn('Scheduled jobs not available');
      }
    }

    // Express 서버 시작
    app.listen(PORT, () => {
      logger.info(`🚀 Server is running on port ${PORT}`);
      logger.info(`🌍 Environment: ${process.env.NODE_ENV}`);
      logger.info(`📍 API Endpoint: http://localhost:${PORT}${apiPrefix}`);
      logger.info(`💡 Health Check: http://localhost:${PORT}/health`);
      logger.info(`📝 Dashboard Stats: http://localhost:${PORT}${apiPrefix}/dashboard/stats`);
      logger.info(`🔐 Login Endpoint: http://localhost:${PORT}${apiPrefix}/auth/login`);
    });

    // WebSocket 서버 시작 (별도 포트)
    const wsServer = http.createServer();
    const wsIo = new Server(wsServer, {
      cors: {
        origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:5173'],
        methods: ['GET', 'POST'],
        credentials: true
      }
    });

    wsIo.on('connection', (socket) => {
      logger.info('New WebSocket connection on dedicated port:', socket.id);
      
      socket.on('join', (room) => {
        socket.join(room);
        logger.info(`Socket ${socket.id} joined room: ${room}`);
      });

      socket.on('disconnect', () => {
        logger.info('Socket disconnected:', socket.id);
      });
    });

    wsServer.listen(WS_PORT, () => {
      logger.info(`🔌 WebSocket server is running on port ${WS_PORT}`);
    });

    // Export for use in other modules
    (global as any).io = wsIo;

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  logger.info('SIGINT signal received: closing HTTP server');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

// 처리되지 않은 Promise rejection 핸들링
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// 처리되지 않은 예외 핸들링
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// 서버 시작
startServer();