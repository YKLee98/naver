// packages/backend/src/services/ServiceContainer.ts
import { Redis } from 'ioredis';
import { Server as SocketIOServer } from 'socket.io';
import { logger } from '../utils/logger.js';

// Services
import { NaverAuthService } from './naver/NaverAuthService.js';
import { NaverProductService } from './naver/NaverProductService.js';
import { NaverOrderService } from './naver/NaverOrderService.js';
import { ShopifyService } from './shopify/ShopifyService.js';
import { ShopifyGraphQLService } from './shopify/ShopifyGraphQLService.js';
import { ShopifyBulkService } from './shopify/ShopifyBulkService.js';
import { ShopifyInventoryService } from './shopify/ShopifyInventoryService.js';
import { ShopifyProductSearchService } from './shopify/ShopifyProductSearchService.js';
import { SyncService } from './sync/SyncService.js';
import { InventorySyncService } from './sync/InventorySyncService.js';
import { PriceSyncService } from './sync/PriceSyncService.js';
import { MappingService } from './sync/MappingService.js';
import { ConflictResolver } from './sync/ConflictResolver.js';
import { ExchangeRateService } from './exchangeRate/ExchangeRateService.js';
import { NotificationService } from './notification/NotificationService.js';
import { ActivityService } from './activity/ActivityService.js';
import { ReportService } from './report/ReportService.js';

// Controllers
import { AuthController } from '../controllers/AuthController.js';
import { ProductController } from '../controllers/ProductController.js';
import { InventoryController } from '../controllers/InventoryController.js';
import { SyncController } from '../controllers/SyncController.js';
import { MappingController } from '../controllers/MappingController.js';
import { DashboardController } from '../controllers/DashboardController.js';
import { WebhookController } from '../controllers/WebhookController.js';
import { ShopifyWebhookController } from '../controllers/ShopifyWebhookController.js';
import { PriceController } from '../controllers/PriceController.js';
import { AnalyticsController } from '../controllers/AnalyticsController.js';
import { SettingsController } from '../controllers/SettingsController.js';
import { NotificationController } from '../controllers/NotificationController.js';
import { ReportController } from '../controllers/ReportController.js';

/**
 * Service initialization status tracker
 */
interface ServiceInitStatus {
  name: string;
  status: 'pending' | 'initializing' | 'success' | 'failed';
  error?: string;
  startTime?: number;
  endTime?: number;
}

/**
 * Enterprise Service Container with comprehensive lifecycle management
 * Implements Singleton pattern with dependency injection
 */
export class ServiceContainer {
  private static instance: ServiceContainer;
  private initializationStatus: Map<string, ServiceInitStatus> = new Map();
  private isFullyInitialized: boolean = false;
  
  // Core Dependencies
  public redis: Redis;
  public io?: SocketIOServer;
  
  // Naver Services
  public naverAuthService!: NaverAuthService;
  public naverProductService!: NaverProductService;
  public naverOrderService!: NaverOrderService;
  
  // Shopify Services
  public shopifyService!: ShopifyService;
  public shopifyGraphQLService!: ShopifyGraphQLService;
  public shopifyBulkService!: ShopifyBulkService;
  public shopifyInventoryService!: ShopifyInventoryService;
  public shopifyProductSearchService!: ShopifyProductSearchService;
  
  // Sync Services
  public syncService!: SyncService;
  public inventorySyncService!: InventorySyncService;
  public priceSyncService!: PriceSyncService;
  public mappingService!: MappingService;
  public conflictResolver!: ConflictResolver;
  
  // Other Services
  public exchangeRateService!: ExchangeRateService;
  public notificationService!: NotificationService;
  public activityService!: ActivityService;
  public reportService!: ReportService;
  
  // Controllers
  public authController!: AuthController;
  public productController!: ProductController;
  public inventoryController!: InventoryController;
  public syncController!: SyncController;
  public mappingController!: MappingController;
  public dashboardController!: DashboardController;
  public webhookController!: WebhookController;
  public shopifyWebhookController!: ShopifyWebhookController;
  public priceController?: PriceController;
  public analyticsController?: AnalyticsController;
  public settingsController?: SettingsController;
  public notificationController?: NotificationController;
  public reportController?: ReportController;

