// packages/backend/src/services/monitoring/InventoryMonitoringService.ts

import { EventEmitter } from 'events';
import { Redis } from 'ioredis';
import { logger } from '../../utils/logger.js';
import { ProductMapping } from '../../models/ProductMapping.js';
import { InventoryTransaction } from '../../models/InventoryTransaction.js';
import { Activity } from '../../models/Activity.js';

export interface InventoryAlert {
  id: string;
  type: 'sync_failed' | 'discrepancy' | 'low_stock' | 'out_of_stock' | 'update_failed';
  severity: 'low' | 'medium' | 'high' | 'critical';
  sku: string;
  productName?: string;
  message: string;
  details: {
    naverStock?: number;
    shopifyStock?: number;
    discrepancy?: number;
    threshold?: number;
    error?: string;
    attempts?: number;
  };
  timestamp: Date;
  resolved: boolean;
}

export interface InventorySyncStatus {
  sku: string;
  lastSyncAt: Date;
  status: 'success' | 'failed' | 'pending' | 'in_progress';
  naverStatus: {
    lastUpdate: Date | null;
    success: boolean;
    error?: string;
  };
  shopifyStatus: {
    lastUpdate: Date | null;
    success: boolean;
    error?: string;
  };
  retryCount: number;
  nextRetryAt?: Date;
}

export interface InventoryMetrics {
  totalSKUs: number;
  syncedSKUs: number;
  outOfSyncSKUs: number;
  lowStockSKUs: number;
  outOfStockSKUs: number;
  syncSuccessRate: number;
  averageSyncTime: number;
  lastSyncTime: Date | null;
  alerts: {
    total: number;
    unresolved: number;
    critical: number;
  };
}

/**
 * 엔터프라이즈급 재고 모니터링 서비스
 */
export class InventoryMonitoringService extends EventEmitter {
  private redis: Redis;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private alertCheckInterval: NodeJS.Timeout | null = null;
  private readonly MONITORING_KEY_PREFIX = 'inventory:monitoring:';
  private readonly ALERT_KEY_PREFIX = 'inventory:alerts:';
  private readonly METRICS_KEY = 'inventory:metrics';
  private readonly SYNC_STATUS_PREFIX = 'inventory:sync:status:';

  constructor(redis: Redis) {
    super();
    this.redis = redis;
  }

  /**
   * 모니터링 시작
   */
  async startMonitoring(intervalMs: number = 60000): Promise<void> {
    logger.info('🚀 Starting inventory monitoring service');

    // 기존 인터벌 정리
    this.stopMonitoring();

    // 초기 메트릭 수집
    await this.collectMetrics();

    // 정기적인 모니터링 시작
    this.monitoringInterval = setInterval(async () => {
      try {
        await this.performMonitoringCycle();
      } catch (error) {
        logger.error('Error in monitoring cycle:', error);
      }
    }, intervalMs);

    // 알림 체크 (5분마다)
    this.alertCheckInterval = setInterval(async () => {
      try {
        await this.checkAlerts();
      } catch (error) {
        logger.error('Error checking alerts:', error);
      }
    }, 300000);

    logger.info('✅ Inventory monitoring service started');
  }

  /**
   * 모니터링 중지
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    if (this.alertCheckInterval) {
      clearInterval(this.alertCheckInterval);
      this.alertCheckInterval = null;
    }
    logger.info('🛑 Inventory monitoring service stopped');
  }

  /**
   * 모니터링 사이클 수행
   */
  private async performMonitoringCycle(): Promise<void> {
    logger.debug('Performing monitoring cycle');

    // 1. 메트릭 수집
    const metrics = await this.collectMetrics();

    // 2. 동기화 상태 체크
    await this.checkSyncStatus();

    // 3. 재고 불일치 체크
    await this.checkDiscrepancies();

    // 4. 재고 부족 체크
    await this.checkLowStock();

    // 5. 메트릭 저장
    await this.saveMetrics(metrics);

    // 6. 이벤트 발생
    this.emit('monitoring:cycle:complete', metrics);
  }

