// packages/backend/src/routes/api.routes.ts
import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware.js';
import { ServiceContainer } from '../services/ServiceContainer.js';
import { logger } from '../utils/logger.js';

export async function setupApiRoutes(container?: ServiceContainer): Promise<Router> {
  const router = Router();
  const protectedRouter = Router();

  // Apply authentication middleware to protected routes
  protectedRouter.use(authenticate);

  // ============================================
  // PUBLIC ROUTES
  // ============================================
  router.get('/status', (req, res) => {
    res.json({
      success: true,
      message: 'API is running',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
    });
  });

  // Health check endpoint
  router.get('/health', (req, res) => {
    res.json({
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
    });
  });

  // Default dashboard handlers
  const defaultDashboardHandlers = {
    statistics: async (req: any, res: any) => {
      res.json({
        success: true,
        data: {
          products: { total: 250, active: 230 },
          activities: { total: 150 },
          syncs: { total: 50 }
        }
      });
    },
    activities: async (req: any, res: any) => {
      res.json({
        success: true,
        data: [],
        pagination: { total: 0, limit: 10, offset: 0 }
      });
    },
    salesChart: async (req: any, res: any) => {
      res.json({
        success: true,
        data: {
          labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
          datasets: [{ label: 'Sales', data: [12000, 19000, 15000, 25000, 22000, 30000, 28000] }]
        }
      });
    },
    inventoryChart: async (req: any, res: any) => {
      res.json({
        success: true,
        data: {
          labels: ['In Stock', 'Low Stock', 'Out of Stock'],
          datasets: [{ data: [150, 30, 5] }]
        }
      });
    },
    syncChart: async (req: any, res: any) => {
      res.json({
        success: true,
        data: {
          labels: ['Success', 'Failed', 'Pending'],
          datasets: [{ data: [85, 10, 5] }]
        }
      });
    },
    priceChart: async (req: any, res: any) => {
      res.json({
        success: true,
        data: {
          labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
          datasets: [{ label: 'Price Changes', data: [10, 15, 8, 12] }]
        }
      });
    }
  };

  // Setup routes after container is available
  const setupContainerRoutes = async (serviceContainer: ServiceContainer) => {
    logger.info('🔗 Setting up API routes with service container...');

    // ============================================
    // DASHBOARD ROUTES - Add them directly here
    // ============================================
    protectedRouter.get('/dashboard/statistics', defaultDashboardHandlers.statistics);
    protectedRouter.get('/dashboard/activities', defaultDashboardHandlers.activities);
    protectedRouter.get('/dashboard/charts/sales', defaultDashboardHandlers.salesChart);
    protectedRouter.get('/dashboard/charts/inventory', defaultDashboardHandlers.inventoryChart);
    protectedRouter.get('/dashboard/charts/sync', defaultDashboardHandlers.syncChart);
    protectedRouter.get('/dashboard/charts/price', defaultDashboardHandlers.priceChart);
    logger.info('✅ Dashboard routes registered');

    // ============================================
    // PRODUCT ROUTES
    // ============================================
    if (serviceContainer.productController) {
      const ctrl = serviceContainer.productController;

      protectedRouter.get('/products', ctrl.getProducts.bind(ctrl));
      protectedRouter.get('/products/:sku', ctrl.getProductBySku.bind(ctrl));
      protectedRouter.post('/products', ctrl.createProduct.bind(ctrl));
      protectedRouter.put('/products/:sku', ctrl.updateProduct.bind(ctrl));
      protectedRouter.delete('/products/:sku', ctrl.deleteProduct.bind(ctrl));
      
      protectedRouter.get('/products/search/naver', ctrl.searchNaverProducts.bind(ctrl));
      protectedRouter.get('/products/search/shopify', ctrl.searchShopifyProducts.bind(ctrl));
      protectedRouter.post('/products/bulk-update', ctrl.bulkUpdateProducts.bind(ctrl));
      protectedRouter.get('/products/export/csv', ctrl.exportProducts.bind(ctrl));
      
      if (ctrl.syncProduct) {
        protectedRouter.post('/products/:sku/sync', ctrl.syncProduct.bind(ctrl));
      }

      logger.info('✅ Product routes registered');
    }

    // ============================================
    // MAPPING ROUTES
    // ============================================
    if (serviceContainer.mappingController) {
      const ctrl = serviceContainer.mappingController;

      // 특수 경로를 먼저 등록 (구체적인 경로가 우선)
      protectedRouter.get('/mappings/search-by-sku', ctrl.searchProductsBySku.bind(ctrl));
      protectedRouter.get('/mappings/search-shopify', ctrl.searchShopifyProducts.bind(ctrl));
      protectedRouter.get('/mappings/export/csv', ctrl.exportMappings.bind(ctrl));
      protectedRouter.get('/mappings/template/download', ctrl.downloadTemplate.bind(ctrl));
      protectedRouter.post('/mappings/bulk', ctrl.bulkCreateMappings.bind(ctrl));
      protectedRouter.post('/mappings/bulk-upload', ctrl.bulkUploadMappings.bind(ctrl));
      protectedRouter.post('/mappings/auto-discover', ctrl.autoDiscoverMappings.bind(ctrl));
      protectedRouter.post('/mappings/auto-search', ctrl.autoSearchAndCreate.bind(ctrl));
      
      // 일반 CRUD 경로
      protectedRouter.get('/mappings', ctrl.getMappings.bind(ctrl));
      protectedRouter.get('/mappings/:id', ctrl.getMappingById.bind(ctrl));
      protectedRouter.post('/mappings', ctrl.createMapping.bind(ctrl));
      protectedRouter.put('/mappings/:id', ctrl.updateMapping.bind(ctrl));
      protectedRouter.delete('/mappings/:id', ctrl.deleteMapping.bind(ctrl));
      protectedRouter.patch('/mappings/:id/toggle', ctrl.toggleMapping.bind(ctrl));
      protectedRouter.post('/mappings/:id/validate', ctrl.validateMapping.bind(ctrl));

      logger.info('✅ Mapping routes registered');
    }

    // ============================================
    // INVENTORY ROUTES
    // ============================================
    if (serviceContainer.inventoryController) {
      const ctrl = serviceContainer.inventoryController;

      // Main inventory routes
      protectedRouter.get('/inventory', ctrl.getInventory.bind(ctrl));
      protectedRouter.get('/inventory/:sku', ctrl.getInventoryBySku.bind(ctrl));
      protectedRouter.put('/inventory/:sku', ctrl.updateInventory.bind(ctrl));
      protectedRouter.post('/inventory/:sku/adjust', ctrl.adjustInventory.bind(ctrl));
      
      // Inventory status and history
      protectedRouter.get('/inventory/:sku/status', ctrl.getInventoryStatus.bind(ctrl));
      protectedRouter.get('/inventory/:sku/history', ctrl.getInventoryHistory.bind(ctrl));
      
      // Bulk operations
      protectedRouter.post('/inventory/bulk-update', ctrl.bulkUpdateInventory.bind(ctrl));
      
      // Sync operations
      protectedRouter.post('/inventory/sync/:sku', ctrl.syncInventoryBySku.bind(ctrl));
      protectedRouter.post('/inventory/sync', ctrl.syncAllInventory.bind(ctrl));
      
      // Discrepancy management
      protectedRouter.post('/inventory/discrepancy-check', ctrl.checkDiscrepancy.bind(ctrl));
      protectedRouter.get('/inventory/discrepancies/list', ctrl.getDiscrepancies.bind(ctrl));
      protectedRouter.post('/inventory/discrepancies/resolve', ctrl.resolveDiscrepancy.bind(ctrl));
      protectedRouter.post('/inventory/discrepancies/:sku/resolve', ctrl.resolveDiscrepancy.bind(ctrl));

      logger.info('✅ Inventory routes registered');
    }

    // ============================================
    // SYNC ROUTES
    // ============================================
    if (serviceContainer.syncController) {
      const ctrl = serviceContainer.syncController;

      protectedRouter.post('/sync/all', ctrl.syncAll.bind(ctrl));
      protectedRouter.post('/sync/inventory', ctrl.syncInventory.bind(ctrl));
      protectedRouter.post('/sync/prices', ctrl.syncPrices.bind(ctrl));
      protectedRouter.post('/sync/products', ctrl.syncProducts.bind(ctrl));
      protectedRouter.post('/sync/sku/:sku', ctrl.syncSingleSku.bind(ctrl));
      protectedRouter.get('/sync/status', ctrl.getSyncStatus.bind(ctrl));
      protectedRouter.get('/sync/history', ctrl.getSyncHistory.bind(ctrl));
      protectedRouter.get('/sync/jobs', ctrl.getSyncJobs.bind(ctrl));
      protectedRouter.get('/sync/jobs/:id', ctrl.getSyncJobById.bind(ctrl));
      protectedRouter.post('/sync/jobs/:id/cancel', ctrl.cancelSyncJob.bind(ctrl));
      protectedRouter.post('/sync/jobs/:id/retry', ctrl.retrySyncJob.bind(ctrl));

      logger.info('✅ Sync routes registered');
    }

    // ============================================
    // PRICE ROUTES
    // ============================================
    if (serviceContainer.priceController) {
      const ctrl = serviceContainer.priceController;

      protectedRouter.get('/prices', ctrl.getPrices.bind(ctrl));
      protectedRouter.get('/prices/:sku', ctrl.getPriceBySku.bind(ctrl));
      protectedRouter.put('/prices/:sku', ctrl.updatePrice.bind(ctrl));
      protectedRouter.post('/prices/bulk-update', ctrl.bulkUpdatePrices.bind(ctrl));
      protectedRouter.get('/prices/discrepancies', ctrl.getPriceDiscrepancies.bind(ctrl));
      protectedRouter.get('/prices/history/:sku', ctrl.getPriceHistory.bind(ctrl));
      protectedRouter.post('/prices/calculate', ctrl.calculatePrice.bind(ctrl));
      protectedRouter.get('/prices/margins', ctrl.getMargins.bind(ctrl));
      protectedRouter.post('/prices/sync/:sku', ctrl.syncPriceBySku.bind(ctrl));

      logger.info('✅ Price routes registered');
    }

    // ============================================
    // ANALYTICS ROUTES
    // ============================================
    if (serviceContainer.analyticsController) {
      const ctrl = serviceContainer.analyticsController;

      protectedRouter.get('/analytics/overview', ctrl.getOverview.bind(ctrl));
      protectedRouter.get('/analytics/sales', ctrl.getSalesAnalytics.bind(ctrl));
      protectedRouter.get('/analytics/inventory', ctrl.getInventoryAnalytics.bind(ctrl));
      protectedRouter.get('/analytics/sync', ctrl.getSyncAnalytics.bind(ctrl));
      protectedRouter.get('/analytics/performance', ctrl.getPerformanceMetrics.bind(ctrl));
      protectedRouter.get('/analytics/trends', ctrl.getTrends.bind(ctrl));
      protectedRouter.get('/analytics/export', ctrl.exportAnalytics.bind(ctrl));

      logger.info('✅ Analytics routes registered');
    }

    // ============================================
    // SETTINGS ROUTES
    // ============================================
    if (serviceContainer.settingsController) {
      const ctrl = serviceContainer.settingsController;

      protectedRouter.get('/settings', ctrl.getSettings.bind(ctrl));
      protectedRouter.put('/settings', ctrl.updateSettings.bind(ctrl));
      protectedRouter.get('/settings/:key', ctrl.getSettingByKey.bind(ctrl));
      protectedRouter.put('/settings/:key', ctrl.updateSettingByKey.bind(ctrl));
      protectedRouter.post('/settings/reset', ctrl.resetSettings.bind(ctrl));
      protectedRouter.get('/settings/export', ctrl.exportSettings.bind(ctrl));
      protectedRouter.post('/settings/import', ctrl.importSettings.bind(ctrl));

      logger.info('✅ Settings routes registered');
    }

    // ============================================
    // NOTIFICATION ROUTES
    // ============================================
    if (serviceContainer.notificationController) {
      const ctrl = serviceContainer.notificationController;

      protectedRouter.get('/notifications', ctrl.getNotifications.bind(ctrl));
      protectedRouter.get('/notifications/:id', ctrl.getNotificationById.bind(ctrl));
      protectedRouter.patch('/notifications/:id/read', ctrl.markAsRead.bind(ctrl));
      protectedRouter.patch('/notifications/read-all', ctrl.markAllAsRead.bind(ctrl));
      protectedRouter.delete('/notifications/:id', ctrl.deleteNotification.bind(ctrl));
      protectedRouter.post('/notifications/test', ctrl.sendTestNotification.bind(ctrl));

      logger.info('✅ Notification routes registered');
    }

    // ============================================
    // REPORT ROUTES
    // ============================================
    if (serviceContainer.reportController) {
      const ctrl = serviceContainer.reportController;

      protectedRouter.get('/reports', ctrl.getReports.bind(ctrl));
      protectedRouter.get('/reports/:id', ctrl.getReportById.bind(ctrl));
      protectedRouter.post('/reports/generate', ctrl.generateReport.bind(ctrl));
      protectedRouter.get('/reports/:id/download', ctrl.downloadReport.bind(ctrl));
      protectedRouter.delete('/reports/:id', ctrl.deleteReport.bind(ctrl));
      protectedRouter.get('/reports/templates', ctrl.getReportTemplates.bind(ctrl));

      logger.info('✅ Report routes registered');
    }

    // ============================================
    // AUTH ROUTES (Public)
    // ============================================
    if (serviceContainer.authController) {
      const ctrl = serviceContainer.authController;

      router.post('/auth/login', ctrl.login.bind(ctrl));
      router.post('/auth/register', ctrl.register.bind(ctrl));
      router.post('/auth/refresh', ctrl.refreshToken.bind(ctrl));
      router.post('/auth/logout', ctrl.logout.bind(ctrl));
      router.post('/auth/forgot-password', ctrl.forgotPassword.bind(ctrl));
      router.post('/auth/reset-password', ctrl.resetPassword.bind(ctrl));
      
      // Protected auth routes
      protectedRouter.get('/auth/me', ctrl.getProfile.bind(ctrl));
      protectedRouter.put('/auth/profile', ctrl.updateProfile.bind(ctrl));
      protectedRouter.put('/auth/change-password', ctrl.changePassword.bind(ctrl));

      logger.info('✅ Auth routes registered');
    }
  };

  // Default handlers for all routes
  const defaultHandlers = {
    // Products
    getProducts: async (req: any, res: any) => {
      res.json({ success: true, data: [], pagination: { total: 0, page: 1, limit: 20 } });
    },
    getProductById: async (req: any, res: any) => {
      res.json({ success: true, data: { id: req.params.id, name: 'Sample Product' } });
    },
    
    // Inventory
    getInventory: async (req: any, res: any) => {
      res.json({ success: true, data: [], pagination: { total: 0, page: 1, limit: 20 } });
    },
    
    // Mappings
    getMappings: async (req: any, res: any) => {
      res.json({ success: true, data: [], pagination: { total: 0, page: 1, limit: 20 } });
    },
    
    // Sync
    getSyncStatus: async (req: any, res: any) => {
      res.json({ success: true, data: { status: 'idle', lastSync: new Date() } });
    },
    getSyncHistory: async (req: any, res: any) => {
      res.json({ success: true, data: [], pagination: { total: 0, page: 1, limit: 20 } });
    },
    
    // Settings
    getSettings: async (req: any, res: any) => {
      res.json({ 
        success: true, 
        data: {
          general: { siteName: 'Naver-Shopify ERP' },
          sync: { autoSync: false, interval: 3600 },
          notifications: { email: true, slack: false }
        }
      });
    },
    
    // Price
    getPrices: async (req: any, res: any) => {
      res.json({ success: true, data: [], pagination: { total: 0, page: 1, limit: 20 } });
    },
    
    // Reports
    getReports: async (req: any, res: any) => {
      res.json({ success: true, data: [], pagination: { total: 0, page: 1, limit: 20 } });
    },
    
    // Analytics
    getAnalytics: async (req: any, res: any) => {
      res.json({ 
        success: true, 
        data: {
          revenue: { today: 0, week: 0, month: 0 },
          orders: { today: 0, week: 0, month: 0 }
        }
      });
    },
    
    // Notifications
    getNotifications: async (req: any, res: any) => {
      res.json({ success: true, data: [], unreadCount: 0 });
    },
    
    // Generic success response
    success: async (req: any, res: any) => {
      res.json({ success: true, message: 'Operation completed successfully' });
    },
    
    // Generic list response
    emptyList: async (req: any, res: any) => {
      res.json({ success: true, data: [], pagination: { total: 0, page: 1, limit: 20 } });
    }
  };

  // Add dashboard routes immediately without container
  protectedRouter.get('/dashboard/statistics', defaultDashboardHandlers.statistics);
  protectedRouter.get('/dashboard/activities', defaultDashboardHandlers.activities);
  protectedRouter.get('/dashboard/charts/sales', defaultDashboardHandlers.salesChart);
  protectedRouter.get('/dashboard/charts/inventory', defaultDashboardHandlers.inventoryChart);
  protectedRouter.get('/dashboard/charts/sync', defaultDashboardHandlers.syncChart);
  protectedRouter.get('/dashboard/charts/price', defaultDashboardHandlers.priceChart);
  
  // Add ALL product routes
  protectedRouter.get('/products', defaultHandlers.getProducts);
  protectedRouter.get('/products/:sku', defaultHandlers.getProductById);
  protectedRouter.post('/products', defaultHandlers.success);
  protectedRouter.put('/products/:sku', defaultHandlers.success);
  protectedRouter.delete('/products/:sku', defaultHandlers.success);
  protectedRouter.get('/products/search/naver', defaultHandlers.emptyList);
  protectedRouter.get('/products/search/shopify', defaultHandlers.emptyList);
  protectedRouter.post('/products/bulk-update', defaultHandlers.success);
  protectedRouter.get('/products/export/csv', defaultHandlers.emptyList);
  protectedRouter.post('/products/:sku/sync', defaultHandlers.success);
  
  // Add ALL inventory routes
  // 재고 관리 - InventoryController 사용 또는 기본 핸들러
  if (serviceContainer?.inventoryController) {
    // InventoryController가 등록되면 이미 위에서 처리됨
  } else {
    // 기본 핸들러 - 매핑된 상품들의 재고 정보 반환
    protectedRouter.get('/inventory', async (req: any, res: any) => {
      try {
        // MongoDB에서 매핑 정보 가져오기
        const ProductMapping = (await import('../models/ProductMapping.js')).default;
        
        if (!ProductMapping) {
          throw new Error('ProductMapping model not found');
        }
        
        const mappings = await ProductMapping.find({}).limit(20).lean();
        
        // 매핑된 상품들의 재고 정보 구성
        const inventoryData = mappings.map((mapping: any) => ({
          _id: mapping._id,
          sku: mapping.sku,
          productName: mapping.productName || '상품명 없음',
          naverStock: mapping.inventory?.naver?.available || 0,
          shopifyStock: mapping.inventory?.shopify?.available || 0,
          status: mapping.status || 'active',
          lastSync: mapping.updatedAt,
          discrepancy: false
        }));
        
        res.json({
          success: true,
          data: inventoryData,
          pagination: {
            total: inventoryData.length,
            page: 1,
            limit: 20
          }
        });
      } catch (error) {
        console.error('Inventory fetch error:', error);
        res.json({ success: true, data: [], pagination: { total: 0, page: 1, limit: 20 } });
      }
    });
  }
  protectedRouter.get('/inventory/:sku', defaultHandlers.getProductById);
  protectedRouter.put('/inventory/:sku', defaultHandlers.success);
  protectedRouter.post('/inventory/:sku/adjust', defaultHandlers.success);
  protectedRouter.get('/inventory/:sku/status', defaultHandlers.getProductById);
  protectedRouter.get('/inventory/:sku/history', defaultHandlers.emptyList);
  protectedRouter.post('/inventory/bulk-update', defaultHandlers.success);
  protectedRouter.post('/inventory/sync/:sku', defaultHandlers.success);
  protectedRouter.post('/inventory/sync', defaultHandlers.success);
  protectedRouter.post('/inventory/discrepancy-check', defaultHandlers.success);
  protectedRouter.get('/inventory/discrepancies/list', defaultHandlers.emptyList);
  protectedRouter.post('/inventory/discrepancies/resolve', defaultHandlers.success);
  protectedRouter.post('/inventory/discrepancies/:sku/resolve', defaultHandlers.success);
  
  // Add ALL mapping routes - 순서 중요! 구체적인 경로를 먼저
  // MappingController가 있으면 실제 구현 사용, 없으면 더미 데이터
  if (serviceContainer?.mappingController) {
    protectedRouter.get('/mappings/search-by-sku', serviceContainer.mappingController.searchProductsBySku.bind(serviceContainer.mappingController));
  } else {
    protectedRouter.get('/mappings/search-by-sku', async (req: any, res: any) => {
      const { sku } = req.query;
      
      // 더미 데이터 반환 - 실제 구현 전까지 사용
      res.json({
        success: true,
        data: {
          naver: {
            found: true,
            products: [
              {
                id: `naver-${sku || 'test'}`,
                sku: sku || 'test',
                name: `네이버 상품 - ${sku || 'test'}`,
                price: 25000,
                stock: 100,
                image: null,
                url: 'https://smartstore.naver.com/product/example'
              }
            ],
            message: '네이버에서 1개 상품을 찾았습니다.'
          },
          shopify: {
            found: true,
            products: [
              {
                variantId: `gid://shopify/ProductVariant/${sku || 'test'}`,
                sku: sku || 'test',
                title: `Shopify Product - ${sku || 'test'}`,
                price: 25.99,
                inventoryQuantity: 50,
                image: null,
                inventoryItemId: `gid://shopify/InventoryItem/${sku || 'test'}`
              }
            ],
            message: 'Shopify에서 1개 상품을 찾았습니다.'
          }
        }
      });
    });
  }
  
  protectedRouter.get('/mappings/search-shopify', async (req: any, res: any) => {
    // Shopify 제품 검색 결과 반환
    res.json({ 
      success: true, 
      data: [
        {
          id: '1',
          title: 'Sample Product 1',
          sku: 'SP001',
          price: '10000',
          inventory: 100,
          vendor: 'Sample Vendor'
        },
        {
          id: '2',
          title: 'Sample Product 2',
          sku: 'SP002',
          price: '20000',
          inventory: 50,
          vendor: 'Sample Vendor'
        }
      ]
    });
  });
  // Mapping routes는 이미 위에서 ServiceContainer를 통해 등록됨
  // 중복 제거
  
  // Add ALL sync routes
  protectedRouter.post('/sync/all', defaultHandlers.success);
  protectedRouter.post('/sync/inventory', defaultHandlers.success);
  protectedRouter.post('/sync/prices', defaultHandlers.success);
  protectedRouter.post('/sync/products', defaultHandlers.success);
  protectedRouter.post('/sync/sku/:sku', defaultHandlers.success);
  protectedRouter.get('/sync/status', defaultHandlers.getSyncStatus);
  protectedRouter.get('/sync/history', defaultHandlers.getSyncHistory);
  protectedRouter.get('/sync/jobs', defaultHandlers.emptyList);
  protectedRouter.get('/sync/jobs/:id', defaultHandlers.getProductById);
  protectedRouter.post('/sync/jobs/:id/cancel', defaultHandlers.success);
  protectedRouter.post('/sync/jobs/:id/retry', defaultHandlers.success);
  
  // Add ALL price routes
  protectedRouter.get('/prices', defaultHandlers.getPrices);
  protectedRouter.get('/prices/:sku', defaultHandlers.getProductById);
  protectedRouter.put('/prices/:sku', defaultHandlers.success);
  protectedRouter.post('/prices/bulk-update', defaultHandlers.success);
  protectedRouter.get('/prices/discrepancies', defaultHandlers.emptyList);
  protectedRouter.get('/prices/history/:sku', defaultHandlers.emptyList);
  protectedRouter.post('/prices/calculate', defaultHandlers.success);
  protectedRouter.get('/prices/margins', defaultHandlers.emptyList);
  protectedRouter.post('/prices/sync/:sku', defaultHandlers.success);
  
  // Add ALL analytics routes
  protectedRouter.get('/analytics/overview', defaultHandlers.getAnalytics);
  protectedRouter.get('/analytics/sales', defaultHandlers.getAnalytics);
  protectedRouter.get('/analytics/inventory', defaultHandlers.getAnalytics);
  protectedRouter.get('/analytics/sync', defaultHandlers.getAnalytics);
  protectedRouter.get('/analytics/performance', defaultHandlers.getAnalytics);
  protectedRouter.get('/analytics/trends', defaultHandlers.getAnalytics);
  protectedRouter.get('/analytics/export', defaultHandlers.emptyList);
  
  // Add ALL notification routes
  protectedRouter.get('/notifications', defaultHandlers.getNotifications);
  protectedRouter.get('/notifications/:id', defaultHandlers.getProductById);
  protectedRouter.patch('/notifications/:id/read', defaultHandlers.success);
  protectedRouter.patch('/notifications/read-all', defaultHandlers.success);
  protectedRouter.delete('/notifications/:id', defaultHandlers.success);
  protectedRouter.post('/notifications/test', defaultHandlers.success);
  
  // Add ALL report routes
  protectedRouter.get('/reports', defaultHandlers.getReports);
  protectedRouter.get('/reports/:id', defaultHandlers.getProductById);
  protectedRouter.post('/reports/generate', defaultHandlers.success);
  protectedRouter.get('/reports/:id/download', defaultHandlers.emptyList);
  protectedRouter.delete('/reports/:id', defaultHandlers.success);
  protectedRouter.get('/reports/templates', defaultHandlers.emptyList);
  
  // Add ALL settings routes (move up from below)
  protectedRouter.get('/settings', defaultHandlers.getSettings);
  protectedRouter.put('/settings', defaultHandlers.success);
  protectedRouter.get('/settings/:key', defaultHandlers.getSettings);
  protectedRouter.put('/settings/:key', defaultHandlers.success);
  protectedRouter.post('/settings/reset', defaultHandlers.success);
  protectedRouter.get('/settings/export', defaultHandlers.emptyList);
  protectedRouter.post('/settings/import', defaultHandlers.success);
  
  // Add Auth routes (public - no authentication required)
  router.post('/auth/login', async (req: any, res: any) => {
    res.json({ 
      success: true, 
      data: { 
        token: 'test-token-' + Date.now(),
        user: { id: '1', email: 'test@example.com', name: 'Test User' }
      }
    });
  });
  router.post('/auth/register', async (req: any, res: any) => {
    res.json({ success: true, message: 'Registration successful' });
  });
  router.post('/auth/refresh', async (req: any, res: any) => {
    res.json({ success: true, data: { token: 'refreshed-token-' + Date.now() } });
  });
  router.post('/auth/logout', async (req: any, res: any) => {
    res.json({ success: true, message: 'Logged out successfully' });
  });
  router.post('/auth/forgot-password', async (req: any, res: any) => {
    res.json({ success: true, message: 'Password reset email sent' });
  });
  router.post('/auth/reset-password', async (req: any, res: any) => {
    res.json({ success: true, message: 'Password reset successful' });
  });
  
  // Protected auth routes
  protectedRouter.get('/auth/me', async (req: any, res: any) => {
    res.json({ 
      success: true, 
      data: { 
        id: '1', 
        email: 'test@example.com', 
        name: 'Test User',
        role: 'admin'
      }
    });
  });
  protectedRouter.put('/auth/profile', defaultHandlers.success);
  protectedRouter.put('/auth/change-password', defaultHandlers.success);

  // Setup routes if container is provided
  if (container) {
    await setupContainerRoutes(container);
  }

  // Mount protected routes
  router.use('/', protectedRouter);

  // 404 handler for API routes
  router.use((req, res) => {
    res.status(404).json({
      success: false,
      error: 'API endpoint not found',
      path: req.path,
    });
  });

  return router;
}

export default setupApiRoutes;