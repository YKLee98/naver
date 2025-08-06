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
    // Connect to MongoDB - 개발 환경에서는 선택적으로
    if (config.env !== 'development' || process.env.MONGODB_URI) {
      try {
        await connectDatabase();
        logger.info('MongoDB connected successfully');
      } catch (dbError) {
        logger.warn('MongoDB connection failed, continuing without database:', dbError);
      }
    }

    // Initialize Redis - 개발 환경에서는 선택적으로
    if (config.env !== 'development' || process.env.REDIS_URL) {
      try {
        await initializeRedis();
        logger.info('Redis connected successfully');
      } catch (redisError) {
        logger.warn('Redis connection failed, continuing without cache:', redisError);
      }
    }

    // Health check route (always available)
    app.get('/health', (req, res) => {
      res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        environment: config.env 
      });
    });

    app.get('/api/v1/health', (req, res) => {
      res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        environment: config.env 
      });
    });

    // API Routes - 안전한 동적 import
    try {
      const routesModule = await import('./routes');
      
      // setupRoutes 함수가 있는지 확인
      if (routesModule.setupRoutes && typeof routesModule.setupRoutes === 'function') {
        const routes = routesModule.setupRoutes();
        app.use('/api/v1', routes);
        logger.info('API routes loaded successfully');
      } else {
        // setupRoutes가 없으면 기본 라우트 생성
        logger.warn('setupRoutes function not found, creating basic routes');
        createBasicRoutes();
      }
    } catch (routeError) {
      logger.error('Failed to load routes module:', routeError);
      // 라우트 로딩 실패시 기본 라우트 생성
      createBasicRoutes();
    }

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

    // Initialize WebSocket - 선택적
    try {
      if (initializeWebSocket && typeof initializeWebSocket === 'function') {
        initializeWebSocket(io);
        logger.info('WebSocket initialized successfully');
      }
    } catch (wsError) {
      logger.warn('WebSocket initialization failed:', wsError);
    }

    // Setup cron jobs - 선택적
    try {
      if (setupCronJobs && typeof setupCronJobs === 'function') {
        setupCronJobs();
        logger.info('Cron jobs initialized successfully');
      }
    } catch (cronError) {
      logger.warn('Cron jobs initialization failed:', cronError);
    }

    logger.info('App initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize app:', error);
    
    // 개발 환경에서는 기본 라우트로 계속 실행
    if (config.env === 'development') {
      logger.info('Running in development mode with minimal setup');
      createBasicRoutes();
    } else {
      process.exit(1);
    }
  }
}