  /**
   * 메트릭 수집
   */
  private async collectMetrics(): Promise<InventoryMetrics> {
    try {
      const mappings = await ProductMapping.find({ isActive: true }).lean();
      const recentTransactions = await InventoryTransaction.find({
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      }).lean();

      let syncedCount = 0;
      let outOfSyncCount = 0;
      let lowStockCount = 0;
      let outOfStockCount = 0;

      for (const mapping of mappings) {
        const naverStock = mapping.inventory?.naver?.available || 0;
        const shopifyStock = mapping.inventory?.shopify?.available || 0;
        const discrepancy = Math.abs(naverStock - shopifyStock);

        if (discrepancy === 0) {
          syncedCount++;
        } else {
          outOfSyncCount++;
        }

        if (naverStock === 0 || shopifyStock === 0) {
          outOfStockCount++;
        } else if (naverStock < 10 || shopifyStock < 10) {
          lowStockCount++;
        }
      }

      // 알림 통계
      const alertKeys = await this.redis.keys(`${this.ALERT_KEY_PREFIX}*`);
      const alerts = await Promise.all(
        alertKeys.map(key => this.redis.get(key).then(data => data ? JSON.parse(data) : null))
      );
      const validAlerts = alerts.filter(Boolean) as InventoryAlert[];
      const unresolvedAlerts = validAlerts.filter(a => !a.resolved);
      const criticalAlerts = unresolvedAlerts.filter(a => a.severity === 'critical');

      // 동기화 성공률 계산
      const successfulSyncs = recentTransactions.filter(t => t.status === 'success').length;
      const totalSyncs = recentTransactions.length;
      const syncSuccessRate = totalSyncs > 0 ? (successfulSyncs / totalSyncs) * 100 : 100;

      // 평균 동기화 시간 계산 (모의 데이터)
      const averageSyncTime = 2500; // milliseconds

      const metrics: InventoryMetrics = {
        totalSKUs: mappings.length,
        syncedSKUs: syncedCount,
        outOfSyncSKUs: outOfSyncCount,
        lowStockSKUs: lowStockCount,
        outOfStockSKUs: outOfStockCount,
        syncSuccessRate,
        averageSyncTime,
        lastSyncTime: new Date(),
        alerts: {
          total: validAlerts.length,
          unresolved: unresolvedAlerts.length,
          critical: criticalAlerts.length
        }
      };

      logger.debug('Metrics collected:', metrics);
      return metrics;
    } catch (error) {
      logger.error('Error collecting metrics:', error);
      throw error;
    }
  }

  /**
   * 동기화 상태 체크
   */
  private async checkSyncStatus(): Promise<void> {
    try {
      const mappings = await ProductMapping.find({ isActive: true }).lean();

      for (const mapping of mappings) {
        const statusKey = `${this.SYNC_STATUS_PREFIX}${mapping.sku}`;
        const lastSync = mapping.inventory?.lastSync || mapping.updatedAt;
        const timeSinceSync = Date.now() - new Date(lastSync).getTime();

        // 1시간 이상 동기화되지 않은 경우 경고
        if (timeSinceSync > 60 * 60 * 1000) {
          await this.createAlert({
            type: 'sync_failed',
            severity: timeSinceSync > 3 * 60 * 60 * 1000 ? 'high' : 'medium',
            sku: mapping.sku,
            productName: mapping.productName,
            message: `SKU ${mapping.sku} has not been synced for ${Math.floor(timeSinceSync / (60 * 60 * 1000))} hours`,
            details: {
              naverStock: mapping.inventory?.naver?.available,
              shopifyStock: mapping.inventory?.shopify?.available
            }
          });
        }

        // 동기화 상태 저장
        const syncStatus: InventorySyncStatus = {
          sku: mapping.sku,
          lastSyncAt: new Date(lastSync),
          status: mapping.syncStatus === 'synced' ? 'success' : 'failed',
          naverStatus: {
            lastUpdate: mapping.inventory?.naver?.lastUpdate || null,
            success: true
          },
          shopifyStatus: {
            lastUpdate: mapping.inventory?.shopify?.lastUpdate || null,
            success: true
          },
          retryCount: 0
        };

        await this.redis.setex(
          statusKey,
          3600, // 1시간 TTL
          JSON.stringify(syncStatus)
        );
      }
    } catch (error) {
      logger.error('Error checking sync status:', error);
    }
  }

