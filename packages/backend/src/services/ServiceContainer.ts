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

export interface IServiceContainer {
  // Core Services
  redis: Redis;
  io?: SocketIOServer;
  
  // Naver Services
  naverAuthService: NaverAuthService;
  naverProductService: NaverProductService;
  naverOrderService: NaverOrderService;
  
  // Shopify Services
  shopifyService: ShopifyService;
  shopifyGraphQLService: ShopifyGraphQLService;
  shopifyBulkService: ShopifyBulkService;
  shopifyInventoryService: ShopifyInventoryService;
  shopifyProductSearchService: ShopifyProductSearchService;
  
  // Sync Services
  syncService: SyncService;
  inventorySyncService: InventorySyncService;
  priceSyncService: PriceSyncService;
  mappingService: MappingService;
  conflictResolver: ConflictResolver;
  
  // Other Services
  exchangeRateService: ExchangeRateService;
  notificationService: NotificationService;
  activityService: ActivityService;
  reportService: ReportService;
  
  // Controllers
  authController: AuthController;
  productController: ProductController;
  inventoryController: InventoryController;
  syncController: SyncController;
  mappingController: MappingController;
  dashboardController: DashboardController;
  webhookController: WebhookController;
  shopifyWebhookController: ShopifyWebhookController;
  priceController?: PriceController;
  analyticsController?: AnalyticsController;
  settingsController?: SettingsController;
  notificationController?: NotificationController;
  reportController?: ReportController;
}

export class ServiceContainer implements IServiceContainer {
  private static instance: ServiceContainer;
  
  // Core
  public redis: Redis;
  public io?: SocketIOServer;
  
  // Services
  public naverAuthService!: NaverAuthService;
  public naverProductService!: NaverProductService;
  public naverOrderService!: NaverOrderService;
  public shopifyService!: ShopifyService;
  public shopifyGraphQLService!: ShopifyGraphQLService;
  public shopifyBulkService!: ShopifyBulkService;
  public shopifyInventoryService!: ShopifyInventoryService;
  public shopifyProductSearchService!: ShopifyProductSearchService;
  public syncService!: SyncService;
  public inventorySyncService!: InventorySyncService;
  public priceSyncService!: PriceSyncService;
  public mappingService!: MappingService;
  public conflictResolver!: ConflictResolver;
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
  }

  static async initialize(redis: Redis): Promise<ServiceContainer> {
    if (!ServiceContainer.instance) {
      ServiceContainer.instance = new ServiceContainer(redis);
      await ServiceContainer.instance.initializeServices();
      await ServiceContainer.instance.initializeControllers();
    }
    return ServiceContainer.instance;
  }

  static getInstance(): ServiceContainer {
    if (!ServiceContainer.instance) {
      throw new Error('ServiceContainer not initialized. Call ServiceContainer.initialize() first.');
    }
    return ServiceContainer.instance;
  }

  private async initializeServices(): Promise<void> {
    try {
      logger.info('🔧 Initializing services...');
      
      // Initialize Naver Services
      this.naverAuthService = new NaverAuthService(this.redis);
      this.naverProductService = new NaverProductService(this.naverAuthService);
      this.naverOrderService = new NaverOrderService(this.naverAuthService);
      
      // Initialize Shopify Services
      this.shopifyService = new ShopifyService();
      await this.shopifyService.initialize();
      
      this.shopifyGraphQLService = new ShopifyGraphQLService();
      this.shopifyBulkService = new ShopifyBulkService();
      this.shopifyInventoryService = new ShopifyInventoryService();
      this.shopifyProductSearchService = new ShopifyProductSearchService();
      
      // Initialize Sync Services
      this.conflictResolver = new ConflictResolver();
      
      this.inventorySyncService = new InventorySyncService(
        this.naverProductService,
        this.shopifyInventoryService,
        this.conflictResolver
      );
      
      this.priceSyncService = new PriceSyncService(
        this.naverProductService,
        this.shopifyGraphQLService,
        this.redis
      );
      
      this.mappingService = new MappingService(
        this.naverProductService,
        this.shopifyGraphQLService,
        this.shopifyProductSearchService
      );
      
      this.syncService = new SyncService(
        this.naverProductService,
        this.naverOrderService,
        this.shopifyBulkService,
        this.shopifyGraphQLService,
        this.redis
      );
      
      // Initialize Other Services
      this.exchangeRateService = new ExchangeRateService(this.redis);
      this.notificationService = new NotificationService(this.redis);
      this.activityService = new ActivityService();
      this.reportService = new ReportService(
        this.syncService,
        this.inventorySyncService,
        this.priceSyncService
      );
      
      logger.info('✅ All services initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize services:', error);
      throw error;
    }
  }

  private async initializeControllers(): Promise<void> {
    try {
      logger.info('🎮 Initializing controllers...');
      
      // Initialize Core Controllers
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
      
      // Initialize Optional Controllers (with error handling)
      try {
        const { PriceController } = await import('../controllers/PriceController.js');
        this.priceController = new PriceController(
          this.priceSyncService,
          this.exchangeRateService
        );
      } catch (error) {
        logger.warn('PriceController not available:', error);
      }
      
      try {
        const { AnalyticsController } = await import('../controllers/AnalyticsController.js');
        this.analyticsController = new AnalyticsController(
          this.reportService,
          this.activityService
        );
      } catch (error) {
        logger.warn('AnalyticsController not available:', error);
      }
      
      try {
        const { SettingsController } = await import('../controllers/SettingsController.js');
        this.settingsController = new SettingsController(this.redis);
      } catch (error) {
        logger.warn('SettingsController not available:', error);
      }
      
      try {
        const { NotificationController } = await import('../controllers/NotificationController.js');
        this.notificationController = new NotificationController(
          this.notificationService
        );
      } catch (error) {
        logger.warn('NotificationController not available:', error);
      }
      
      try {
        const { ReportController } = await import('../controllers/ReportController.js');
        this.reportController = new ReportController(
          this.reportService
        );
      } catch (error) {
        logger.warn('ReportController not available:', error);
      }
      
      logger.info('✅ All controllers initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize controllers:', error);
      throw error;
    }
  }

  setWebSocket(io: SocketIOServer): void {
    this.io = io;
    
    // Update services that need WebSocket
    if (this.notificationService) {
      this.notificationService.setWebSocket(io);
    }
    
    if (this.syncService) {
      this.syncService.setWebSocket(io);
    }
    
    logger.info('✅ WebSocket server attached to services');
  }

  getService<K extends keyof IServiceContainer>(name: K): IServiceContainer[K] {
    const service = this[name];
    if (!service) {
      throw new Error(`Service ${String(name)} not found in container`);
    }
    return service;
  }

  hasService(name: keyof IServiceContainer): boolean {
    return this[name] !== undefined;
  }

  async cleanup(): Promise<void> {
    logger.info('🧹 Cleaning up services...');
    
    try {
      // Cleanup services that need it
      if (this.syncService) {
        await this.syncService.cleanup?.();
      }
      
      if (this.notificationService) {
        await this.notificationService.cleanup?.();
      }
      
      if (this.exchangeRateService) {
        await this.exchangeRateService.cleanup?.();
      }
      
      // Close WebSocket connections
      if (this.io) {
        this.io.close();
      }
      
      logger.info('✅ Services cleaned up successfully');
    } catch (error) {
      logger.error('Error during service cleanup:', error);
      throw error;
    }
  }
}