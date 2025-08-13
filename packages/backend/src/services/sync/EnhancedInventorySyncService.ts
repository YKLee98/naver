// packages/backend/src/services/sync/EnhancedInventorySyncService.ts
import { NaverProductService } from '@/services/naver';
import { ShopifyInventoryService } from '@/services/shopify';
import { ProductMapping, InventoryTransaction, SyncHistory } from '@/models';
import { logger } from '@/utils/logger';
import { getRedisClient } from '@/config/redis';
import axios from 'axios';

interface InventoryData {
  sku: string;
  naverStock: number;
  shopifyStock: number;
  lastFetched: Date;
}

interface SyncResult {
  success: boolean;
  sku: string;
  previousNaver: number;
  previousShopify: number;
  currentNaver: number;
  currentShopify: number;
  synced: boolean;
  error?: string;
}

export class EnhancedInventorySyncService {
  private naverProductService: NaverProductService;
  private shopifyInventoryService: ShopifyInventoryService;
  private redis: any;
  private isRunning: boolean = false;
  private syncInterval: number = 5 * 60 * 1000; // 5분

  constructor(
    naverProductService: NaverProductService,
    shopifyInventoryService: ShopifyInventoryService
  ) {
    this.naverProductService = naverProductService;
    this.shopifyInventoryService = shopifyInventoryService;
    this.redis = getRedisClient();
  }

  /**
   * 네이버 Commerce API로 직접 재고 조회
   */
  private async fetchNaverInventory(productId: string, sku?: string): Promise<number> {
    try {
      // SKU로 검색 (searchProducts는 정상 작동)
      if (sku) {
        const searchResult = await this.naverProductService.searchProducts({
          searchKeyword: sku,
          searchType: 'SELLER_MANAGEMENT_CODE',
          page: 1,
          size: 10
        });
        
        if (searchResult?.contents) {
          // productId와 일치하는 상품 찾기
          for (const item of searchResult.contents) {
            // channelProducts 체크 (네이버 API 구조)
            if (item.channelProducts && Array.isArray(item.channelProducts)) {
              for (const channelProduct of item.channelProducts) {
                const prodId = String(channelProduct.channelProductNo || channelProduct.productNo || '');
                if (prodId === String(productId)) {
                  const stock = channelProduct.stockQuantity || 0;
                  logger.info(`✅ Fetched Naver inventory for ${sku} (${productId}): ${stock} via channel products`);
                  return stock;
                }
              }
            }
            
            // 직접 상품 체크
            const itemId = String(item.productNo || item.originProductNo || item.id || '');
            if (itemId === String(productId)) {
              const stock = item.stockQuantity || 0;
              logger.info(`✅ Fetched Naver inventory for ${sku} (${productId}): ${stock} via direct match`);
              return stock;
            }
          }
          
          // ID 매칭 실패 시 첫 번째 결과 사용 (SKU가 일치하므로)
          if (searchResult.contents.length > 0) {
            const firstItem = searchResult.contents[0];
            const stock = firstItem.stockQuantity || 0;
            logger.info(`✅ Fetched Naver inventory for ${sku}: ${stock} (using first match)`);
            return stock;
          }
        }
      }
      
      // SKU 검색 실패 시 0 반환 (getProduct는 순환 참조 오류)
      logger.warn(`Could not fetch Naver inventory for ${productId}, returning 0`);
      return 0;
    } catch (error: any) {
      logger.error(`Failed to fetch Naver inventory for ${productId}:`, {
        message: error.message || 'Unknown error'
      });
      return 0; // 오류 시 0 반환
    }
  }

  /**
   * Shopify API로 직접 재고 조회
   */
  private async fetchShopifyInventory(sku: string): Promise<number> {
    try {
      const stock = await this.shopifyInventoryService.getInventoryBySku(sku);
      logger.debug(`Fetched Shopify inventory for SKU ${sku}: ${stock}`);
      return stock;
    } catch (error: any) {
      logger.error(`Failed to fetch Shopify inventory for ${sku}:`, {
        message: error.message,
        code: error.code
      });
      throw error;
    }
  }

