// ===== 4. packages/backend/src/jobs/autoRecovery.ts =====
import { CronJob } from 'cron';
import { ProductMapping } from '../models';
import { logger } from '../utils/logger';
import { NaverProductService } from '../services/naver';
import { ShopifyGraphQLService } from '../services/shopify';

export class AutoRecoveryJob {
  private job: CronJob;
  private naverProductService: NaverProductService;
  private shopifyGraphQLService: ShopifyGraphQLService;
  
  constructor(
    naverProductService: NaverProductService,
    shopifyGraphQLService: ShopifyGraphQLService
  ) {
    this.naverProductService = naverProductService;
    this.shopifyGraphQLService = shopifyGraphQLService;
    
    // 매 30분마다 실행
    this.job = new CronJob('*/30 * * * *', async () => {
      await this.recoverPendingMappings();
    });
  }
  
  start() {
    this.job.start();
    logger.info('Auto recovery job started');
  }
  
  stop() {
    this.job.stop();
    logger.info('Auto recovery job stopped');
  }
  
  /**
   * PENDING 상태의 매핑 자동 복구
   */
  private async recoverPendingMappings() {
    try {
      const pendingMappings = await ProductMapping.findPendingMappings(10);
      
      logger.info(`Found ${pendingMappings.length} pending mappings to recover`);
      
      for (const mapping of pendingMappings) {
        try {
          await this.recoverSingleMapping(mapping);
        } catch (error) {
          logger.error(`Failed to recover mapping ${mapping.sku}:`, error);
        }
      }
    } catch (error) {
      logger.error('Error in auto recovery job:', error);
    }
  }
  
  /**
   * 단일 매핑 복구
   */
  private async recoverSingleMapping(mapping: any) {
    logger.info(`Attempting to recover mapping: ${mapping.sku}`);
    
    let updated = false;
    
    // 네이버 ID가 PENDING인 경우 재검색
    if (mapping.naverProductId === 'PENDING') {
      try {
        const products = await this.naverProductService.searchProducts({ 
          keyword: mapping.sku 
        });
        
        if (products.items && products.items.length > 0) {
          const product = products.items[0];
          mapping.naverProductId = product.productId;
          mapping.productName = product.name;
          updated = true;
        }
      } catch (error) {
        logger.warn(`Failed to search Naver product for ${mapping.sku}:`, error);
      }
    }
    
    // Shopify ID가 PENDING인 경우 재검색
    if (mapping.shopifyProductId === 'PENDING' || mapping.shopifyVariantId === 'PENDING') {
      try {
        const query = `
          query searchProductsBySku($query: String!) {
            products(first: 1, query: $query) {
              edges {
                node {
                  id
                  variants(first: 1) {
                    edges {
                      node {
                        id
                        inventoryItem {
                          id
                          inventoryLevels(first: 1) {
                            edges {
                              node {
                                location {
                                  id
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        `;
        
        const response = await this.shopifyGraphQLService.query(query, { 
          query: `sku:${mapping.sku}` 
        });
        
        if (response.data?.products?.edges?.length > 0) {
          const product = response.data.products.edges[0].node;
          const variant = product.variants.edges[0]?.node;
          
          if (variant) {
            mapping.shopifyProductId = product.id.split('/').pop();
            mapping.shopifyVariantId = variant.id.split('/').pop();
            mapping.shopifyInventoryItemId = variant.inventoryItem?.id?.split('/').pop() || null;
            mapping.shopifyLocationId = variant.inventoryItem?.inventoryLevels?.edges[0]?.node?.location?.id?.split('/').pop() || null;
            updated = true;
          }
        }
      } catch (error) {
        logger.warn(`Failed to search Shopify product for ${mapping.sku}:`, error);
      }
    }
    
    // 모든 필수 정보가 있으면 ACTIVE로 변경
    if (updated && 
        mapping.naverProductId !== 'PENDING' && 
        mapping.shopifyProductId !== 'PENDING' && 
        mapping.shopifyVariantId !== 'PENDING') {
      mapping.status = 'ACTIVE';
      mapping.isActive = true;
      logger.info(`Mapping ${mapping.sku} recovered successfully`);
    }
    
    // 재시도 카운트 증가
    mapping.retryCount = (mapping.retryCount || 0) + 1;
    mapping.lastRetryAt = new Date();
    
    await mapping.save();
  }
}
