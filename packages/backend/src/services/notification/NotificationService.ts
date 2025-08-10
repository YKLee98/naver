// packages/backend/src/services/notification/NotificationService.ts
import { Redis } from 'ioredis';
import { Server as SocketIOServer } from 'socket.io';
import { EventEmitter } from 'events';
import { logger } from '../../utils/logger.js';

export interface NotificationData {
  id?: string;
  type: 'info' | 'warning' | 'error' | 'success';
  title: string;
  message: string;
  metadata?: Record<string, any>;
  userId?: string;
  channel?: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  read?: boolean;
  createdAt?: Date;
}

export class NotificationService extends EventEmitter {
  private redis: Redis;
  private io?: SocketIOServer;
  private notificationTTL = 86400 * 7; // 7 days

  constructor(redis: Redis) {
    super();
    this.redis = redis;
  }

  setWebSocket(io: SocketIOServer): void {
    this.io = io;
    logger.info('WebSocket attached to NotificationService');
  }

  /**
   * Send notification
   */
  async send(notification: NotificationData): Promise<void> {
    try {
      const notificationId = notification.id || `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const fullNotification: NotificationData = {
        ...notification,
        id: notificationId,
        read: false,
        createdAt: new Date()
      };

      // Store in Redis
      const key = `notification:${notificationId}`;
      await this.redis.setex(
        key,
        this.notificationTTL,
        JSON.stringify(fullNotification)
      );

      // Add to user's notification list
      if (notification.userId) {
        const userKey = `user:${notification.userId}:notifications`;
        await this.redis.lpush(userKey, notificationId);
        await this.redis.ltrim(userKey, 0, 99); // Keep last 100 notifications
      }

      // Send via WebSocket if available
      if (this.io) {
        if (notification.userId) {
          this.io.to(`user:${notification.userId}`).emit('notification', fullNotification);
        }
        
        if (notification.channel) {
          this.io.to(notification.channel).emit('notification', fullNotification);
        }
        
        // Broadcast to admin channel for high priority
        if (notification.priority === 'high' || notification.priority === 'urgent') {
          this.io.to('admin').emit('notification', fullNotification);
        }
      }

      // Emit event for other services
      this.emit('notification:sent', fullNotification);

      logger.info('Notification sent:', {
        id: notificationId,
        type: notification.type,
        title: notification.title,
        userId: notification.userId
      });
    } catch (error) {
      logger.error('Failed to send notification:', error);
      throw error;
    }
  }

  /**
   * Send bulk notifications
   */
  async sendBulk(notifications: NotificationData[]): Promise<void> {
    const promises = notifications.map(notification => this.send(notification));
    await Promise.allSettled(promises);
  }

  /**
   * Get user notifications
   */
  async getUserNotifications(
    userId: string,
    options: { limit?: number; offset?: number; unreadOnly?: boolean } = {}
  ): Promise<NotificationData[]> {
    const { limit = 20, offset = 0, unreadOnly = false } = options;
    
    try {
      const userKey = `user:${userId}:notifications`;
      const notificationIds = await this.redis.lrange(userKey, offset, offset + limit - 1);
      
      const notifications: NotificationData[] = [];
      
      for (const id of notificationIds) {
        const key = `notification:${id}`;
        const data = await this.redis.get(key);
        
        if (data) {
          const notification = JSON.parse(data) as NotificationData;
          
          if (!unreadOnly || !notification.read) {
            notifications.push(notification);
          }
        }
      }
      
      return notifications;
    } catch (error) {
      logger.error('Failed to get user notifications:', error);
      return [];
    }
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string, userId?: string): Promise<void> {
    try {
      const key = `notification:${notificationId}`;
      const data = await this.redis.get(key);
      
      if (data) {
        const notification = JSON.parse(data) as NotificationData;
        notification.read = true;
        
        await this.redis.setex(
          key,
          this.notificationTTL,
          JSON.stringify(notification)
        );
        
        // Emit event
        this.emit('notification:read', { notificationId, userId });
        
        logger.info('Notification marked as read:', notificationId);
      }
    } catch (error) {
      logger.error('Failed to mark notification as read:', error);
    }
  }

  /**
   * Delete notification
   */
  async delete(notificationId: string, userId?: string): Promise<void> {
    try {
      const key = `notification:${notificationId}`;
      await this.redis.del(key);
      
      if (userId) {
        const userKey = `user:${userId}:notifications`;
        await this.redis.lrem(userKey, 0, notificationId);
      }
      
      logger.info('Notification deleted:', notificationId);
    } catch (error) {
      logger.error('Failed to delete notification:', error);
    }
  }

  /**
   * Send system notification
   */
  async sendSystemNotification(
    type: 'info' | 'warning' | 'error',
    title: string,
    message: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.send({
      type,
      title,
      message,
      metadata,
      channel: 'system',
      priority: type === 'error' ? 'high' : 'normal'
    });
  }

  /**
   * Send inventory alert
   */
  async sendInventoryAlert(sku: string, currentStock: number, threshold: number): Promise<void> {
    await this.send({
      type: 'warning',
      title: '재고 부족 경고',
      message: `SKU ${sku}의 재고가 ${currentStock}개로 임계값(${threshold})에 도달했습니다.`,
      metadata: { sku, currentStock, threshold },
      channel: 'inventory',
      priority: 'high'
    });
  }

  /**
   * Send sync notification
   */
  async sendSyncNotification(
    type: 'started' | 'completed' | 'failed',
    syncType: string,
    details?: any
  ): Promise<void> {
    const typeMap = {
      started: 'info' as const,
      completed: 'success' as const,
      failed: 'error' as const
    };

    const titleMap = {
      started: '동기화 시작',
      completed: '동기화 완료',
      failed: '동기화 실패'
    };

    await this.send({
      type: typeMap[type],
      title: titleMap[type],
      message: `${syncType} 동기화가 ${titleMap[type].toLowerCase()}되었습니다.`,
      metadata: details,
      channel: 'sync',
      priority: type === 'failed' ? 'high' : 'normal'
    });
  }

  /**
   * Get notification statistics
   */
  async getStatistics(userId?: string): Promise<any> {
    try {
      if (userId) {
        const notifications = await this.getUserNotifications(userId, { limit: 100 });
        
        return {
          total: notifications.length,
          unread: notifications.filter(n => !n.read).length,
          byType: {
            info: notifications.filter(n => n.type === 'info').length,
            warning: notifications.filter(n => n.type === 'warning').length,
            error: notifications.filter(n => n.type === 'error').length,
            success: notifications.filter(n => n.type === 'success').length
          }
        };
      }
      
      // Global statistics would require scanning all keys
      return {
        message: 'Global statistics not implemented'
      };
    } catch (error) {
      logger.error('Failed to get notification statistics:', error);
      return {};
    }
  }

  /**
   * Cleanup old notifications
   */
  async cleanup(): Promise<void> {
    // Redis TTL handles cleanup automatically
    logger.info('NotificationService cleanup completed');
  }
}

export default NotificationService;