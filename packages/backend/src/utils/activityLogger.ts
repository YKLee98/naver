// ===== 5. packages/backend/src/utils/activityLogger.ts =====
import { Activity } from '../models/Activity.js';
import { logger } from './logger.js';

export class ActivityLogger {
  /**
   * Log a sync activity
   */
  static async logSync(
    action: string,
    details: string,
    metadata?: any,
    userId?: string
  ) {
    try {
      await Activity.create({
        type: 'sync',
        action,
        details,
        metadata,
        userId,
      });
    } catch (error) {
      logger.error('Failed to log sync activity:', error);
    }
  }

  /**
   * Log an inventory update activity
   */
  static async logInventoryUpdate(
    action: string,
    details: string,
    metadata?: any,
    userId?: string
  ) {
    try {
      await Activity.create({
        type: 'inventory_update',
        action,
        details,
        metadata,
        userId,
      });
    } catch (error) {
      logger.error('Failed to log inventory activity:', error);
    }
  }

  /**
   * Log a price update activity
   */
  static async logPriceUpdate(
    action: string,
    details: string,
    metadata?: any,
    userId?: string
  ) {
    try {
      await Activity.create({
        type: 'price_update',
        action,
        details,
        metadata,
        userId,
      });
    } catch (error) {
      logger.error('Failed to log price activity:', error);
    }
  }

  /**
   * Log a mapping change activity
   */
  static async logMappingChange(
    action: string,
    details: string,
    metadata?: any,
    userId?: string
  ) {
    try {
      await Activity.create({
        type: 'mapping_change',
        action,
        details,
        metadata,
        userId,
      });
    } catch (error) {
      logger.error('Failed to log mapping activity:', error);
    }
  }

  /**
   * Log an error activity
   */
  static async logError(
    action: string,
    details: string,
    metadata?: any,
    userId?: string
  ) {
    try {
      await Activity.create({
        type: 'error',
        action,
        details,
        metadata,
        userId,
      });
    } catch (error) {
      logger.error('Failed to log error activity:', error);
    }
  }

  /**
   * Generic activity logging
   */
  static async log(
    type:
      | 'sync'
      | 'inventory_update'
      | 'price_update'
      | 'mapping_change'
      | 'error',
    action: string,
    details: string,
    metadata?: any,
    userId?: string
  ) {
    try {
      await Activity.create({
        type,
        action,
        details,
        metadata,
        userId,
      });
    } catch (error) {
      logger.error('Failed to log activity:', error);
    }
  }
}
