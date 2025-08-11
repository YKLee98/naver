// packages/backend/src/services/activity/ActivityService.ts
import { Activity, type IActivity } from '../../models/Activity.js';
import { logger } from '../../utils/logger.js';
import { EventEmitter } from 'events';

export interface ActivityOptions {
  type:
    | 'sync'
    | 'inventory_update'
    | 'price_update'
    | 'mapping'
    | 'order'
    | 'system';
  action: string;
  details?: string;
  metadata?: Record<string, any>;
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  success?: boolean;
  errorMessage?: string;
  duration?: number;
}

export class ActivityService extends EventEmitter {
  constructor() {
    super();
  }

  /**
   * Log an activity
   */
  async log(options: ActivityOptions): Promise<IActivity> {
    try {
      const activity = await Activity.create({
        ...options,
        success: options.success !== false,
      });

      logger.debug('Activity logged:', {
        type: activity.type,
        action: activity.action,
        success: activity.success,
      });

      // Emit event when activity is created
      this.emit('activity:created', activity);

      return activity;
    } catch (error) {
      logger.error('Failed to log activity:', error);
      throw error;
    }
  }

  /**
   * Log sync activity
   */
  async logSync(
    action: string,
    details: string,
    metadata?: any,
    success: boolean = true,
    userId?: string
  ): Promise<IActivity> {
    const activity = await this.log({
      type: 'sync',
      action,
      details,
      metadata,
      success,
      userId,
    });

    // Emit specific sync activity event
    this.emit('activity:sync', activity);
    
    return activity;
  }

  /**
   * Log inventory update
   */
  async logInventoryUpdate(
    sku: string,
    action: string,
    changes: any,
    userId?: string
  ): Promise<IActivity> {
    const activity = await this.log({
      type: 'inventory_update',
      action,
      details: `Inventory updated for SKU: ${sku}`,
      metadata: { sku, changes },
      userId,
    });

    // Emit inventory update event
    this.emit('activity:inventory', activity);
    
    return activity;
  }

  /**
   * Log price update
   */
  async logPriceUpdate(
    sku: string,
    oldPrice: number,
    newPrice: number,
    platform: string,
    userId?: string
  ): Promise<IActivity> {
    const activity = await this.log({
      type: 'price_update',
      action: `Price updated on ${platform}`,
      details: `Price changed from ${oldPrice} to ${newPrice} for SKU: ${sku}`,
      metadata: { sku, oldPrice, newPrice, platform },
      userId,
    });

    // Emit price update event
    this.emit('activity:price', activity);
    
    return activity;
  }

  /**
   * Get recent activities
   */
  async getRecent(
    limit: number = 50,
    filters?: {
      type?: string;
      userId?: string;
      success?: boolean;
      startDate?: Date;
      endDate?: Date;
    }
  ): Promise<IActivity[]> {
    try {
      const query: any = {};

      if (filters) {
        if (filters.type) query.type = filters.type;
        if (filters.userId) query.userId = filters.userId;
        if (filters.success !== undefined) query.success = filters.success;

        if (filters.startDate || filters.endDate) {
          query.createdAt = {};
          if (filters.startDate) query.createdAt.$gte = filters.startDate;
          if (filters.endDate) query.createdAt.$lte = filters.endDate;
        }
      }

      const activities = await Activity.find(query)
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();

      return activities;
    } catch (error) {
      logger.error('Failed to get recent activities:', error);
      return [];
    }
  }

  /**
   * Get activity by ID
   */
  async getById(id: string): Promise<IActivity | null> {
    try {
      return await Activity.findById(id).lean();
    } catch (error) {
      logger.error('Failed to get activity by ID:', error);
      return null;
    }
  }

  /**
   * Get activity statistics
   */
  async getStatistics(startDate?: Date, endDate?: Date): Promise<any> {
    try {
      const query: any = {};

      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = startDate;
        if (endDate) query.createdAt.$lte = endDate;
      }

      const [totalCount, successCount, failureCount, byType, recentFailures] =
        await Promise.all([
          Activity.countDocuments(query),
          Activity.countDocuments({ ...query, success: true }),
          Activity.countDocuments({ ...query, success: false }),
          Activity.aggregate([
            { $match: query },
            { $group: { _id: '$type', count: { $sum: 1 } } },
          ]),
          Activity.find({ ...query, success: false })
            .sort({ createdAt: -1 })
            .limit(10)
            .lean(),
        ]);

      const typeStats = byType.reduce((acc: any, item: any) => {
        acc[item._id] = item.count;
        return acc;
      }, {});

      return {
        total: totalCount,
        success: successCount,
        failure: failureCount,
        successRate:
          totalCount > 0 ? ((successCount / totalCount) * 100).toFixed(2) : 0,
        byType: typeStats,
        recentFailures,
      };
    } catch (error) {
      logger.error('Failed to get activity statistics:', error);
      return {};
    }
  }

  /**
   * Get user activity summary
   */
  async getUserSummary(userId: string, days: number = 30): Promise<any> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const activities = await Activity.find({
        userId,
        createdAt: { $gte: startDate },
      }).lean();

      const summary = {
        totalActions: activities.length,
        successfulActions: activities.filter((a) => a.success).length,
        failedActions: activities.filter((a) => !a.success).length,
        byType: {} as Record<string, number>,
        byDay: {} as Record<string, number>,
        mostCommonActions: {} as Record<string, number>,
      };

      activities.forEach((activity) => {
        // Count by type
        summary.byType[activity.type] =
          (summary.byType[activity.type] || 0) + 1;

        // Count by day
        const day = activity.createdAt.toISOString().split('T')[0];
        summary.byDay[day] = (summary.byDay[day] || 0) + 1;

        // Count actions
        summary.mostCommonActions[activity.action] =
          (summary.mostCommonActions[activity.action] || 0) + 1;
      });

      // Sort and limit most common actions
      summary.mostCommonActions = Object.entries(summary.mostCommonActions)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .reduce(
          (acc, [key, value]) => {
            acc[key] = value;
            return acc;
          },
          {} as Record<string, number>
        );

      return summary;
    } catch (error) {
      logger.error('Failed to get user summary:', error);
      return {};
    }
  }

  /**
   * Clean old activities
   */
  async cleanOld(days: number = 90): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const result = await Activity.deleteMany({
        createdAt: { $lt: cutoffDate },
      });

      logger.info(`Cleaned ${result.deletedCount} old activities`);
      return result.deletedCount;
    } catch (error) {
      logger.error('Failed to clean old activities:', error);
      return 0;
    }
  }
}

export default ActivityService;
