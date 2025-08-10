// packages/backend/src/services/sync/SyncService.ts
import { BaseService, ServiceConfig } from '../base/BaseService.js';
import { NaverProductService } from '../naver/NaverProductService.js';
import { ShopifyProductService } from '../shopify/ShopifyProductService.js';
import { ProductMapping, IProductMapping } from '../../models/ProductMapping.js';
import { SyncJob, ISyncJob, SyncJobType, SyncJobStatus } from '../../models/SyncJob.js';
import { logger } from '../../utils/logger.js';
import { EventEmitter } from 'events';
import pLimit from 'p-limit';
import { performance } from 'perf_hooks';

export interface SyncOptions {
  type: SyncJobType;
  skus?: string[];
  force?: boolean;
  dryRun?: boolean;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  metadata?: Record<string, any>;
}

export interface SyncResult {
  jobId: string;
  status: 'completed' | 'failed' | 'partial';
  totalItems: number;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  duration: number;
  errors: any[];
  details?: any;
}

export interface SyncProgress {
  jobId: string;
  progress: number;
  processedItems: number;
  totalItems: number;
  currentItem?: string;
  estimatedTimeRemaining?: number;
}

export class SyncService extends BaseService {
  private naverService: NaverProductService;
  private shopifyService: ShopifyProductService;
  private activeSyncJobs: Map<string, ISyncJob> = new Map();
  private syncQueue: ISyncJob[] = [];
  private isProcessingQueue: boolean = false;
  private concurrencyLimit: pLimit.Limit;
  private syncEventEmitter: EventEmitter = new EventEmitter();

  constructor(
    naverService: NaverProductService,
    shopifyService: ShopifyProductService,
    redis?: any
  ) {
    super({
      name: 'SyncService',
      version: '2.0.0',
      redis
    });

    this.naverService = naverService;
    this.shopifyService = shopifyService;
    this.concurrencyLimit = pLimit(5); // Process 5 items concurrently
  }

  /**
   * Initialize service
   */
  protected async onInitialize(): Promise<void> {
    // Resume any pending sync jobs
    await this.resumePendingSyncJobs();
    
    // Start queue processor
    this.startQueueProcessor();
  }

  /**
   * Cleanup service
   */
  protected async onCleanup(): Promise<void> {
    // Cancel all active sync jobs
    for (const job of this.activeSyncJobs.values()) {
      await this.cancelSyncJob(job.syncJobId);
    }
    
    this.syncEventEmitter.removeAllListeners();
  }

  /**
   * Start sync operation
   */
  async startSync(options: SyncOptions): Promise<SyncResult> {
    return this.executeWithMetrics(
      async () => {
        logger.info('Starting sync operation', options);

        // Validate options
        this.validateSyncOptions(options);

        // Create sync job
        const job = await this.createSyncJob(options);

        // Add to queue
        this.syncQueue.push(job);
        
        // Process queue
        this.processQueue();

        // Wait for completion or timeout
        const result = await this.waitForSyncCompletion(job.syncJobId, 3600000); // 1 hour timeout

        logger.info('Sync operation completed', {
          jobId: job.syncJobId,
          status: result.status,
          duration: result.duration
        });

        return result;
      },
      'startSync'
    );
  }

  /**
   * Validate sync options
   */
  private validateSyncOptions(options: SyncOptions): void {
    if (!options.type) {
      throw new Error('Sync type is required');
    }

    if (options.skus && !Array.isArray(options.skus)) {
      throw new Error('SKUs must be an array');
    }

    if (options.skus && options.skus.length > 1000) {
      throw new Error('Maximum 1000 SKUs allowed per sync');
    }
  }

  /**
   * Create sync job
   */
  private async createSyncJob(options: SyncOptions): Promise<ISyncJob> {
    const job = new SyncJob({
      type: options.type,
      status: SyncJobStatus.PENDING,
      priority: options.priority || 'normal',
      metadata: {
        ...options.metadata,
        triggeredBy: 'manual',
        dryRun: options.dryRun || false,
        force: options.force || false
      }
    });

    await job.save();
    
    this.emit('sync:created', { jobId: job.syncJobId, type: job.type });
    
    return job;
  }

