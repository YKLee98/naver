// packages/backend/src/routes/webhook.routes.ts
import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { logger } from '../utils/logger';
import { 
  ProductMapping, 
  WebhookLog, 
  InventoryTransaction,
  SyncActivity
} from '../models';
import { NaverProductService, NaverOrderService } from '../services/naver';
import { ShopifyBulkService } from '../services/shopify';
import { getRedisClient } from '../config/redis';
import { config } from '../config';
import Bull from 'bull';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// Redis Queue 설정
let orderQueue: Bull.Queue | null = null;
let inventoryQueue: Bull.Queue | null = null;

// Queue 초기화 함수
function initializeQueues() {
  if (!orderQueue) {
    orderQueue = new Bull('order-processing', {
      redis: {
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password
      },
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 1000,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000
        }
      }
    });
  }

  if (!inventoryQueue) {
    inventoryQueue = new Bull('inventory-sync', {
      redis: {
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password
      },
      defaultJobOptions: {
        removeOnComplete: 50,
        removeOnFail: 500,
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 1000
        }
      }
    });
  }
}

// Webhook 서명 검증 미들웨어
const verifyShopifyWebhook = (req: Request, res: Response, next: NextFunction) => {
  const hmacHeader = req.get('X-Shopify-Hmac-Sha256');
  const topic = req.get('X-Shopify-Topic');
  const domain = req.get('X-Shopify-Shop-Domain');
  const webhookId = req.get('X-Shopify-Webhook-Id');

  if (!hmacHeader || !topic || !webhookId) {
    logger.warn('Missing Shopify webhook headers', { 
      headers: req.headers,
      ip: req.ip 
    });
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // HMAC 검증
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET || '';
  const rawBody = JSON.stringify(req.body);
  const hash = crypto
    .createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('base64');

  if (hash !== hmacHeader) {
    logger.error('Invalid Shopify webhook signature', {
      expected: hmacHeader,
      calculated: hash,
      webhookId,
      topic
    });
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // 검증된 정보를 req에 추가
  (req as any).webhookInfo = {
    webhookId,
    topic,
    domain,
    timestamp: new Date()
  };

  next();
};

// 멱등성 체크 미들웨어
const checkIdempotency = async (req: Request, res: Response, next: NextFunction) => {
  const webhookId = (req as any).webhookInfo?.webhookId;
  
  if (!webhookId) {
    return next();
  }

  try {
    const redis = getRedisClient();
    const key = `webhook:processed:${webhookId}`;
    
    // 이미 처리된 웹훅인지 확인
    const exists = await redis.exists(key);
    if (exists) {
      logger.info('Duplicate webhook detected, skipping', { webhookId });
      return res.status(200).json({ 
        status: 'already_processed',
        webhookId 
      });
    }

    // 처리 중 표시 (30분 TTL)
    await redis.set(key, 'processing', 'EX', 1800);
    
    // 처리 완료 후 상태 업데이트를 위해 cleanup 함수 추가
    (req as any).markWebhookProcessed = async () => {
      await redis.set(key, 'completed', 'EX', 86400); // 24시간 보관
    };

    next();
  } catch (error) {
    logger.error('Idempotency check failed', { error, webhookId });
    // 에러 발생 시에도 계속 진행 (중복 처리 허용)
    next();
  }
};

// Webhook 로깅
const logWebhook = async (req: Request, type: string, status: string, error?: any) => {
  try {
    const webhookInfo = (req as any).webhookInfo;
    await WebhookLog.create({
      type,
      source: 'shopify',
      webhookId: webhookInfo?.webhookId,
      topic: webhookInfo?.topic,
      payload: req.body,
      status,
      error: error ? {
        message: error.message,
        stack: error.stack
      } : undefined,
      processedAt: new Date(),
      headers: req.headers,
      ip: req.ip
    });
  } catch (logError) {
    logger.error('Failed to log webhook', logError);
  }
};

// Shopify 상품 업데이트 웹훅
router.post('/shopify/products/update', 
  verifyShopifyWebhook,
  checkIdempotency,
  async (req: Request, res: Response) => {
    const startTime = Date.now();
    const webhookInfo = (req as any).webhookInfo;

    try {
      initializeQueues();
      const product = req.body;
      
      logger.info('Shopify product update webhook received', { 
        productId: product.id,
        sku: product.variants?.[0]?.sku,
        webhookId: webhookInfo.webhookId
      });

      // 상품 매핑 조회
      const mappings = await ProductMapping.find({
        shopifyProductId: product.id.toString(),
        status: 'ACTIVE'
      });

      if (mappings.length === 0) {
        logger.info('No active mapping found for Shopify product', { 
          productId: product.id 
        });
        await logWebhook(req, 'product_update', 'no_mapping');
        return res.status(200).json({ status: 'no_mapping' });
      }

      // 변경 사항 분석
      const updates = [];
      for (const variant of product.variants || []) {
        const mapping = mappings.find(m => 
          m.shopifyVariantId === variant.id.toString() || 
          m.sku === variant.sku
        );

        if (mapping) {
          updates.push({
            mappingId: mapping._id,
            sku: mapping.sku,
            naverProductId: mapping.naverProductId,
            changes: {
              price: variant.price,
              compareAtPrice: variant.compare_at_price,
              inventoryQuantity: variant.inventory_quantity,
              title: product.title,
              updatedAt: product.updated_at
            }
          });
        }
      }

      // Queue에 작업 추가
      if (updates.length > 0) {
        const jobId = uuidv4();
        await inventoryQueue!.add('sync-to-naver', {
          jobId,
          webhookId: webhookInfo.webhookId,
          updates,
          source: 'shopify_webhook',
          timestamp: new Date()
        }, {
          jobId,
          priority: 1
        });

        logger.info('Product updates queued for processing', {
          jobId,
          updateCount: updates.length,
          webhookId: webhookInfo.webhookId
        });
      }

      await (req as any).markWebhookProcessed?.();
      await logWebhook(req, 'product_update', 'success');

      const processingTime = Date.now() - startTime;
      res.status(200).json({ 
        status: 'queued',
        updatesCount: updates.length,
        processingTime
      });

    } catch (error) {
      logger.error('Shopify product webhook error:', error);
      await logWebhook(req, 'product_update', 'error', error);
      
      // Shopify에는 항상 200 응답 (재시도 방지)
      res.status(200).json({ 
        status: 'error_logged',
        error: 'Internal processing error'
      });
    }
  }
);

// Shopify 주문 생성 웹훅
router.post('/shopify/orders/create',
  verifyShopifyWebhook,
  checkIdempotency,
  async (req: Request, res: Response) => {
    const startTime = Date.now();
    const webhookInfo = (req as any).webhookInfo;

    try {
      initializeQueues();
      const order = req.body;
      
      logger.info('Shopify order created webhook received', { 
        orderId: order.id,
        orderNumber: order.order_number,
        totalPrice: order.total_price,
        itemCount: order.line_items?.length,
        webhookId: webhookInfo.webhookId
      });

      // 주문 아이템 분석
      const inventoryUpdates = [];
      for (const lineItem of order.line_items || []) {
        if (!lineItem.sku || !lineItem.quantity) continue;

        // 상품 매핑 조회
        const mapping = await ProductMapping.findOne({
          sku: lineItem.sku,
          status: 'ACTIVE'
        });

        if (mapping) {
          inventoryUpdates.push({
            sku: lineItem.sku,
            quantity: lineItem.quantity,
            naverProductId: mapping.naverProductId,
            productTitle: lineItem.title,
            variantTitle: lineItem.variant_title,
            price: lineItem.price,
            orderId: order.id,
            orderNumber: order.order_number
          });
        } else {
          logger.warn('No mapping found for order line item', {
            sku: lineItem.sku,
            orderId: order.id
          });
        }
      }

      // Queue에 작업 추가
      if (inventoryUpdates.length > 0) {
        const jobId = uuidv4();
        await orderQueue!.add('process-order', {
          jobId,
          webhookId: webhookInfo.webhookId,
          order: {
            id: order.id,
            orderNumber: order.order_number,
            customerEmail: order.email,
            totalPrice: order.total_price,
            currency: order.currency,
            financialStatus: order.financial_status,
            fulfillmentStatus: order.fulfillment_status,
            createdAt: order.created_at
          },
          inventoryUpdates,
          timestamp: new Date()
        }, {
          jobId,
          priority: 2 // 주문은 높은 우선순위
        });

        // 동기화 활동 기록
        await SyncActivity.create({
          type: 'ORDER_WEBHOOK',
          source: 'shopify',
          target: 'naver',
          status: 'queued',
          details: {
            orderId: order.id,
            orderNumber: order.order_number,
            itemsCount: inventoryUpdates.length,
            webhookId: webhookInfo.webhookId,
            jobId
          },
          metadata: {
            customerEmail: order.email,
            totalPrice: order.total_price
          }
        });

        logger.info('Order queued for inventory sync', {
          jobId,
          orderId: order.id,
          inventoryUpdateCount: inventoryUpdates.length
        });
      }

      await (req as any).markWebhookProcessed?.();
      await logWebhook(req, 'order_create', 'success');

      const processingTime = Date.now() - startTime;
      res.status(200).json({ 
        status: 'queued',
        inventoryUpdatesCount: inventoryUpdates.length,
        processingTime
      });

    } catch (error) {
      logger.error('Shopify order webhook error:', error);
      await logWebhook(req, 'order_create', 'error', error);
      
      res.status(200).json({ 
        status: 'error_logged',
        error: 'Internal processing error'
      });
    }
  }
);

// Shopify 주문 업데이트 웹훅 (취소, 환불 등)
router.post('/shopify/orders/updated',
  verifyShopifyWebhook,
  checkIdempotency,
  async (req: Request, res: Response) => {
    const webhookInfo = (req as any).webhookInfo;

    try {
      initializeQueues();
      const order = req.body;
      
      logger.info('Shopify order updated webhook received', { 
        orderId: order.id,
        financialStatus: order.financial_status,
        fulfillmentStatus: order.fulfillment_status,
        cancelledAt: order.cancelled_at,
        webhookId: webhookInfo.webhookId
      });

      // 주문 취소 처리
      if (order.cancelled_at) {
        const inventoryRestores = [];

        for (const lineItem of order.line_items || []) {
          if (!lineItem.sku || !lineItem.quantity) continue;

          const mapping = await ProductMapping.findOne({
            sku: lineItem.sku,
            status: 'ACTIVE'
          });

          if (mapping) {
            inventoryRestores.push({
              sku: lineItem.sku,
              quantity: lineItem.quantity,
              naverProductId: mapping.naverProductId,
              reason: 'order_cancelled',
              orderId: order.id,
              orderNumber: order.order_number
            });
          }
        }

        if (inventoryRestores.length > 0) {
          const jobId = uuidv4();
          await inventoryQueue!.add('restore-inventory', {
            jobId,
            webhookId: webhookInfo.webhookId,
            restores: inventoryRestores,
            order: {
              id: order.id,
              orderNumber: order.order_number,
              cancelReason: order.cancel_reason,
              cancelledAt: order.cancelled_at
            },
            timestamp: new Date()
          }, {
            jobId,
            priority: 1
          });

          logger.info('Order cancellation queued for inventory restore', {
            jobId,
            orderId: order.id,
            restoreCount: inventoryRestores.length
          });
        }
      }

      await (req as any).markWebhookProcessed?.();
      await logWebhook(req, 'order_update', 'success');

      res.status(200).json({ 
        status: 'processed',
        action: order.cancelled_at ? 'cancellation_queued' : 'no_action'
      });

    } catch (error) {
      logger.error('Shopify order update webhook error:', error);
      await logWebhook(req, 'order_update', 'error', error);
      
      res.status(200).json({ 
        status: 'error_logged',
        error: 'Internal processing error'
      });
    }
  }
);

// Shopify 재고 레벨 업데이트 웹훅
router.post('/shopify/inventory_levels/update',
  verifyShopifyWebhook,
  checkIdempotency,
  async (req: Request, res: Response) => {
    const webhookInfo = (req as any).webhookInfo;

    try {
      initializeQueues();
      const inventoryLevel = req.body;
      
      logger.info('Shopify inventory level update webhook received', { 
        inventoryItemId: inventoryLevel.inventory_item_id,
        locationId: inventoryLevel.location_id,
        available: inventoryLevel.available,
        webhookId: webhookInfo.webhookId
      });

      // 재고 아이템에 해당하는 SKU 찾기
      const redis = getRedisClient();
      const cacheKey = `inventory:item:${inventoryLevel.inventory_item_id}`;
      let sku = await redis.get(cacheKey);

      if (!sku) {
        // 캐시에 없으면 DB 조회
        const mapping = await ProductMapping.findOne({
          shopifyInventoryItemId: inventoryLevel.inventory_item_id.toString(),
          status: 'ACTIVE'
        });

        if (mapping) {
          sku = mapping.sku;
          // 캐시에 저장 (1시간)
          await redis.set(cacheKey, sku, 'EX', 3600);
        }
      }

      if (sku) {
        const jobId = uuidv4();
        await inventoryQueue!.add('sync-inventory-level', {
          jobId,
          webhookId: webhookInfo.webhookId,
          sku,
          inventoryItemId: inventoryLevel.inventory_item_id,
          locationId: inventoryLevel.location_id,
          available: inventoryLevel.available,
          timestamp: new Date()
        }, {
          jobId,
          priority: 2
        });

        logger.info('Inventory level update queued', {
          jobId,
          sku,
          available: inventoryLevel.available
        });
      } else {
        logger.warn('No SKU found for inventory item', {
          inventoryItemId: inventoryLevel.inventory_item_id
        });
      }

      await (req as any).markWebhookProcessed?.();
      await logWebhook(req, 'inventory_level_update', 'success');

      res.status(200).json({ 
        status: 'processed',
        sku
      });

    } catch (error) {
      logger.error('Shopify inventory level webhook error:', error);
      await logWebhook(req, 'inventory_level_update', 'error', error);
      
      res.status(200).json({ 
        status: 'error_logged',
        error: 'Internal processing error'
      });
    }
  }
);

// 네이버 주문 상태 알림 (폴링 방식이므로 실제로는 사용되지 않음)
// 하지만 향후 네이버가 웹훅을 지원할 경우를 대비
router.post('/naver/order/status', async (req: Request, res: Response) => {
  try {
    // 네이버 웹훅 인증 (향후 구현)
    const signature = req.get('X-Naver-Signature');
    if (!signature) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // 서명 검증 로직 (네이버가 제공하는 방식에 따라 구현)
    // ...

    const data = req.body;
    logger.info('Naver order status webhook received', data);

    // 주문 상태 처리 로직
    // ...

    res.status(200).json({ success: true });
  } catch (error) {
    logger.error('Naver webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Webhook 상태 확인 엔드포인트
router.get('/status', async (req: Request, res: Response) => {
  try {
    const redis = getRedisClient();
    
    // 최근 처리된 웹훅 통계
    const stats = {
      processed: await redis.get('webhook:stats:processed') || '0',
      failed: await redis.get('webhook:stats:failed') || '0',
      duplicates: await redis.get('webhook:stats:duplicates') || '0',
      lastProcessed: await redis.get('webhook:stats:last_processed')
    };

    // 최근 웹훅 로그
    const recentLogs = await WebhookLog.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .select('type status webhookId createdAt processedAt');

    // Queue 상태
    let queueStats = null;
    if (orderQueue && inventoryQueue) {
      queueStats = {
        orderQueue: {
          waiting: await orderQueue.getWaitingCount(),
          active: await orderQueue.getActiveCount(),
          completed: await orderQueue.getCompletedCount(),
          failed: await orderQueue.getFailedCount()
        },
        inventoryQueue: {
          waiting: await inventoryQueue.getWaitingCount(),
          active: await inventoryQueue.getActiveCount(),
          completed: await inventoryQueue.getCompletedCount(),
          failed: await inventoryQueue.getFailedCount()
        }
      };
    }

    res.json({
      status: 'healthy',
      stats,
      recentLogs,
      queueStats,
      timestamp: new Date()
    });

  } catch (error) {
    logger.error('Failed to get webhook status', error);
    res.status(500).json({ 
      status: 'error',
      error: 'Failed to retrieve status'
    });
  }
});

// 웹훅 재처리 엔드포인트 (관리자용)
router.post('/retry/:webhookId', async (req: Request, res: Response) => {
  try {
    const { webhookId } = req.params;
    
    // 웹훅 로그 조회
    const webhookLog = await WebhookLog.findOne({ webhookId });
    
    if (!webhookLog) {
      return res.status(404).json({ error: 'Webhook not found' });
    }

    if (webhookLog.status === 'success') {
      return res.status(400).json({ error: 'Webhook already processed successfully' });
    }

    // 멱등성 키 제거 (재처리 허용)
    const redis = getRedisClient();
    await redis.del(`webhook:processed:${webhookId}`);

    // 원본 페이로드로 재처리
    // 실제 구현에서는 webhook type에 따라 적절한 처리 로직 호출
    
    logger.info('Webhook reprocessing initiated', { webhookId });

    res.json({
      status: 'reprocessing',
      webhookId,
      originalType: webhookLog.type
    });

  } catch (error) {
    logger.error('Failed to retry webhook', error);
    res.status(500).json({ error: 'Failed to retry webhook' });
  }
});

// 웹훅 테스트 엔드포인트
router.post('/test', async (req: Request, res: Response) => {
  logger.info('Test webhook received', {
    body: req.body,
    headers: req.headers
  });
  
  res.status(200).json({ 
    received: true, 
    timestamp: new Date().toISOString(),
    echo: req.body
  });
});

export default router;