  private constructor(redis: Redis) {
    this.redis = redis;
    logger.info('ServiceContainer instance created');
  }

  /**
   * Initialize ServiceContainer with all dependencies
   * Ensures singleton pattern and proper initialization order
   */
  static async initialize(redis: Redis): Promise<ServiceContainer> {
    if (!ServiceContainer.instance) {
      logger.info('🚀 Initializing ServiceContainer...');
      ServiceContainer.instance = new ServiceContainer(redis);
      
      try {
        await ServiceContainer.instance.initializeServices();
        await ServiceContainer.instance.initializeControllers();
        ServiceContainer.instance.isFullyInitialized = true;
        
        logger.info('✅ ServiceContainer initialized successfully');
        ServiceContainer.instance.logInitializationSummary();
      } catch (error) {
        logger.error('❌ ServiceContainer initialization failed:', error);
        ServiceContainer.instance.logInitializationSummary();
        throw error;
      }
    }
    
    return ServiceContainer.instance;
  }

  /**
   * Get singleton instance (must be initialized first)
   */
  static getInstance(): ServiceContainer {
    if (!ServiceContainer.instance) {
      throw new Error('ServiceContainer not initialized. Call ServiceContainer.initialize() first.');
    }
    
    if (!ServiceContainer.instance.isFullyInitialized) {
      logger.warn('ServiceContainer accessed before full initialization');
    }
    
    return ServiceContainer.instance;
  }

  /**
   * Initialize all services with proper error handling and status tracking
   */
  private async initializeServices(): Promise<void> {
    logger.info('🔧 Initializing services...');
    
    try {
      // Phase 1: Core Services (no dependencies)
      await this.initializePhase1Services();
      
      // Phase 2: Platform Services (depend on core)
      await this.initializePhase2Services();
      
      // Phase 3: Business Logic Services (depend on platform)
      await this.initializePhase3Services();
      
      // Phase 4: Utility Services
      await this.initializePhase4Services();
      
      logger.info('✅ All services initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize services:', error);
      throw error;
    }
  }

  /**
   * Phase 1: Initialize core services without dependencies
   */
  private async initializePhase1Services(): Promise<void> {
    logger.info('📦 Phase 1: Initializing core services...');
    
    // Naver Auth Service
    await this.initializeService('NaverAuthService', async () => {
      this.naverAuthService = new NaverAuthService(this.redis);
      return this.naverAuthService;
    });

    // Conflict Resolver
    await this.initializeService('ConflictResolver', async () => {
      this.conflictResolver = new ConflictResolver();
      return this.conflictResolver;
    });
  }

  /**
   * Phase 2: Initialize platform-specific services
   */
  private async initializePhase2Services(): Promise<void> {
    logger.info('📦 Phase 2: Initializing platform services...');
    
    // Naver Services
    await this.initializeService('NaverProductService', async () => {
      this.naverProductService = new NaverProductService(this.naverAuthService);
      return this.naverProductService;
    });

    await this.initializeService('NaverOrderService', async () => {
      this.naverOrderService = new NaverOrderService(this.naverAuthService);
      return this.naverOrderService;
    });

    // Shopify Services - with proper async initialization
    await this.initializeService('ShopifyService', async () => {
      this.shopifyService = new ShopifyService();
      await this.shopifyService.initialize(); // 비동기 초기화 호출
      return this.shopifyService;
    });

    await this.initializeService('ShopifyGraphQLService', async () => {
      this.shopifyGraphQLService = new ShopifyGraphQLService();
      // GraphQL 서비스도 initialize 메서드가 있다면 호출
      if (typeof (this.shopifyGraphQLService as any).initialize === 'function') {
        await (this.shopifyGraphQLService as any).initialize();
      }
      return this.shopifyGraphQLService;
    });

    await this.initializeService('ShopifyBulkService', async () => {
      this.shopifyBulkService = new ShopifyBulkService();
      // Bulk 서비스도 initialize 메서드가 있다면 호출
      if (typeof (this.shopifyBulkService as any).initialize === 'function') {
        await (this.shopifyBulkService as any).initialize();
      }
      return this.shopifyBulkService;
    });

    await this.initializeService('ShopifyInventoryService', async () => {
      this.shopifyInventoryService = new ShopifyInventoryService();
      if (typeof (this.shopifyInventoryService as any).initialize === 'function') {
        await (this.shopifyInventoryService as any).initialize();
      }
      return this.shopifyInventoryService;
    });

    await this.initializeService('ShopifyProductSearchService', async () => {
      this.shopifyProductSearchService = new ShopifyProductSearchService();
      if (typeof (this.shopifyProductSearchService as any).initialize === 'function') {
        await (this.shopifyProductSearchService as any).initialize();
      }
      return this.shopifyProductSearchService;
    });
  }