  /**
   * Process sync queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue) return;
    
    this.isProcessingQueue = true;

    try {
      while (this.syncQueue.length > 0) {
        // Sort queue by priority
        this.syncQueue.sort((a, b) => {
          const priorityOrder = { urgent: 4, high: 3, normal: 2, low: 1 };
          return priorityOrder[b.priority] - priorityOrder[a.priority];
        });

        const job = this.syncQueue.shift();
        if (!job) continue;

        // Check if we can process more jobs
        if (this.activeSyncJobs.size >= 3) {
          // Put job back in queue
          this.syncQueue.unshift(job);
          await this.delay(1000);
          continue;
        }

        // Process job
        this.processJob(job).catch(error => {
          logger.error(`Failed to process sync job ${job.syncJobId}:`, error);
        });
      }
    } finally {
      this.isProcessingQueue = false;
    }
  }

  /**
   * Process individual sync job
   */
  private async processJob(job: ISyncJob): Promise<void> {
    const startTime = performance.now();
    
    try {
      // Mark job as processing
      job.status = SyncJobStatus.PROCESSING;
      job.performance.startedAt = new Date();
      await job.save();
      
      this.activeSyncJobs.set(job.syncJobId, job);
      this.emit('sync:started', { jobId: job.syncJobId });

      // Get items to sync
      const items = await this.getItemsToSync(job);
      job.totalItems = items.length;
      await job.save();

      // Process items based on sync type
      let result;
      switch (job.type) {
        case SyncJobType.INVENTORY:
          result = await this.syncInventory(job, items);
          break;
        case SyncJobType.PRICE:
          result = await this.syncPrices(job, items);
          break;
        case SyncJobType.PRODUCT:
          result = await this.syncProducts(job, items);
          break;
        case SyncJobType.FULL:
          result = await this.syncFull(job, items);
          break;
        default:
          throw new Error(`Unsupported sync type: ${job.type}`);
      }

      // Complete job
      await job.complete(result);
      
      const duration = performance.now() - startTime;
      
      this.emit('sync:completed', {
        jobId: job.syncJobId,
        duration,
        result
      });
      
    } catch (error) {
      await job.fail((error as Error).message);
      
      this.emit('sync:failed', {
        jobId: job.syncJobId,
        error: (error as Error).message
      });
      
      throw error;
    } finally {
      this.activeSyncJobs.delete(job.syncJobId);
    }
  }

  /**
   * Get items to sync
   */
  private async getItemsToSync(job: ISyncJob): Promise<IProductMapping[]> {
    const query: any = {
      isActive: true,
      _deleted: { $ne: true }
    };

    // Add SKU filter if specified
    if (job.metadata?.skus && Array.isArray(job.metadata.skus)) {
      query.sku = { $in: job.metadata.skus };
    }

    // Add additional filters based on sync type
    switch (job.type) {
      case SyncJobType.INVENTORY:
        query['syncStatus.inventory'] = { $ne: 'synced' };
        break;
      case SyncJobType.PRICE:
        query['syncStatus.price'] = { $ne: 'synced' };
        break;
      case SyncJobType.PRODUCT:
        query['syncStatus.product'] = { $ne: 'synced' };
        break;
    }

    const items = await ProductMapping.find(query).limit(1000);
    
    logger.info(`Found ${items.length} items to sync for job ${job.syncJobId}`);
    
    return items;
  }

  /**
   * Sync inventory
   */
  private async syncInventory(
    job: ISyncJob,
    items: IProductMapping[]
  ): Promise<any> {
    const results = {
      success: [],
      failed: [],
      skipped: []
    };

    const tasks = items.map((item, index) => 
      this.concurrencyLimit(async () => {
        try {
          // Update progress
          await this.updateJobProgress(job, index + 1);

          // Check if sync is needed
          if (!job.metadata?.force && this.isInventorySynced(item)) {
            results.skipped.push(item.sku);
            return;
          }

          // Get inventory from both platforms
          const [naverInventory, shopifyInventory] = await Promise.all([
            this.naverService.getInventory(item.naverProductId),
            this.shopifyService.getInventory(item.shopifyInventoryItemId!)
          ]);

          // Determine sync direction
          const syncDirection = item.inventory.sync.priorityPlatform;
          
          if (syncDirection === 'naver' || !item.inventory.sync.bidirectional) {
            // Sync from Naver to Shopify
            await this.shopifyService.updateInventory(
              item.shopifyInventoryItemId!,
              naverInventory.available
            );
            
            item.inventory.shopify.available = naverInventory.available;
          } else {
            // Sync from Shopify to Naver
            await this.naverService.updateInventory(
              item.naverProductId,
              shopifyInventory.available
            );
            
            item.inventory.naver.available = shopifyInventory.available;
          }

          // Update sync status
          item.syncStatus.inventory = 'synced';
          item.syncStatus.lastSyncAt = new Date();
          await item.save();

          results.success.push(item.sku);
          
        } catch (error) {
          logger.error(`Failed to sync inventory for ${item.sku}:`, error);
          
          await job.addError({
            sku: item.sku,
            code: 'INVENTORY_SYNC_ERROR',
            message: (error as Error).message,
            timestamp: new Date(),
            retryable: true
          });
          
          results.failed.push(item.sku);
        }
      })
    );

    await Promise.all(tasks);

    // Update job stats
    job.successItems = results.success.length;
    job.failedItems = results.failed.length;
    job.skippedItems = results.skipped.length;
    await job.save();

    return results;
  }