  /**
   * 단일 상품 재고 동기화 (API 직접 호출)
   */
  async syncSingleProductInventory(mapping: any): Promise<SyncResult> {
    const startTime = Date.now();
    const result: SyncResult = {
      success: false,
      sku: mapping.sku,
      previousNaver: 0,
      previousShopify: 0,
      currentNaver: 0,
      currentShopify: 0,
      synced: false,
    };

    try {
      // 이전 재고 정보 가져오기 (캐시에서)
      const cacheKey = `inventory:${mapping.sku}`;
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        const parsedCache = JSON.parse(cached);
        result.previousNaver = parsedCache.naverStock || 0;
        result.previousShopify = parsedCache.shopifyStock || 0;
      }

      // 네이버와 Shopify에서 현재 재고 조회 (병렬 처리)
      const [naverStock, shopifyStock] = await Promise.all([
        this.fetchNaverInventory(mapping.naverProductId, mapping.sku),
        this.fetchShopifyInventory(mapping.sku)
      ]);

      result.currentNaver = naverStock;
      result.currentShopify = shopifyStock;

      // 재고 불일치 체크
      const discrepancy = Math.abs(naverStock - shopifyStock);
      const syncDirection = mapping.syncDirection || 'bidirectional';

      // 동기화 필요 여부 판단
      if (discrepancy > 0) {
        logger.info(`Inventory discrepancy detected for ${mapping.sku}:`, {
          sku: mapping.sku,
          naverStock,
          shopifyStock,
          discrepancy,
          syncDirection
        });

        // 동기화 방향에 따라 처리
        if (syncDirection === 'naver_to_shopify') {
          // 네이버 → Shopify 동기화
          await this.shopifyInventoryService.updateInventoryBySku(mapping.sku, naverStock);
          result.currentShopify = naverStock;
          result.synced = true;
          
          await this.recordTransaction({
            sku: mapping.sku,
            platform: 'shopify',
            transactionType: 'sync',
            quantity: naverStock - shopifyStock,
            previousQuantity: shopifyStock,
            newQuantity: naverStock,
            reason: 'sync_from_naver',
            syncStatus: 'completed',
          });
        } else if (syncDirection === 'shopify_to_naver') {
          // Shopify → 네이버 동기화
          await this.naverProductService.updateProductStock(mapping.naverProductId, shopifyStock);
          result.currentNaver = shopifyStock;
          result.synced = true;
          
          await this.recordTransaction({
            sku: mapping.sku,
            platform: 'naver',
            transactionType: 'sync',
            quantity: shopifyStock - naverStock,
            previousQuantity: naverStock,
            newQuantity: shopifyStock,
            reason: 'sync_from_shopify',
            syncStatus: 'completed',
          });
        } else if (syncDirection === 'bidirectional') {
          // 양방향 동기화: 최신 업데이트 시간 기준으로 결정
          // 여기서는 더 높은 재고를 기준으로 동기화 (보수적 접근)
          const targetStock = Math.max(naverStock, shopifyStock);
          
          if (naverStock < targetStock) {
            await this.naverProductService.updateProductStock(mapping.naverProductId, targetStock);
            result.currentNaver = targetStock;
          }
          
          if (shopifyStock < targetStock) {
            await this.shopifyInventoryService.updateInventoryBySku(mapping.sku, targetStock);
            result.currentShopify = targetStock;
          }
          
          result.synced = true;
          
          await this.recordTransaction({
            sku: mapping.sku,
            platform: 'both',
            transactionType: 'sync',
            quantity: 0,
            previousQuantity: Math.min(naverStock, shopifyStock),
            newQuantity: targetStock,
            reason: 'bidirectional_sync',
            syncStatus: 'completed',
          });
        }
      }

      // 캐시 업데이트
      const inventoryData: InventoryData = {
        sku: mapping.sku,
        naverStock: result.currentNaver,
        shopifyStock: result.currentShopify,
        lastFetched: new Date(),
      };
      
      await this.redis.setex(cacheKey, 600, JSON.stringify(inventoryData)); // 10분 캐시

      // MongoDB 업데이트
      await ProductMapping.updateOne(
        { _id: mapping._id },
        {
          $set: {
            'inventory.naver.available': result.currentNaver,
            'inventory.shopify.available': result.currentShopify,
            'inventory.lastSync': new Date(),
            'inventory.discrepancy': Math.abs(result.currentNaver - result.currentShopify),
            'inventory.syncStatus': result.synced ? 'synced' : 'in_sync',
          },
        }
      );

      const duration = Date.now() - startTime;
      logger.info(`✅ Inventory sync completed for ${mapping.sku} in ${duration}ms`);
      
      result.success = true;
      return result;
    } catch (error: any) {
      logger.error(`Failed to sync inventory for ${mapping.sku}:`, error);
      result.error = error.message;
      
      // 실패 기록
      await this.recordTransaction({
        sku: mapping.sku,
        platform: 'both',
        transactionType: 'sync',
        quantity: 0,
        previousQuantity: result.previousNaver,
        newQuantity: result.previousNaver,
        reason: 'sync_failed',
        syncStatus: 'failed',
        errorMessage: error.message,
      });
      
      return result;
    }
  }

  /**
   * 전체 재고 동기화
   */
  async syncAllInventory(): Promise<any> {
    if (this.isRunning) {
      logger.warn('Inventory sync already running, skipping...');
      return { message: 'Sync already in progress' };
    }

    this.isRunning = true;
    const startTime = Date.now();
    
    try {
      logger.info('🔄 Starting full inventory sync...');
      
      // 활성 매핑 조회
      const mappings = await ProductMapping.find({
        isActive: true,
        status: { $ne: 'pending' },
      }).lean();

      if (mappings.length === 0) {
        logger.info('No active mappings found for inventory sync');
        return { 
          success: true, 
          message: 'No active mappings to sync',
          duration: Date.now() - startTime
        };
      }

      logger.info(`Found ${mappings.length} active mappings to sync`);
      
      // 병렬 처리를 위한 배치 크기 설정
      const batchSize = 10;
      const results: SyncResult[] = [];
      
      for (let i = 0; i < mappings.length; i += batchSize) {
        const batch = mappings.slice(i, i + batchSize);
        const batchResults = await Promise.allSettled(
          batch.map(mapping => this.syncSingleProductInventory(mapping))
        );
        
        batchResults.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            results.push(result.value);
          } else {
            results.push({
              success: false,
              sku: batch[index].sku,
              previousNaver: 0,
              previousShopify: 0,
              currentNaver: 0,
              currentShopify: 0,
              synced: false,
              error: result.reason?.message || 'Unknown error',
            });
          }
        });
        
        // 배치 간 딜레이 (API 레이트 리밋 고려)
        if (i + batchSize < mappings.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      const synced = results.filter(r => r.synced).length;
      const duration = Date.now() - startTime;

      // 동기화 히스토리 저장
      await SyncHistory.create({
        type: 'inventory',
        status: failed === 0 ? 'completed' : 'failed',
        jobId: `inventory_sync_${Date.now()}`,
        performance: {
          startTime: new Date(startTime),
          endTime: new Date(),
          duration,
        },
        itemsProcessed: results.length,
        itemsSucceeded: successful,
        itemsFailed: failed,
        itemsSynced: synced,
        details: {
          results: results.slice(0, 100), // 처음 100개만 저장
        },
      });

      // Redis에 마지막 동기화 정보 저장
      await this.redis.setex(
        'inventory:last_sync',
        3600,
        JSON.stringify({
          timestamp: new Date().toISOString(),
          duration,
          total: results.length,
          successful,
          failed,
          synced,
          nextRun: new Date(Date.now() + this.syncInterval).toISOString(),
        })
      );

      logger.info(`✅ Full inventory sync completed in ${duration}ms`, {
        total: results.length,
        successful,
        failed,
        synced,
      });

      return {
        success: true,
        duration,
        total: results.length,
        successful,
        failed,
        synced,
        results: results.slice(0, 10), // 처음 10개만 반환
      };
    } catch (error: any) {
      logger.error('Full inventory sync failed:', error);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * 트랜잭션 기록
   */
  private async recordTransaction(data: any): Promise<void> {
    try {
      // Generate unique transaction ID to avoid duplicate key errors
      const transactionData = {
        ...data,
        performedBy: 'system',
        createdAt: new Date(),
        // Add a unique identifier if orderId is not present
        metadata: {
          ...data.metadata,
          transactionId: `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        }
      };
      
      // Remove null orderId and orderLineItemId to avoid unique index conflicts
      if (!transactionData.orderId) {
        delete transactionData.orderId;
      }
      if (!transactionData.orderLineItemId) {
        delete transactionData.orderLineItemId;
      }
      
      await InventoryTransaction.create(transactionData);
    } catch (error) {
      logger.error('Failed to record inventory transaction:', error);
    }
  }

  /**
   * 실시간 재고 업데이트 (웹훅 등에서 호출)
   */
  async handleRealtimeUpdate(
    platform: 'naver' | 'shopify',
    sku: string,
    newQuantity: number,
    reason?: string
  ): Promise<void> {
    try {
      const mapping = await ProductMapping.findOne({ sku, isActive: true });
      if (!mapping) {
        logger.warn(`No mapping found for SKU: ${sku}`);
        return;
      }

      logger.info(`Handling realtime inventory update for ${sku} from ${platform}:`, {
        sku,
        platform,
        newQuantity,
        reason,
      });

      // 반대 플랫폼에 업데이트
      if (platform === 'naver') {
        await this.shopifyInventoryService.updateInventoryBySku(sku, newQuantity);
      } else {
        await this.naverProductService.updateProductStock(mapping.naverProductId, newQuantity);
      }

      // 캐시 무효화
      await this.redis.del(`inventory:${sku}`);

      // MongoDB 업데이트
      const updateData: any = {
        'inventory.lastSync': new Date(),
        'inventory.syncStatus': 'synced',
      };
      
      if (platform === 'naver') {
        updateData['inventory.naver.available'] = newQuantity;
        updateData['inventory.shopify.available'] = newQuantity;
      } else {
        updateData['inventory.shopify.available'] = newQuantity;
        updateData['inventory.naver.available'] = newQuantity;
      }

      await ProductMapping.updateOne({ _id: mapping._id }, { $set: updateData });

      // 트랜잭션 기록
      await this.recordTransaction({
        sku,
        platform,
        transactionType: 'realtime_update',
        quantity: newQuantity,
        previousQuantity: 0,
        newQuantity,
        reason: reason || 'realtime_sync',
        syncStatus: 'completed',
      });

      logger.info(`✅ Realtime inventory update completed for ${sku}`);
    } catch (error) {
      logger.error(`Failed to handle realtime update for ${sku}:`, error);
      throw error;
    }
  }

  /**
   * 동기화 상태 조회
   */
  async getSyncStatus(): Promise<any> {
    const lastSync = await this.redis.get('inventory:last_sync');
    const discrepancies = await ProductMapping.find({
      'inventory.discrepancy': { $gt: 0 },
      isActive: true,
    })
      .select('sku productName inventory.discrepancy')
      .limit(10)
      .lean();

    return {
      isRunning: this.isRunning,
      lastSync: lastSync ? JSON.parse(lastSync) : null,
      discrepancies,
      nextRun: new Date(Date.now() + this.syncInterval).toISOString(),
    };
  }

  /**
   * 재고 불일치 리포트 생성
   */
  async generateDiscrepancyReport(): Promise<any> {
    const discrepancies = await ProductMapping.find({
      'inventory.discrepancy': { $gt: 0 },
      isActive: true,
    })
      .select('sku productName inventory')
      .sort({ 'inventory.discrepancy': -1 })
      .lean();

    const criticalDiscrepancies = discrepancies.filter(
      d => d.inventory.discrepancy >= 10
    );

    const totalNaverStock = discrepancies.reduce(
      (sum, d) => sum + (d.inventory?.naver?.available || 0),
      0
    );

    const totalShopifyStock = discrepancies.reduce(
      (sum, d) => sum + (d.inventory?.shopify?.available || 0),
      0
    );

    return {
      timestamp: new Date().toISOString(),
      totalProducts: discrepancies.length,
      criticalCount: criticalDiscrepancies.length,
      totalNaverStock,
      totalShopifyStock,
      totalDiscrepancy: Math.abs(totalNaverStock - totalShopifyStock),
      criticalItems: criticalDiscrepancies.slice(0, 20),
    };
  }
}