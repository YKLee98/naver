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
 * Service names type for type safety
 */
export type ServiceName =
  | 'naverAuthService'
  | 'naverProductService'
  | 'naverOrderService'
  | 'shopifyService'
  | 'shopifyGraphQLService'
  | 'shopifyBulkService'
  | 'shopifyInventoryService'
  | 'shopifyProductSearchService'
  | 'syncService'
  | 'inventorySyncService'
  | 'priceSyncService'
  | 'mappingService'
  | 'conflictResolver'
  | 'exchangeRateService'
  | 'notificationService'
  | 'activityService'
  | 'reportService'
  | 'healthCheckService';

/**
 * Service registry type mapping
 */
type ServiceRegistry = {
  naverAuthService?: NaverAuthService;
  naverProductService?: NaverProductService;
  naverOrderService?: NaverOrderService;
  shopifyService?: ShopifyService;
  shopifyGraphQLService?: ShopifyGraphQLService;
  shopifyBulkService?: ShopifyBulkService;
  shopifyInventoryService?: ShopifyInventoryService;
  shopifyProductSearchService?: ShopifyProductSearchService;
  syncService?: SyncService;
  inventorySyncService?: InventorySyncService;
  priceSyncService?: PriceSyncService;
  mappingService?: MappingService;
  conflictResolver?: ConflictResolver;
  exchangeRateService?: ExchangeRateService;
  notificationService?: NotificationService;
  activityService?: ActivityService;
  reportService?: ReportService;
  healthCheckService?: any; // HealthCheckService type if available
};

/**
 * Enterprise Service Container with comprehensive lifecycle management
 * Implements Singleton pattern with dependency injection
 */