  /**
   * Sync prices
   */
  private async syncPrices(
    job: ISyncJob,
    items: IProductMapping[]
  ): Promise<any> {
    const results = {
      success: [],
      failed: [],
      skipped: []
    };

    const exchangeRate = await this.getExchangeRate();

    const tasks = items.map((item, index) =>
      this.concurrencyLimit(async () => {
        try {
          // Update progress
          await this.updateJobProgress(job, index + 1);

          // Calculate target prices
          const targetPrice = this.calculateTargetPrice(
            item,
            exchangeRate,
            job.metadata?.marginPercent
          );

          // Update Shopify price
          await this.shopifyService.updatePrice(
            item.shopifyVariantId,
            targetPrice
          );

          // Update local record
          item.pricing.shopify.regular = targetPrice;
          item.pricing.shopify.lastUpdated = new Date();
          item.syncStatus.price = 'synced';
          item.syncStatus.lastSyncAt = new Date();
          await item.save();

          results.success.push(item.sku);
          
        } catch (error) {
          logger.error(`Failed to sync price for ${item.sku}:`, error);
          
          await job.addError({
            sku: item.sku,
            code: 'PRICE_SYNC_ERROR',
            message: (error as Error).message,
            timestamp: new Date(),
            retryable: true
          });
          
          results.failed.push(item.sku);
        }
      })
    );

    await Promise.all(tasks);

    // Update job stats
    job.successItems = results.success.length;
    job.failedItems = results.failed.length;
    job.skippedItems = results.skipped.length;
    await job.save();

    return results;
  }

  /**
   * Sync products
   */
  private async syncProducts(
    job: ISyncJob,
    items: IProductMapping[]
  ): Promise<any> {
    // Implementation for product sync
    // This would sync product details, descriptions, images, etc.
    const results = {
      success: [],
      failed: [],
      skipped: []
    };

    // ... implementation ...

    return results;
  }

  /**
   * Full sync
   */
  private async syncFull(
    job: ISyncJob,
    items: IProductMapping[]
  ): Promise<any> {
    // Run all sync types
    const inventoryResult = await this.syncInventory(job, items);
    const priceResult = await this.syncPrices(job, items);
    const productResult = await this.syncProducts(job, items);

    return {
      inventory: inventoryResult,
      price: priceResult,
      product: productResult
    };
  }

  /**
   * Helper methods
   */
  private isInventorySynced(item: IProductMapping): boolean {
    const threshold = 5 * 60 * 1000; // 5 minutes
    const lastSync = item.syncStatus.lastSyncAt;
    
    if (!lastSync) return false;
    
    return (Date.now() - lastSync.getTime()) < threshold;
  }

  private async getExchangeRate(): Promise<number> {
    // Get from cache or external service
    const cached = await this.getFromCache<number>('exchange_rate:KRW_USD');
    if (cached) return cached;

    // Fetch from external service (simplified)
    const rate = 1350; // Default rate
    await this.setCache('exchange_rate:KRW_USD', rate, 3600);
    
    return rate;
  }

  private calculateTargetPrice(
    item: IProductMapping,
    exchangeRate: number,
    marginPercent?: number
  ): number {
    const basePrice = item.pricing.naver.regular;
    const margin = marginPercent || item.pricing.rules?.marginPercent || 30;
    
    // Convert KRW to USD
    let price = basePrice / exchangeRate;
    
    // Apply margin
    price = price * (1 + margin / 100);
    
    // Apply rounding
    const strategy = item.pricing.rules?.roundingStrategy || 'nearest';
    if (strategy === 'up') {
      price = Math.ceil(price);
    } else if (strategy === 'down') {
      price = Math.floor(price);
    } else {
      price = Math.round(price);
    }
    
    // Apply min/max constraints
    if (item.pricing.rules?.minPrice) {
      price = Math.max(price, item.pricing.rules.minPrice);
    }
    if (item.pricing.rules?.maxPrice) {
      price = Math.min(price, item.pricing.rules.maxPrice);
    }
    
    return price;
  }

