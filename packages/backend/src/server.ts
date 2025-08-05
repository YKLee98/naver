// packages/backend/src/server.ts
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { connectDatabase } from './config/database';
import { initializeRedis } from './config/redis';
import { errorMiddleware } from './middlewares/error.middleware';
import { logger } from './utils/logger';
import { setupCronJobs } from './utils/cronjobs';
import { initializeWebSocket } from './websocket';
import config from './config';

// Initialize Express app
const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: config.corsOrigin,
    credentials: true
  }
});

// Global middlewares
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: config.corsOrigin,
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Request logging
app.use(morgan('combined', {
  stream: {
    write: (message: string) => logger.info(message.trim())
  }
}));

// Initialize services
async function initializeApp() {
  try {
    // Connect to MongoDB
    await connectDatabase();

    // Initialize Redis - 라우터 설정 전에 실행
    await initializeRedis();

    // API Routes - 동적 import로 변경
    const { setupRoutes } = await import('./routes');
    const routes = setupRoutes();
    app.use('/api/v1', routes);

    // Error handler
    app.use(errorMiddleware);

    // 404 handler
    app.use((req, res) => {
      res.status(404).json({
        success: false,
        error: {
          message: 'Route not found',
          path: req.path
        }
      });
    });

    // Initialize WebSocket
    if (initializeWebSocket) {
      initializeWebSocket(io);
    }

    // Setup cron jobs
    if (setupCronJobs) {
      setupCronJobs();
    }

    logger.info('App initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize app:', error);
    process.exit(1);
  }
}

// Start server
async function startServer() {
  await initializeApp();

  httpServer.listen(config.port, () => {
    logger.info(`🚀 Server is running on port ${config.port}`);
    logger.info(`🌍 Environment: ${config.env}`);
    logger.info(`📍 API Endpoint: http://localhost:${config.port}/api/v1`);
  });

  // WebSocket server
  if (config.wsPort) {
    io.listen(config.wsPort);
    logger.info(`🔌 WebSocket server is running on port ${config.wsPort}`);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (err: Error) => {
  logger.error('Unhandled Promise Rejection:', err);
  // Close server & exit process
  httpServer.close(() => process.exit(1));
});

// Handle uncaught exceptions
process.on('uncaughtException', (err: Error) => {
  logger.error('Uncaught Exception:', err);
  // Close server & exit process
  httpServer.close(() => process.exit(1));
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  httpServer.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

startServer();