  /**
   * 재고 불일치 체크
   */
  private async checkDiscrepancies(): Promise<void> {
    try {
      const mappings = await ProductMapping.find({ isActive: true }).lean();

      for (const mapping of mappings) {
        const naverStock = mapping.inventory?.naver?.available || 0;
        const shopifyStock = mapping.inventory?.shopify?.available || 0;
        const discrepancy = Math.abs(naverStock - shopifyStock);

        // 재고 차이가 5개 이상인 경우 알림
        if (discrepancy >= 5) {
          const severity = discrepancy >= 20 ? 'high' : discrepancy >= 10 ? 'medium' : 'low';
          
          await this.createAlert({
            type: 'discrepancy',
            severity,
            sku: mapping.sku,
            productName: mapping.productName,
            message: `Inventory discrepancy detected for SKU ${mapping.sku}: Naver(${naverStock}) vs Shopify(${shopifyStock})`,
            details: {
              naverStock,
              shopifyStock,
              discrepancy
            }
          });
        }
      }
    } catch (error) {
      logger.error('Error checking discrepancies:', error);
    }
  }

  /**
   * 재고 부족 체크
   */
  private async checkLowStock(): Promise<void> {
    try {
      const mappings = await ProductMapping.find({ isActive: true }).lean();
      const lowStockThreshold = 10;
      const criticalStockThreshold = 5;

      for (const mapping of mappings) {
        const naverStock = mapping.inventory?.naver?.available || 0;
        const shopifyStock = mapping.inventory?.shopify?.available || 0;
        const minStock = Math.min(naverStock, shopifyStock);

        if (minStock === 0) {
          // 품절 알림
          await this.createAlert({
            type: 'out_of_stock',
            severity: 'critical',
            sku: mapping.sku,
            productName: mapping.productName,
            message: `Out of stock: SKU ${mapping.sku}`,
            details: {
              naverStock,
              shopifyStock,
              threshold: 0
            }
          });
        } else if (minStock <= criticalStockThreshold) {
          // 위험 수준 재고 부족
          await this.createAlert({
            type: 'low_stock',
            severity: 'high',
            sku: mapping.sku,
            productName: mapping.productName,
            message: `Critical low stock: SKU ${mapping.sku} (${minStock} units)`,
            details: {
              naverStock,
              shopifyStock,
              threshold: criticalStockThreshold
            }
          });
        } else if (minStock <= lowStockThreshold) {
          // 일반 재고 부족
          await this.createAlert({
            type: 'low_stock',
            severity: 'medium',
            sku: mapping.sku,
            productName: mapping.productName,
            message: `Low stock warning: SKU ${mapping.sku} (${minStock} units)`,
            details: {
              naverStock,
              shopifyStock,
              threshold: lowStockThreshold
            }
          });
        }
      }
    } catch (error) {
      logger.error('Error checking low stock:', error);
    }
  }

  /**
   * 알림 생성
   */
  private async createAlert(alertData: Omit<InventoryAlert, 'id' | 'timestamp' | 'resolved'>): Promise<void> {
    try {
      const alertId = `${alertData.type}_${alertData.sku}_${Date.now()}`;
      const alert: InventoryAlert = {
        id: alertId,
        ...alertData,
        timestamp: new Date(),
        resolved: false
      };

      // Redis에 저장 (24시간 TTL)
      await this.redis.setex(
        `${this.ALERT_KEY_PREFIX}${alertId}`,
        86400,
        JSON.stringify(alert)
      );

      // 활동 로그 생성
      await Activity.create({
        type: 'inventory_alert',
        entity: 'Inventory',
        entityId: alertData.sku,
        action: alertData.type,
        metadata: alert,
        status: 'active'
      });

      // 이벤트 발생
      this.emit('alert:created', alert);

      // 심각도가 high 이상인 경우 즉시 알림
      if (alert.severity === 'high' || alert.severity === 'critical') {
        logger.warn(`⚠️ ${alert.severity.toUpperCase()} Alert: ${alert.message}`, alert.details);
      }
    } catch (error) {
      logger.error('Error creating alert:', error);
    }
  }