  /**
   * Phase 3: Initialize business logic services
   */
  private async initializePhase3Services(): Promise<void> {
    logger.info('📦 Phase 3: Initializing business logic services...');
    
    await this.initializeService('InventorySyncService', async () => {
      this.inventorySyncService = new InventorySyncService(
        this.naverProductService,
        this.shopifyInventoryService,
        this.conflictResolver
      );
      return this.inventorySyncService;
    });

    await this.initializeService('PriceSyncService', async () => {
      this.priceSyncService = new PriceSyncService(
        this.naverProductService,
        this.shopifyGraphQLService,
        this.redis
      );
      return this.priceSyncService;
    });

    await this.initializeService('MappingService', async () => {
      this.mappingService = new MappingService(
        this.naverProductService,
        this.shopifyGraphQLService,
        this.shopifyProductSearchService
      );
      return this.mappingService;
    });

    await this.initializeService('SyncService', async () => {
      this.syncService = new SyncService(
        this.naverProductService,
        this.naverOrderService,
        this.shopifyBulkService,
        this.shopifyGraphQLService,
        this.redis
      );
      return this.syncService;
    });
  }

  /**
   * Phase 4: Initialize utility services
   */
  private async initializePhase4Services(): Promise<void> {
    logger.info('📦 Phase 4: Initializing utility services...');
    
    await this.initializeService('ExchangeRateService', async () => {
      this.exchangeRateService = new ExchangeRateService(this.redis);
      return this.exchangeRateService;
    });

    await this.initializeService('NotificationService', async () => {
      this.notificationService = new NotificationService(this.redis);
      return this.notificationService;
    });

    await this.initializeService('ActivityService', async () => {
      this.activityService = new ActivityService();
      return this.activityService;
    });

    await this.initializeService('ReportService', async () => {
      this.reportService = new ReportService(
        this.syncService,
        this.inventorySyncService,
        this.priceSyncService
      );
      return this.reportService;
    });
  }

  /**
   * Initialize single service with error handling and status tracking
   */
  private async initializeService(
    name: string, 
    initializer: () => Promise<any>
  ): Promise<void> {
    const status: ServiceInitStatus = {
      name,
      status: 'initializing',
      startTime: Date.now()
    };
    
    this.initializationStatus.set(name, status);
    
    try {
      logger.debug(`Initializing ${name}...`);
      await initializer();
      
      status.status = 'success';
      status.endTime = Date.now();
      
      logger.debug(`✓ ${name} initialized in ${status.endTime - status.startTime!}ms`);
    } catch (error: any) {
      status.status = 'failed';
      status.error = error.message;
      status.endTime = Date.now();
      
      logger.error(`✗ ${name} initialization failed:`, error);
      
      // Critical services fail the entire initialization
      const criticalServices = [
        'NaverAuthService', 
        'ShopifyService', 
        'SyncService'
      ];
      
      if (criticalServices.includes(name)) {
        throw new Error(`Critical service ${name} failed to initialize: ${error.message}`);
      }
      
      // Non-critical services log warning but continue
      logger.warn(`Non-critical service ${name} failed, continuing...`);
    }
  }