// 기본 라우트 생성 함수
function createBasicRoutes() {
  const router = express.Router();

  // Dashboard routes
  router.get('/dashboard/stats', (req, res) => {
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
      syncStatus: {
        synced: 100,
        pending: 30,
        error: 20
      },
      inventoryStatus: {
        inStock: 90,
        lowStock: 20,
        outOfStock: 10
      }
    });
  });

  // Dashboard statistics (alias for stats)
  router.get('/dashboard/statistics', (req, res) => {
    res.json({
      success: true,
      data: {
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
        revenue: {
          today: 1250000,
          week: 8750000,
          month: 35000000
        },
        products: {
          total: 150,
          active: 120,
          inactive: 30
        },
        syncStatus: {
          lastSync: new Date(Date.now() - 3600000).toISOString(),
          nextSync: new Date(Date.now() + 3600000).toISOString(),
          status: 'success'
        }
      }
    });
  });

  // Dashboard activities
  router.get('/dashboard/activities', (req, res) => {
    res.json({
      success: true,
      data: [
        {
          _id: '1',
          id: '1',
          type: 'sync',
          action: '재고 동기화 완료',
          details: '50개 상품 업데이트됨',
          status: 'success',
          createdAt: new Date().toISOString(),
          timestamp: new Date().toISOString()
        },
        {
          _id: '2',
          id: '2',
          type: 'price',
          action: '가격 업데이트',
          details: '환율 변경 적용됨',
          status: 'success',
          createdAt: new Date(Date.now() - 3600000).toISOString(),
          timestamp: new Date(Date.now() - 3600000).toISOString()
        },
        {
          _id: '3',
          id: '3',
          type: 'order',
          action: '새 주문 접수',
          details: '주문번호: ORD-2025-003',
          status: 'pending',
          createdAt: new Date(Date.now() - 7200000).toISOString(),
          timestamp: new Date(Date.now() - 7200000).toISOString()
        }
      ]
    });
  });

  // Dashboard activity (singular - alias)
  router.get('/dashboard/activity', (req, res) => {
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

  // Dashboard charts - price
  router.get('/dashboard/charts/price', (req, res) => {
    const { period = 'day' } = req.query;
    const dataPoints = period === 'day' ? 24 : period === 'week' ? 7 : 30;
    
    const chartData = Array.from({ length: dataPoints }, (_, i) => ({
      label: period === 'day' ? `${i}시` : period === 'week' ? `Day ${i+1}` : `${i+1}일`,
      value: 45000 + Math.random() * 10000,
      date: new Date(Date.now() - (i * 3600000)).toISOString()
    }));

    res.json({
      success: true,
      data: chartData,
      period,
      summary: {
        average: 47500,
        min: 42000,
        max: 52000,
        trend: 'up'
      }
    });
  });

  // Dashboard charts - inventory
  router.get('/dashboard/charts/inventory', (req, res) => {
    res.json({
      success: true,
      data: {
        labels: ['재고 있음', '재고 부족', '품절'],
        datasets: [{
          data: [90, 20, 10],
          backgroundColor: ['#4caf50', '#ff9800', '#f44336']
        }]
      },
      summary: {
        total: 120,
        inStock: 90,
        lowStock: 20,
        outOfStock: 10
      }
    });
  });

  // Products
  router.get('/products', (req, res) => {
    const mockProducts = [
      {
        id: '1',
        _id: '1',
        sku: 'PROD-001',
        name: '샘플 상품 1',
        price: 45000,
        inventory: 100,
        status: 'active'
      },
      {
        id: '2',
        _id: '2',
        sku: 'PROD-002',
        name: '샘플 상품 2',
        price: 32000,
        inventory: 50,
        status: 'active'
      }
    ];
    
    res.json({ 
      data: mockProducts, 
      total: mockProducts.length, 
      page: 1, 
      totalPages: 1 
    });
  });

  // Shopify Products Search
  router.get('/products/search/shopify', (req, res) => {
    const { vendor, search, limit = 20 } = req.query;
    
    // Mock Shopify products
    const mockShopifyProducts = [
      {
        id: 'gid://shopify/Product/8001234567890',
        shopifyId: '8001234567890',
        title: '[NCT DREAM] Hot Sauce - 정규 1집 앨범',
        handle: 'nct-dream-hot-sauce-album',
        vendor: 'album',
        productType: 'Album',
        status: 'ACTIVE',
        images: [
          {
            url: 'https://cdn.shopify.com/mock-image-1.jpg',
            altText: 'Album Cover'
          }
        ],
        variants: [
          {
            id: 'gid://shopify/ProductVariant/44001234567890',
            variantId: '44001234567890',
            title: 'Photo Book Ver.',
            sku: 'NCT-HS-PB-001',
            price: '25.00',
            inventoryQuantity: 50,
            barcode: '8809633189777'
          },
          {
            id: 'gid://shopify/ProductVariant/44001234567891',
            variantId: '44001234567891',
            title: 'Jewel Case Ver.',
            sku: 'NCT-HS-JC-001',
            price: '20.00',
            inventoryQuantity: 30,
            barcode: '8809633189778'
          }
        ],
        tags: ['K-pop', 'NCT', 'Album', 'New Release'],
        createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 'gid://shopify/Product/8001234567891',
        shopifyId: '8001234567891',
        title: '[SEVENTEEN] Face the Sun - 정규 4집',
        handle: 'seventeen-face-the-sun',
        vendor: 'album',
        productType: 'Album',
        status: 'ACTIVE',
        images: [
          {
            url: 'https://cdn.shopify.com/mock-image-2.jpg',
            altText: 'Album Cover'
          }
        ],
        variants: [
          {
            id: 'gid://shopify/ProductVariant/44001234567892',
            variantId: '44001234567892',
            title: 'Weverse Album Ver.',
            sku: 'SVT-FTS-WV-001',
            price: '30.00',
            inventoryQuantity: 100,
            barcode: '8809633189779'
          }
        ],
        tags: ['K-pop', 'SEVENTEEN', 'Album'],
        createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 'gid://shopify/Product/8001234567892',
        shopifyId: '8001234567892',
        title: '[STRAY KIDS] ODDINARY - 미니 6집',
        handle: 'stray-kids-oddinary',
        vendor: 'album',
        productType: 'Album',
        status: 'ACTIVE',
        images: [
          {
            url: 'https://cdn.shopify.com/mock-image-3.jpg',
            altText: 'Album Cover'
          }
        ],
        variants: [
          {
            id: 'gid://shopify/ProductVariant/44001234567893',
            variantId: '44001234567893',
            title: 'Standard Ver.',
            sku: 'SKZ-ODD-STD-001',
            price: '22.00',
            inventoryQuantity: 75,
            barcode: '8809633189780'
          },
          {
            id: 'gid://shopify/ProductVariant/44001234567894',
            variantId: '44001234567894',
            title: 'Limited Ver.',
            sku: 'SKZ-ODD-LTD-001',
            price: '35.00',
            inventoryQuantity: 25,
            barcode: '8809633189781'
          }
        ],
        tags: ['K-pop', 'Stray Kids', 'Album'],
        createdAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];

    // Filter by vendor if provided
    let filteredProducts = mockShopifyProducts;
    if (vendor && vendor !== 'all') {
      filteredProducts = filteredProducts.filter(p => 
        p.vendor.toLowerCase().includes(vendor.toString().toLowerCase())
      );
    }

    // Filter by search term if provided
    if (search) {
      const searchTerm = search.toString().toLowerCase();
      filteredProducts = filteredProducts.filter(p => 
        p.title.toLowerCase().includes(searchTerm) ||
        p.handle.toLowerCase().includes(searchTerm) ||
        p.variants.some(v => 
          v.sku.toLowerCase().includes(searchTerm) ||
          v.barcode?.toLowerCase().includes(searchTerm)
        )
      );
    }

    // Apply limit
    const limitNum = parseInt(limit.toString()) || 20;
    filteredProducts = filteredProducts.slice(0, limitNum);

    res.json({
      success: true,
      data: filteredProducts,
      total: filteredProducts.length,
      hasMore: false
    });
  });

  // Naver Products Search
  router.get('/products/search/naver', (req, res) => {
    const { search, category, limit = 20 } = req.query;
    
    // Mock Naver products
    const mockNaverProducts = [
      {
        id: 'NAVER-001',
        productId: '12345678',
        channelProductNo: '12345678',
        name: 'NCT DREAM - Hot Sauce 정규 1집 (포토북 버전)',
        salePrice: 28000,
        stockQuantity: 45,
        category: {
          categoryId: '50000437',
          name: '음반/DVD'
        },
        statusType: 'SALE',
        images: [
          {
            url: 'https://shop-phinf.pstatic.net/mock-1.jpg',
            order: 0
          }
        ],
        attributes: [
          { name: '아티스트', value: 'NCT DREAM' },
          { name: '발매일', value: '2021-05-10' }
        ]
      },
      {
        id: 'NAVER-002',
        productId: '12345679',
        channelProductNo: '12345679',
        name: 'SEVENTEEN - Face the Sun 정규 4집',
        salePrice: 32000,
        stockQuantity: 80,
        category: {
          categoryId: '50000437',
          name: '음반/DVD'
        },
        statusType: 'SALE',
        images: [
          {
            url: 'https://shop-phinf.pstatic.net/mock-2.jpg',
            order: 0
          }
        ],
        attributes: [
          { name: '아티스트', value: 'SEVENTEEN' },
          { name: '발매일', value: '2022-05-27' }
        ]
      },
      {
        id: 'NAVER-003',
        productId: '12345680',
        channelProductNo: '12345680',
        name: 'Stray Kids - ODDINARY 미니 6집',
        salePrice: 24000,
        stockQuantity: 60,
        category: {
          categoryId: '50000437',
          name: '음반/DVD'
        },
        statusType: 'SALE',
        images: [
          {
            url: 'https://shop-phinf.pstatic.net/mock-3.jpg',
            order: 0
          }
        ],
        attributes: [
          { name: '아티스트', value: 'Stray Kids' },
          { name: '발매일', value: '2022-03-18' }
        ]
      }
    ];

    // Filter by search term if provided
    let filteredProducts = mockNaverProducts;
    if (search) {
      const searchTerm = search.toString().toLowerCase();
      filteredProducts = filteredProducts.filter(p => 
        p.name.toLowerCase().includes(searchTerm) ||
        p.productId.includes(searchTerm)
      );
    }

    // Apply limit
    const limitNum = parseInt(limit.toString()) || 20;
    filteredProducts = filteredProducts.slice(0, limitNum);

    res.json({
      success: true,
      data: filteredProducts,
      total: filteredProducts.length
    });
  });

  // Inventory
  router.get('/inventory/status', (req, res) => {
    const mockInventory = [
      {
        id: '1',
        _id: '1',
        sku: 'PROD-001',
        productName: '샘플 상품 1',
        currentStock: 100,
        lowStockThreshold: 20,
        status: 'in_stock',
        lastUpdated: new Date().toISOString(),
        updatedAt: new Date().toISOString() // 추가
      },
      {
        id: '2',
        _id: '2',
        sku: 'PROD-002',
        productName: '샘플 상품 2',
        currentStock: 15,
        lowStockThreshold: 20,
        status: 'low_stock',
        lastUpdated: new Date().toISOString(),
        updatedAt: new Date().toISOString() // 추가
      }
    ];
    
    res.json({ 
      success: true, // 추가
      data: mockInventory, 
      total: mockInventory.length, 
      page: 1, 
      totalPages: 1 
    });
  });

  // Mappings
  router.get('/mappings', (req, res) => {
    const mockMappings = [
      {
        id: '1',
        _id: '1',
        sku: 'PROD-001',
        naverProductId: 'NAVER-001',
        shopifyProductId: 'SHOPIFY-001',
        productName: '샘플 상품 1',
        isActive: true,
        syncStatus: 'synced',
        lastSyncedAt: new Date().toISOString()
      },
      {
        id: '2',
        _id: '2',
        sku: 'PROD-002',
        naverProductId: 'NAVER-002',
        shopifyProductId: 'SHOPIFY-002',
        productName: '샘플 상품 2',
        isActive: true,
        syncStatus: 'pending',
        lastSyncedAt: new Date(Date.now() - 86400000).toISOString()
      }
    ];
    
    res.json({ 
      data: mockMappings, 
      total: mockMappings.length, 
      page: 1, 
      totalPages: 1 
    });
  });

  // Settings
  router.get('/settings', (req, res) => {
    res.json({
      syncInterval: 60,
      autoSync: false,
      lowStockThreshold: 10,
      exchangeRateMode: 'api',
      customExchangeRate: 1300,
      defaultMargin: 15,
      notificationEmail: '',
      webhookUrl: '',
      timezone: 'Asia/Seoul'
    });
  });

  // Price history
  router.get('/prices/history', (req, res) => {
    const { period = '7d' } = req.query;
    
    // Mock 데이터 생성 - 기간에 따라 다른 데이터 포인트 수
    const dataPoints = period === '24h' ? 24 : period === '7d' ? 7 : 30;
    const now = Date.now();
    const interval = period === '24h' ? 3600000 : 86400000; // 1시간 또는 1일
    
    const history = Array.from({ length: dataPoints }, (_, i) => ({
      id: `price-${i + 1}`, // 고유 ID 추가
      _id: `price-${i + 1}`, // MongoDB 스타일 ID도 추가
      date: new Date(now - (interval * (dataPoints - i - 1))).toISOString(),
      avgPrice: 45000 + Math.random() * 5000,
      minPrice: 42000 + Math.random() * 3000,
      maxPrice: 48000 + Math.random() * 3000,
      productCount: Math.floor(100 + Math.random() * 50)
    }));

    res.json({
      success: true,
      data: history,
      period,
      summary: {
        currentAvg: 47500,
        previousAvg: 46800,
        changePercent: 1.5,
        trend: 'up'
      }
    });
  });

  // Exchange rates - current
  router.get('/exchange-rates/current', (req, res) => {
    res.json({
      success: true,
      data: {
        USD: {
          KRW: 1320.50,
          rate: 1320.50,
          change: 5.20,
          changePercent: 0.40,
          updatedAt: new Date().toISOString()
        },
        EUR: {
          KRW: 1435.30,
          rate: 1435.30,
          change: -2.10,
          changePercent: -0.15,
          updatedAt: new Date().toISOString()
        },
        JPY: {
          KRW: 8.85,
          rate: 8.85,
          change: 0.02,
          changePercent: 0.23,
          updatedAt: new Date().toISOString()
        }
      },
      lastUpdated: new Date().toISOString(),
      source: 'mock'
    });
  });

  // Exchange rates - history
  router.get('/exchange-rates/history', (req, res) => {
    const { currency = 'USD', period = '7d' } = req.query;
    
    const dataPoints = period === '24h' ? 24 : period === '7d' ? 7 : 30;
    const now = Date.now();
    const interval = period === '24h' ? 3600000 : 86400000;
    
    const history = Array.from({ length: dataPoints }, (_, i) => ({
      id: `rate-${i + 1}`, // 고유 ID 추가
      _id: `rate-${i + 1}`, // MongoDB 스타일 ID도 추가
      date: new Date(now - (interval * (dataPoints - i - 1))).toISOString(),
      rate: 1300 + Math.random() * 40,
      currency
    }));

    res.json({
      success: true,
      data: history,
      currency,
      period
    });
  });

  // Sync history
  router.get('/sync/history', (req, res) => {
    const history = [
      {
        _id: '1',
        id: '1',
        type: 'manual',
        status: 'completed',
        startedAt: new Date(Date.now() - 7200000).toISOString(),
        completedAt: new Date(Date.now() - 7000000).toISOString(),
        duration: 200000,
        stats: {
          total: 150,
          success: 145,
          failed: 5,
          skipped: 0
        },
        error: null
      },
      {
        _id: '2',
        id: '2',
        type: 'scheduled',
        status: 'completed',
        startedAt: new Date(Date.now() - 14400000).toISOString(),
        completedAt: new Date(Date.now() - 14200000).toISOString(),
        duration: 200000,
        stats: {
          total: 150,
          success: 150,
          failed: 0,
          skipped: 0
        },
        error: null
      }
    ];

    res.json({
      success: true,
      data: history,
      total: history.length,
      page: 1,
      totalPages: 1
    });
  });

  // Orders
  router.get('/orders', (req, res) => {
    const mockOrders = [
      {
        id: '1',
        _id: '1',
        orderNumber: 'ORD-2025-001',
        customerName: '홍길동',
        totalAmount: 125000,
        status: 'processing',
        createdAt: new Date().toISOString()
      },
      {
        id: '2',
        _id: '2',
        orderNumber: 'ORD-2025-002',
        customerName: '김철수',
        totalAmount: 89000,
        status: 'shipped',
        createdAt: new Date(Date.now() - 3600000).toISOString()
      }
    ];
    
    res.json({
      success: true,
      data: mockOrders,
      total: mockOrders.length,
      page: 1,
      totalPages: 1
    });
  });

  // Analytics
  router.get('/analytics/overview', (req, res) => {
    res.json({
      success: true,
      data: {
        revenue: {
          total: 15000000,
          growth: 12.5
        },
        orders: {
          total: 280,
          growth: 8.3
        },
        products: {
          total: 150,
          active: 120
        },
        customers: {
          total: 89,
          new: 12
        }
      }
    });
  });

  // Auth login (mock)
  router.post('/auth/login', (req, res) => {
    const { email } = req.body;
    res.json({
      success: true,
      data: {
        user: {
          id: '1',
          email: email || 'admin@example.com',
          name: '관리자',
          role: 'admin'
        },
        accessToken: 'mock-token-' + Date.now(),
        refreshToken: 'mock-refresh-token-' + Date.now()
      }
    });
  });

  // Auth check
  router.get('/auth/check', (req, res) => {
    res.json({
      success: true,
      data: {
        authenticated: true,
        user: {
          id: '1',
          email: 'admin@example.com',
          name: '관리자',
          role: 'admin'
        }
      }
    });
  });

  // Auth refresh
  router.post('/auth/refresh', (req, res) => {
    res.json({
      success: true,
      data: {
        accessToken: 'mock-token-' + Date.now(),
        refreshToken: 'mock-refresh-token-' + Date.now()
      }
    });
  });

  // Auth logout
  router.post('/auth/logout', (req, res) => {
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  });

  // User profile
  router.get('/users/me', (req, res) => {
    res.json({
      success: true,
      data: {
        id: '1',
        email: 'admin@example.com',
        name: '관리자',
        role: 'admin',
        createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        lastLogin: new Date().toISOString()
      }
    });
  });

  // Notifications
  router.get('/notifications', (req, res) => {
    res.json({
      success: true,
      data: [
        {
          _id: '1',
          id: '1',
          type: 'info',
          title: '동기화 완료',
          message: '재고 동기화가 성공적으로 완료되었습니다.',
          read: false,
          createdAt: new Date(Date.now() - 3600000).toISOString()
        },
        {
          _id: '2',
          id: '2',
          type: 'warning',
          title: '낮은 재고 경고',
          message: '5개 상품의 재고가 부족합니다.',
          read: false,
          createdAt: new Date(Date.now() - 7200000).toISOString()
        }
      ],
      unreadCount: 2,
      total: 2
    });
  });

  // System logs
  router.get('/logs', (req, res) => {
    res.json({
      success: true,
      data: [
        {
          _id: '1',
          level: 'info',
          category: 'sync',
          message: 'Sync completed successfully',
          timestamp: new Date(Date.now() - 1800000).toISOString()
        },
        {
          _id: '2',
          level: 'warning',
          category: 'inventory',
          message: 'Low stock detected',
          timestamp: new Date(Date.now() - 3600000).toISOString()
        }
      ],
      total: 2,
      page: 1,
      totalPages: 1
    });
  });

  app.use('/api/v1', router);
  logger.info('Basic routes created for development');
}

// Start server
async function startServer() {
  await initializeApp();

  const port = config.port || 3000;
  
  httpServer.listen(port, () => {
    logger.info(`🚀 Server is running on port ${port}`);
    logger.info(`🌍 Environment: ${config.env || 'development'}`);
    logger.info(`📍 API Endpoint: http://localhost:${port}/api/v1`);
    logger.info(`💡 Health Check: http://localhost:${port}/health`);
    
    if (config.env === 'development') {
      logger.info(`📝 Dashboard Stats: http://localhost:${port}/api/v1/dashboard/stats`);
      logger.info(`🔐 Login Endpoint: http://localhost:${port}/api/v1/auth/login`);
    }
  });

  // WebSocket server - 선택적
  if (config.wsPort && config.wsPort !== port) {
    try {
      io.listen(config.wsPort);
      logger.info(`🔌 WebSocket server is running on port ${config.wsPort}`);
    } catch (wsError) {
      logger.warn('Failed to start WebSocket server:', wsError);
    }
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (err: Error) => {
  logger.error('Unhandled Promise Rejection:', err);
  
  // 개발 환경에서는 서버를 종료하지 않음
  if (config.env !== 'development') {
    httpServer.close(() => process.exit(1));
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (err: Error) => {
  logger.error('Uncaught Exception:', err);
  
  // 개발 환경에서는 서버를 종료하지 않음
  if (config.env !== 'development') {
    httpServer.close(() => process.exit(1));
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  httpServer.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT signal received: closing HTTP server');
  httpServer.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

// Start the server
startServer().catch((error) => {
  logger.error('Failed to start server:', error);
  
  // 개발 환경에서는 기본 설정으로 재시도
  if (config.env === 'development') {
    logger.info('Attempting to start with minimal configuration...');
    
    // 최소한의 서버 시작
    const minimalPort = process.env.PORT || 3000;
    app.listen(minimalPort, () => {
      logger.info(`🚀 Minimal server running on port ${minimalPort}`);
    });
  } else {
    process.exit(1);
  }
});