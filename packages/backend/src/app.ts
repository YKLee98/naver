// packages/backend/src/app.ts
import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import 'express-async-errors';

import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import { ServiceContainer } from './services/ServiceContainer.js';

export class App {
  private app: Application;
  private io?: any;
  private services: ServiceContainer;
  private isInitialized: boolean = false;

  constructor(services: ServiceContainer) {
    this.app = express();
    this.services = services;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      throw new Error('App is already initialized');
    }

    // Setup middlewares
    this.app.use(helmet());
    this.app.use(cors({
      origin: config.corsOrigin || '*',
      credentials: true,
    }));
    this.app.use(express.json({ limit: '50mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '50mb' }));
    this.app.use(compression());
    
    if (config.env !== 'test') {
      this.app.use(morgan('combined'));
    }

    // Setup routes
    const apiPrefix = config.apiPrefix || '/api/v1';
    
    // Health check
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      });
    });
    
    // API info
    this.app.get('/', (req: Request, res: Response) => {
      res.json({
        name: 'Hallyu ERP API',
        version: '1.0.0',
        environment: config.env,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      });
    });

    // Mock Dashboard Stats
    this.app.get(`${apiPrefix}/dashboard/stats`, (req: Request, res: Response) => {
      res.json({
        mappings: {
          total: 150,
          active: 120,
          pending: 20,
          failed: 10
        },
        orders: {
          today: 45,
          week: 280,
          month: 1250
        },
        totalProducts: 150,
        activeProducts: 120,
        totalSales: 85,
        syncStatus: {
          synced: 100,
          pending: 30,
          error: 20
        },
        inventoryStatus: {
          inStock: 90,
          lowStock: 20,
          outOfStock: 10
        },
        recentActivity: []
      });
    });

    // Mock Dashboard Activity
    this.app.get(`${apiPrefix}/dashboard/activity`, (req: Request, res: Response) => {
      res.json({
        data: [
          {
            _id: '1',
            id: '1',
            type: 'sync',
            action: '재고 동기화 완료',
            details: '50개 상품 업데이트됨',
            createdAt: new Date().toISOString(),
            timestamp: new Date().toISOString()
          },
          {
            _id: '2',
            id: '2',
            type: 'price',
            action: '가격 업데이트',
            details: '환율 변경 적용됨',
            createdAt: new Date(Date.now() - 3600000).toISOString(),
            timestamp: new Date(Date.now() - 3600000).toISOString()
          }
        ]
      });
    });

    // Mock Auth Login
    this.app.post(`${apiPrefix}/auth/login`, (req: Request, res: Response) => {
      const { email } = req.body;
      res.json({
        success: true,
        data: {
          user: {
            id: '1',
            email: email || 'admin@hallyu.com',
            name: '관리자',
            role: 'admin'
          },
          accessToken: 'mock-token-' + Date.now(),
          refreshToken: 'mock-refresh-token-' + Date.now()
        }
      });
    });

    // Other mock endpoints
    this.app.get(`${apiPrefix}/products`, (req: Request, res: Response) => {
      res.json({ data: [], total: 0, page: 1, totalPages: 0 });
    });

    this.app.get(`${apiPrefix}/inventory/status`, (req: Request, res: Response) => {
      res.json({ data: [], total: 0, page: 1, totalPages: 0 });
    });

    this.app.get(`${apiPrefix}/mappings`, (req: Request, res: Response) => {
      res.json({ data: [], total: 0, page: 1, totalPages: 0 });
    });

    this.app.get(`${apiPrefix}/settings`, (req: Request, res: Response) => {
      res.json([]);
    });

    // 404 Handler
    this.app.use((req: Request, res: Response) => {
      res.status(404).json({
        success: false,
        message: 'Resource not found',
        path: req.path,
      });
    });

    // Error Handler
    this.app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
      logger.error('Unhandled error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: config.isDevelopment ? error.message : undefined,
      });
    });

    this.isInitialized = true;
    logger.info('✅ Express app initialized successfully');
  }

  async initializeWebSocket(server: any): Promise<void> {
    try {
      const { Server } = await import('socket.io');
      this.io = new Server(server, {
        cors: {
          origin: config.corsOrigin || '*',
          credentials: true,
        },
      });

      this.io.on('connection', (socket: any) => {
        logger.info(`WebSocket client connected: ${socket.id}`);
        
        socket.on('disconnect', () => {
          logger.info(`WebSocket client disconnected: ${socket.id}`);
        });
      });

      this.services.setWebSocket(this.io);
      logger.info('✅ WebSocket server initialized');
    } catch (error) {
      logger.warn('WebSocket initialization skipped:', error);
    }
  }

  getApp(): Application {
    return this.app;
  }

  getIO(): any {
    return this.io;
  }
}