  /**
   * Initialize all controllers
   */
  private async initializeControllers(): Promise<void> {
    try {
      logger.info('🎮 Initializing controllers...');
      
      // Core Controllers (always required)
      this.authController = new AuthController();
      
      this.productController = new ProductController(
        this.naverProductService,
        this.shopifyGraphQLService,
        this.mappingService
      );
      
      this.inventoryController = new InventoryController(
        this.inventorySyncService
      );
      
      this.syncController = new SyncController(
        this.syncService
      );
      
      this.mappingController = new MappingController(
        this.mappingService
      );
      
      this.dashboardController = new DashboardController();
      
      this.webhookController = new WebhookController(
        this.syncService,
        this.inventorySyncService
      );
      
      this.shopifyWebhookController = new ShopifyWebhookController(
        this.syncService,
        this.inventorySyncService,
        this.notificationService
      );
      
      // Optional Controllers (with graceful degradation)
      await this.initializeOptionalControllers();
      
      logger.info('✅ All controllers initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize controllers:', error);
      throw error;
    }
  }

  /**
   * Initialize optional controllers with error handling
   */
  private async initializeOptionalControllers(): Promise<void> {
    const optionalControllers = [
      {
        name: 'PriceController',
        init: async () => {
          const { PriceController } = await import('../controllers/PriceController.js');
          this.priceController = new PriceController(
            this.priceSyncService,
            this.exchangeRateService
          );
        }
      },
      {
        name: 'AnalyticsController',
        init: async () => {
          const { AnalyticsController } = await import('../controllers/AnalyticsController.js');
          this.analyticsController = new AnalyticsController(
            this.reportService,
            this.activityService
          );
        }
      },
      {
        name: 'SettingsController',
        init: async () => {
          const { SettingsController } = await import('../controllers/SettingsController.js');
          this.settingsController = new SettingsController();
        }
      },
      {
        name: 'NotificationController',
        init: async () => {
          const { NotificationController } = await import('../controllers/NotificationController.js');
          this.notificationController = new NotificationController(
            this.notificationService
          );
        }
      },
      {
        name: 'ReportController',
        init: async () => {
          const { ReportController } = await import('../controllers/ReportController.js');
          this.reportController = new ReportController(
            this.reportService
          );
        }
      }
    ];

    for (const controller of optionalControllers) {
      try {
        await controller.init();
        logger.debug(`✓ ${controller.name} initialized`);
      } catch (error) {
        logger.warn(`${controller.name} not available:`, error);
      }
    }
  }

  /**
   * Set WebSocket server instance
   */
  public setSocketIO(io: SocketIOServer): void {
    this.io = io;
    logger.info('WebSocket server attached to ServiceContainer');
  }

  /**
   * Get initialization status report
   */
  public getInitializationStatus(): {
    isFullyInitialized: boolean;
    services: Array<ServiceInitStatus>;
    summary: {
      total: number;
      success: number;
      failed: number;
      pending: number;
    };
  } {
    const services = Array.from(this.initializationStatus.values());
    const summary = {
      total: services.length,
      success: services.filter(s => s.status === 'success').length,
      failed: services.filter(s => s.status === 'failed').length,
      pending: services.filter(s => s.status === 'pending').length
    };

    return {
      isFullyInitialized: this.isFullyInitialized,
      services,
      summary
    };
  }

  /**
   * Log initialization summary
   */
  private logInitializationSummary(): void {
    const status = this.getInitializationStatus();
    
    logger.info('═══════════════════════════════════════════════════');
    logger.info('ServiceContainer Initialization Summary:');
    logger.info(`Total Services: ${status.summary.total}`);
    logger.info(`✅ Success: ${status.summary.success}`);
    logger.info(`❌ Failed: ${status.summary.failed}`);
    logger.info(`⏳ Pending: ${status.summary.pending}`);
    
    if (status.summary.failed > 0) {
      logger.info('Failed Services:');
      status.services
        .filter(s => s.status === 'failed')
        .forEach(s => {
          logger.error(`  - ${s.name}: ${s.error}`);
        });
    }
    
    logger.info('═══════════════════════════════════════════════════');
  }

  /**
   * Cleanup all services
   */
  public async cleanup(): Promise<void> {
    logger.info('Cleaning up ServiceContainer...');
    
    // Cleanup Shopify services
    if (this.shopifyService && typeof (this.shopifyService as any).cleanup === 'function') {
      await (this.shopifyService as any).cleanup();
    }
    
    // Close Redis connection
    if (this.redis) {
      await this.redis.quit();
    }
    
    // Reset singleton
    ServiceContainer.instance = null as any;
    
    logger.info('ServiceContainer cleanup completed');
  }
}