  /**
   * 알림 체크
   */
  private async checkAlerts(): Promise<void> {
    try {
      const alertKeys = await this.redis.keys(`${this.ALERT_KEY_PREFIX}*`);
      const now = Date.now();

      for (const key of alertKeys) {
        const alertData = await this.redis.get(key);
        if (!alertData) continue;

        const alert = JSON.parse(alertData) as InventoryAlert;
        const alertAge = now - new Date(alert.timestamp).getTime();

        // 24시간 이상 된 미해결 알림은 자동 해결
        if (!alert.resolved && alertAge > 24 * 60 * 60 * 1000) {
          alert.resolved = true;
          await this.redis.setex(key, 3600, JSON.stringify(alert)); // 1시간 후 삭제
          logger.info(`Auto-resolved old alert: ${alert.id}`);
        }
      }
    } catch (error) {
      logger.error('Error checking alerts:', error);
    }
  }

  /**
   * 메트릭 저장
   */
  private async saveMetrics(metrics: InventoryMetrics): Promise<void> {
    try {
      await this.redis.set(this.METRICS_KEY, JSON.stringify(metrics));
      logger.debug('Metrics saved to Redis');
    } catch (error) {
      logger.error('Error saving metrics:', error);
    }
  }

  /**
   * 메트릭 조회
   */
  async getMetrics(): Promise<InventoryMetrics | null> {
    try {
      const data = await this.redis.get(this.METRICS_KEY);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logger.error('Error getting metrics:', error);
      return null;
    }
  }

  /**
   * 알림 목록 조회
   */
  async getAlerts(unResolvedOnly: boolean = false): Promise<InventoryAlert[]> {
    try {
      const alertKeys = await this.redis.keys(`${this.ALERT_KEY_PREFIX}*`);
      const alerts = await Promise.all(
        alertKeys.map(key => this.redis.get(key).then(data => data ? JSON.parse(data) : null))
      );

      let validAlerts = alerts.filter(Boolean) as InventoryAlert[];
      
      if (unResolvedOnly) {
        validAlerts = validAlerts.filter(a => !a.resolved);
      }

      // 시간순 정렬 (최신 먼저)
      validAlerts.sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      return validAlerts;
    } catch (error) {
      logger.error('Error getting alerts:', error);
      return [];
    }
  }

  /**
   * 알림 해결
   */
  async resolveAlert(alertId: string): Promise<boolean> {
    try {
      const key = `${this.ALERT_KEY_PREFIX}${alertId}`;
      const alertData = await this.redis.get(key);
      
      if (!alertData) {
        logger.warn(`Alert not found: ${alertId}`);
        return false;
      }

      const alert = JSON.parse(alertData) as InventoryAlert;
      alert.resolved = true;

      // 1시간 후 삭제되도록 TTL 설정
      await this.redis.setex(key, 3600, JSON.stringify(alert));
      
      logger.info(`Alert resolved: ${alertId}`);
      this.emit('alert:resolved', alert);
      
      return true;
    } catch (error) {
      logger.error('Error resolving alert:', error);
      return false;
    }
  }

  /**
   * 특정 SKU의 동기화 상태 조회
   */
  async getSyncStatus(sku: string): Promise<InventorySyncStatus | null> {
    try {
      const statusKey = `${this.SYNC_STATUS_PREFIX}${sku}`;
      const data = await this.redis.get(statusKey);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logger.error(`Error getting sync status for ${sku}:`, error);
      return null;
    }
  }

  /**
   * 재고 업데이트 실패 기록
   */
  async recordUpdateFailure(
    sku: string,
    platform: 'naver' | 'shopify',
    error: string,
    attemptNumber: number = 1
  ): Promise<void> {
    try {
      await this.createAlert({
        type: 'update_failed',
        severity: attemptNumber >= 3 ? 'high' : 'medium',
        sku,
        message: `Failed to update ${platform} inventory for SKU ${sku}`,
        details: {
          error,
          attempts: attemptNumber
        }
      });

      // 실패 이력 저장
      await InventoryTransaction.create({
        sku,
        type: 'adjustment',
        transactionType: 'update_failed',
        platform,
        status: 'failed',
        error,
        metadata: {
          attemptNumber,
          platform,
          error
        }
      });
    } catch (err) {
      logger.error('Error recording update failure:', err);
    }
  }
}