  private async updateJobProgress(job: ISyncJob, processedItems: number): Promise<void> {
    const progress = Math.round((processedItems / job.totalItems) * 100);
    
    if (progress !== job.progress) {
      job.processedItems = processedItems;
      job.progress = progress;
      await job.save();
      
      this.emit('sync:progress', {
        jobId: job.syncJobId,
        progress,
        processedItems,
        totalItems: job.totalItems
      });
    }
  }

  /**
   * Wait for sync completion
   */
  private async waitForSyncCompletion(
    jobId: string,
    timeout: number
  ): Promise<SyncResult> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const job = await SyncJob.findOne({ syncJobId: jobId });
      
      if (!job) {
        throw new Error(`Sync job ${jobId} not found`);
      }
      
      if (job.status === SyncJobStatus.COMPLETED) {
        return {
          jobId: job.syncJobId,
          status: 'completed',
          totalItems: job.totalItems,
          successCount: job.successItems,
          failedCount: job.failedItems,
          skippedCount: job.skippedItems,
          duration: job.performance.duration || 0,
          errors: job.errorList,
          details: job.metadata.results
        };
      }
      
      if (job.status === SyncJobStatus.FAILED) {
        return {
          jobId: job.syncJobId,
          status: 'failed',
          totalItems: job.totalItems,
          successCount: job.successItems,
          failedCount: job.failedItems,
          skippedCount: job.skippedItems,
          duration: job.performance.duration || 0,
          errors: job.errorList,
          details: job.metadata.results
        };
      }
      
      // Wait before checking again
      await this.delay(1000);
    }
    
    throw new Error(`Sync job ${jobId} timed out after ${timeout}ms`);
  }

  /**
   * Resume pending sync jobs
   */
  private async resumePendingSyncJobs(): Promise<void> {
    const pendingJobs = await SyncJob.find({
      status: { $in: [SyncJobStatus.PENDING, SyncJobStatus.PROCESSING] },
      _deleted: { $ne: true }
    });

    logger.info(`Found ${pendingJobs.length} pending sync jobs to resume`);

    for (const job of pendingJobs) {
      // Reset processing jobs to pending
      if (job.status === SyncJobStatus.PROCESSING) {
        job.status = SyncJobStatus.PENDING;
        await job.save();
      }
      
      this.syncQueue.push(job);
    }
  }

  /**
   * Start queue processor
   */
  private startQueueProcessor(): void {
    setInterval(() => {
      if (this.syncQueue.length > 0 && !this.isProcessingQueue) {
        this.processQueue().catch(error => {
          logger.error('Queue processing error:', error);
        });
      }
    }, 5000); // Check every 5 seconds
  }

  /**
   * Cancel sync job
   */
  async cancelSyncJob(jobId: string): Promise<void> {
    const job = await SyncJob.findOne({ syncJobId: jobId });
    
    if (!job) {
      throw new Error(`Sync job ${jobId} not found`);
    }
    
    await job.cancel();
    
    // Remove from queue
    this.syncQueue = this.syncQueue.filter(j => j.syncJobId !== jobId);
    
    // Remove from active jobs
    this.activeSyncJobs.delete(jobId);
    
    this.emit('sync:cancelled', { jobId });
  }

  /**
   * Get sync job status
   */
  async getSyncJobStatus(jobId: string): Promise<ISyncJob | null> {
    return await SyncJob.findOne({ syncJobId: jobId });
  }

  /**
   * Get active sync jobs
   */
  getActiveSyncJobs(): ISyncJob[] {
    return Array.from(this.activeSyncJobs.values());
  }

  /**
   * Get sync queue
   */
  getSyncQueue(): ISyncJob[] {
    return [...this.syncQueue];
  }

  /**
   * Get health details
   */
  protected async getHealthDetails(): Promise<any> {
    return {
      activeSyncJobs: this.activeSyncJobs.size,
      queueLength: this.syncQueue.length,
      isProcessingQueue: this.isProcessingQueue
    };
  }
}