export class ServiceContainer {
  private static instance: ServiceContainer;
  private initializationStatus: Map<string, ServiceInitStatus> = new Map();
  private isFullyInitialized: boolean = false;
  private serviceRegistry: ServiceRegistry = {};

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
      throw new Error(
        'ServiceContainer not initialized. Call ServiceContainer.initialize() first.'
      );
    }

    if (!ServiceContainer.instance.isFullyInitialized) {
      logger.warn('ServiceContainer accessed before full initialization');
    }

    return ServiceContainer.instance;
  }

  /**
   * Check if a service exists
   * @param serviceName - Name of the service to check
   * @returns true if service exists and is initialized
   */
  public hasService(serviceName: ServiceName): boolean {
    try {
      const service = this.getServiceInternal(serviceName);
      return service !== null && service !== undefined;
    } catch {
      return false;
    }
  }

  /**
   * Get a service by name
   * @param serviceName - Name of the service to retrieve
   * @returns The service instance or throws error if not found
   */
  public getService<T = any>(serviceName: ServiceName): T {
    const service = this.getServiceInternal(serviceName);

    if (!service) {
      throw new Error(`Service ${serviceName} not found or not initialized`);
    }

    return service as T;
  }

  /**
   * Internal method to get service
   * @param serviceName - Name of the service
   * @returns Service instance or null
   */
  private getServiceInternal(serviceName: ServiceName): any {
    // Check the service registry first
    if (this.serviceRegistry[serviceName]) {
      return this.serviceRegistry[serviceName];
    }

    // Map service names to instance properties
    const serviceMap: Record<ServiceName, any> = {
      naverAuthService: this.naverAuthService,
      naverProductService: this.naverProductService,
      naverOrderService: this.naverOrderService,
      shopifyService: this.shopifyService,
      shopifyGraphQLService: this.shopifyGraphQLService,
      shopifyBulkService: this.shopifyBulkService,
      shopifyInventoryService: this.shopifyInventoryService,
      shopifyProductSearchService: this.shopifyProductSearchService,
      syncService: this.syncService,
      inventorySyncService: this.inventorySyncService,
      priceSyncService: this.priceSyncService,
      mappingService: this.mappingService,
      conflictResolver: this.conflictResolver,
      exchangeRateService: this.exchangeRateService,
      notificationService: this.notificationService,
      activityService: this.activityService,
      reportService: this.reportService,
      healthCheckService: null, // Will be set if available
    };

    return serviceMap[serviceName] || null;
  }

  /**
   * Register a service in the registry
   * @param name - Service name
   * @param service - Service instance
   */
  private registerService(name: ServiceName, service: any): void {
    this.serviceRegistry[name] = service;

    // Also set the instance property for backward compatibility
    (this as any)[name] = service;
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
      this.registerService('naverAuthService', this.naverAuthService);
      return this.naverAuthService;
    });

    // Conflict Resolver
    await this.initializeService('ConflictResolver', async () => {
      this.conflictResolver = new ConflictResolver();
      this.registerService('conflictResolver', this.conflictResolver);
      return this.conflictResolver;
    });
  }

  /**
   * Phase 2: Initialize platform-specific services
   */
  private async initializePhase2Services(): Promise<void> {
    logger.info('📦 Phase 2: Initializing platform services...');

    // Naver Product Service
    await this.initializeService('NaverProductService', async () => {
      this.naverProductService = new NaverProductService(this.naverAuthService);
      this.registerService('naverProductService', this.naverProductService);
      return this.naverProductService;
    });

    // Naver Order Service
    await this.initializeService('NaverOrderService', async () => {
      this.naverOrderService = new NaverOrderService(this.naverAuthService);
      this.registerService('naverOrderService', this.naverOrderService);
      return this.naverOrderService;
    });

    // Shopify Service
    await this.initializeService('ShopifyService', async () => {
      this.shopifyService = new ShopifyService();
      await this.shopifyService.initialize();
      this.registerService('shopifyService', this.shopifyService);
      return this.shopifyService;
    });

    // Shopify GraphQL Service
    await this.initializeService('ShopifyGraphQLService', async () => {
      this.shopifyGraphQLService = new ShopifyGraphQLService();
      this.registerService('shopifyGraphQLService', this.shopifyGraphQLService);
      return this.shopifyGraphQLService;
    });

    // Shopify Bulk Service
    await this.initializeService('ShopifyBulkService', async () => {
      this.shopifyBulkService = new ShopifyBulkService();
      await this.shopifyBulkService.initialize();
      this.registerService('shopifyBulkService', this.shopifyBulkService);
      return this.shopifyBulkService;
    });

    // Shopify Inventory Service
    await this.initializeService('ShopifyInventoryService', async () => {
      this.shopifyInventoryService = new ShopifyInventoryService();
      await this.shopifyInventoryService.initialize();
      this.registerService(
        'shopifyInventoryService',
        this.shopifyInventoryService
      );
      return this.shopifyInventoryService;
    });

    // Shopify Product Search Service
    await this.initializeService('ShopifyProductSearchService', async () => {
      this.shopifyProductSearchService = new ShopifyProductSearchService();
      this.registerService(
        'shopifyProductSearchService',
        this.shopifyProductSearchService
      );
      return this.shopifyProductSearchService;
    });
  }

  /**
   * Phase 3: Initialize business logic services
   */
  private async initializePhase3Services(): Promise<void> {
    logger.info('📦 Phase 3: Initializing business logic services...');

    // Exchange Rate Service (needed by PriceSyncService)
    await this.initializeService('ExchangeRateService', async () => {
      this.exchangeRateService = new ExchangeRateService(this.redis);
      this.registerService('exchangeRateService', this.exchangeRateService);
      return this.exchangeRateService;
    });

    // Mapping Service (needed by InventorySyncService and PriceSyncService)
    await this.initializeService('MappingService', async () => {
      this.mappingService = new MappingService(
        this.shopifyProductSearchService,
        this.naverProductService
      );
      this.registerService('mappingService', this.mappingService);
      return this.mappingService;
    });

    // Inventory Sync Service
    await this.initializeService('InventorySyncService', async () => {
      this.inventorySyncService = new InventorySyncService(
        this.naverProductService,
        this.shopifyInventoryService,
        this.mappingService
      );
      this.registerService('inventorySyncService', this.inventorySyncService);
      return this.inventorySyncService;
    });

    // Price Sync Service
    await this.initializeService('PriceSyncService', async () => {
      this.priceSyncService = new PriceSyncService(
        this.naverProductService,
        this.shopifyService,
        this.mappingService,
        this.exchangeRateService
      );
      this.registerService('priceSyncService', this.priceSyncService);
      return this.priceSyncService;
    });

    // Sync Service
    await this.initializeService('SyncService', async () => {
      this.syncService = new SyncService(
        this.naverProductService,
        this.shopifyService,
        this.inventorySyncService,
        this.priceSyncService,
        this.mappingService,
        this.conflictResolver,
        this.shopifyBulkService,
        this.shopifyGraphQLService,
        this.redis
      );
      this.registerService('syncService', this.syncService);
      return this.syncService;
    });
  }

  /**
   * Phase 4: Initialize utility services
   */
  private async initializePhase4Services(): Promise<void> {
    logger.info('📦 Phase 4: Initializing utility services...');

    await this.initializeService('NotificationService', async () => {
      this.notificationService = new NotificationService(this.redis);
      this.registerService('notificationService', this.notificationService);
      return this.notificationService;
    });

    await this.initializeService('ActivityService', async () => {
      this.activityService = new ActivityService();
      this.registerService('activityService', this.activityService);
      return this.activityService;
    });

    await this.initializeService('ReportService', async () => {
      this.reportService = new ReportService(
        this.syncService,
        this.inventorySyncService,
        this.priceSyncService
      );
      this.registerService('reportService', this.reportService);
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
      startTime: Date.now(),
    };

    this.initializationStatus.set(name, status);

    try {
      logger.debug(`Initializing ${name}...`);
      await initializer();

      status.status = 'success';
      status.endTime = Date.now();

      logger.debug(
        `✓ ${name} initialized in ${status.endTime - status.startTime!}ms`
      );
    } catch (error: any) {
      status.status = 'failed';
      status.error = error.message;
      status.endTime = Date.now();

      logger.error(`✗ ${name} initialization failed:`, error);

      // Critical services fail the entire initialization
      const criticalServices = [
        'NaverAuthService',
        'ShopifyService',
        'SyncService',
      ];

      if (criticalServices.includes(name)) {
        throw new Error(
          `Critical service ${name} failed to initialize: ${error.message}`
        );
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
        this.shopifyGraphQLService
      );

      this.inventoryController = new InventoryController(
        this.inventorySyncService
      );

      this.syncController = new SyncController(this.syncService);

      this.mappingController = new MappingController(this.mappingService);

      this.dashboardController = new DashboardController();

      this.webhookController = new WebhookController(
        this.syncService,
        this.activityService
      );

      this.shopifyWebhookController = new ShopifyWebhookController(
        this.syncService,
        this.inventorySyncService,
        this.priceSyncService
      );

      // Optional Controllers
      if (this.priceSyncService) {
        this.priceController = new PriceController(
          this.priceSyncService,
          this.exchangeRateService
        );
        logger.debug('✓ PriceController initialized');
      }

      if (this.shopifyService && this.naverProductService) {
        this.analyticsController = new AnalyticsController(
          this.syncService,
          this.shopifyService,
          this.naverProductService
        );
        logger.debug('✓ AnalyticsController initialized');
      }

      this.settingsController = new SettingsController();
      logger.debug('✓ SettingsController initialized');

      if (this.notificationService) {
        this.notificationController = new NotificationController(
          this.notificationService
        );
        logger.debug('✓ NotificationController initialized');
      }

      if (this.reportService) {
        this.reportController = new ReportController(this.reportService);
        logger.debug('✓ ReportController initialized');
      }

      logger.info('✅ All controllers initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize controllers:', error);
      throw error;
    }
  }

  /**
   * Get initialization status
   */
  public getInitializationStatus(): {
    isFullyInitialized: boolean;
    services: ServiceInitStatus[];
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
      success: services.filter((s) => s.status === 'success').length,
      failed: services.filter((s) => s.status === 'failed').length,
      pending: services.filter((s) => s.status === 'pending').length,
    };

    return {
      isFullyInitialized: this.isFullyInitialized,
      services,
      summary,
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
        .filter((s) => s.status === 'failed')
        .forEach((s) => {
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
    if (
      this.shopifyService &&
      typeof (this.shopifyService as any).cleanup === 'function'
    ) {
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
