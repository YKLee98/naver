// packages/backend/src/jobs/InventorySyncJob.ts
import cron from 'node-cron';
import { ProductMapping } from '../models/index.js';
import { ServiceContainer } from '../services/ServiceContainer.js';
import { logger } from '../utils/logger.js';
import { getRedisClient } from '../config/redis.js';

export class InventorySyncJob {
  private job: cron.ScheduledTask | null = null;
  private container: ServiceContainer;
  private redis: any;
  private isRunning: boolean = false;

  constructor(container: ServiceContainer) {
    this.container = container;
    this.redis = getRedisClient();
  }

  /**
   * 크론 작업 시작 (5분마다 실행)
   */
  start(): void {
    // 5분마다 실행 (*/5 * * * *)
    this.job = cron.schedule('*/5 * * * *', async () => {
      await this.syncInventory();
    }, {
      scheduled: true,
      timezone: "Asia/Seoul"
    });

    logger.info('✅ Inventory sync cron job started (every 5 minutes)');
    
    // 즉시 한 번 실행
    this.syncInventory().catch(error => {
      logger.error('Initial inventory sync failed:', error);
    });
  }

  /**
   * 크론 작업 중지
   */
  stop(): void {
    if (this.job) {
      this.job.stop();
      this.job = null;
      logger.info('Inventory sync cron job stopped');
    }
  }

  /**
   * 재고 동기화 실행
   */
  private async syncInventory(): Promise<void> {
    // 이미 실행 중이면 스킵
    if (this.isRunning) {
      logger.info('Inventory sync already running, skipping...');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();
    
    logger.info('🔄 Starting scheduled inventory sync...');
    
    try {
      // 활성 매핑 조회
      const mappings = await ProductMapping.find({ 
        isActive: true,
        status: { $ne: 'pending' }
      }).lean();

      if (mappings.length === 0) {
        logger.info('No active mappings found for inventory sync');
        return;
      }

      logger.info(`Found ${mappings.length} active mappings to sync`);

      const results = {
        success: 0,
        failed: 0,
        skipped: 0,
        errors: [] as any[]
      };

      // 각 매핑에 대해 재고 정보 업데이트
      for (const mapping of mappings) {
        try {
          await this.syncSingleInventory(mapping);
          results.success++;
        } catch (error: any) {
          logger.error(`Failed to sync inventory for SKU ${mapping.sku}:`, error);
          results.failed++;
          results.errors.push({
            sku: mapping.sku,
            error: error.message
          });
        }
      }

      const duration = Date.now() - startTime;
      
      // Redis에 최근 동기화 정보 저장
      await this.redis.setex(
        'inventory:last_sync',
        3600, // 1시간 캐시
        JSON.stringify({
          timestamp: new Date().toISOString(),
          duration,
          results,
          nextRun: new Date(Date.now() + 5 * 60 * 1000).toISOString()
        })
      );

      logger.info(`✅ Inventory sync completed in ${duration}ms`, results);
      
    } catch (error) {
      logger.error('Inventory sync job failed:', error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * 단일 상품 재고 동기화
   */
  private async syncSingleInventory(mapping: any): Promise<void> {
    const { naverProductService, shopifyInventoryService } = this.container;
    
    if (!naverProductService || !shopifyInventoryService) {
      throw new Error('Inventory services not available');
    }

    let naverStock = 0;
    let shopifyStock = 0;
    let hasChanges = false;

    // 네이버 재고 조회
    if (mapping.naverProductId && mapping.naverProductId !== 'PENDING') {
      try {
        naverStock = await naverProductService.getInventory(mapping.naverProductId);
      } catch (error) {
        logger.warn(`Failed to get Naver inventory for ${mapping.sku}:`, error);
      }
    }

    // Shopify 재고 조회
    try {
      shopifyStock = await shopifyInventoryService.getInventoryBySku(mapping.sku);
    } catch (error) {
      logger.warn(`Failed to get Shopify inventory for ${mapping.sku}:`, error);
    }

    // MongoDB에 재고 정보 업데이트
    const updateData: any = {
      'inventory.naver.available': naverStock,
      'inventory.shopify.available': shopifyStock,
      'inventory.lastSync': new Date(),
    };

    // 재고 불일치 감지
    const discrepancy = Math.abs(naverStock - shopifyStock);
    if (discrepancy > 0) {
      updateData['inventory.discrepancy'] = discrepancy;
      updateData['inventory.syncStatus'] = 'out_of_sync';
      
      // 불일치가 크면 알림 (10개 이상 차이)
      if (discrepancy >= 10) {
        logger.warn(`⚠️ Large inventory discrepancy detected for SKU ${mapping.sku}:`, {
          sku: mapping.sku,
          productName: mapping.productName,
          naverStock,
          shopifyStock,
          discrepancy
        });
        
        // Redis에 알림 저장
        await this.redis.sadd('inventory:discrepancies', mapping.sku);
        await this.redis.setex(
          `inventory:discrepancy:${mapping.sku}`,
          3600,
          JSON.stringify({
            sku: mapping.sku,
            productName: mapping.productName,
            naverStock,
            shopifyStock,
            discrepancy,
            timestamp: new Date().toISOString()
          })
        );
      }
    } else {
      updateData['inventory.discrepancy'] = 0;
      updateData['inventory.syncStatus'] = 'synced';
    }

    // MongoDB 업데이트
    await ProductMapping.updateOne(
      { _id: mapping._id },
      { $set: updateData }
    );

    logger.debug(`Updated inventory for SKU ${mapping.sku}:`, {
      naverStock,
      shopifyStock,
      discrepancy
    });
  }

  /**
   * 수동 동기화 트리거
   */
  async triggerManualSync(): Promise<any> {
    if (this.isRunning) {
      return {
        success: false,
        message: 'Sync already in progress'
      };
    }

    logger.info('Manual inventory sync triggered');
    await this.syncInventory();
    
    return {
      success: true,
      message: 'Manual sync completed'
    };
  }

  /**
   * 동기화 상태 조회
   */
  async getStatus(): Promise<any> {
    const lastSync = await this.redis.get('inventory:last_sync');
    const discrepancies = await this.redis.smembers('inventory:discrepancies');
    
    return {
      isRunning: this.isRunning,
      lastSync: lastSync ? JSON.parse(lastSync) : null,
      discrepancies,
      cronStatus: this.job ? 'active' : 'inactive',
      nextRun: this.job ? new Date(Date.now() + 5 * 60 * 1000).toISOString() : null
    };
  }
}

export default InventorySyncJob;