// ===== 3. packages/backend/src/services/sync/SyncLockManager.ts =====
import { getRedisClient } from '../../config/redis';
import { logger } from '../../utils/logger';

export class SyncLockManager {
  private redis: any;
  private readonly LOCK_TTL = 60; // 60초
  
  constructor() {
    this.redis = getRedisClient();
  }
  
  /**
   * 동기화 락 획득
   */
  async acquireLock(sku: string, operation: string): Promise<boolean> {
    const lockKey = `sync:lock:${sku}:${operation}`;
    const lockValue = `${Date.now()}_${process.pid}`;
    
    try {
      // SET NX EX 사용 (존재하지 않을 때만 설정, TTL 포함)
      const result = await this.redis.set(
        lockKey, 
        lockValue, 
        'NX', 
        'EX', 
        this.LOCK_TTL
      );
      
      return result === 'OK';
    } catch (error) {
      logger.error(`Failed to acquire lock for ${lockKey}:`, error);
      return false;
    }
  }
  
  /**
   * 동기화 락 해제
   */
  async releaseLock(sku: string, operation: string): Promise<void> {
    const lockKey = `sync:lock:${sku}:${operation}`;
    
    try {
      await this.redis.del(lockKey);
    } catch (error) {
      logger.error(`Failed to release lock for ${lockKey}:`, error);
    }
  }
  
  /**
   * 락 상태 확인
   */
  async isLocked(sku: string, operation: string): Promise<boolean> {
    const lockKey = `sync:lock:${sku}:${operation}`;
    
    try {
      const exists = await this.redis.exists(lockKey);
      return exists === 1;
    } catch (error) {
      logger.error(`Failed to check lock status for ${lockKey}:`, error);
      return false;
    }
  }
}
