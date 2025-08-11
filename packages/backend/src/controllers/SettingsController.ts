// ===== 3. packages/backend/src/controllers/SettingsController.ts =====
import { Request, Response, NextFunction } from 'express';
import { Settings } from '../models/index.js';
import { logger } from '../utils/logger.js';

export class SettingsController {
  /**
   * Get current settings
   */
  async getSettings(req: Request, res: Response, next: NextFunction) {
    try {
      const settings = await Settings.findOne().lean();

      if (!settings) {
        // Create default settings
        const defaultSettings = await Settings.create({
          syncInterval: 60, // 60 minutes
          autoSync: false,
          lowStockThreshold: 10,
          exchangeRateMode: 'api',
          customExchangeRate: 1300,
          defaultMargin: 15,
          notificationEmail: '',
          webhookUrl: '',
          timezone: 'Asia/Seoul',
        });

        return res.json({
          success: true,
          data: defaultSettings,
        });
      }

      res.json({
        success: true,
        data: settings,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update settings
   */
  async updateSettings(req: Request, res: Response, next: NextFunction) {
    try {
      const updates = req.body;

      // Validate settings
      if (updates.syncInterval && updates.syncInterval < 5) {
        return res.status(400).json({
          success: false,
          error: { message: '동기화 간격은 최소 5분 이상이어야 합니다.' },
        });
      }

      if (updates.lowStockThreshold && updates.lowStockThreshold < 0) {
        return res.status(400).json({
          success: false,
          error: { message: '재고 임계값은 0 이상이어야 합니다.' },
        });
      }

      if (
        updates.defaultMargin &&
        (updates.defaultMargin < 0 || updates.defaultMargin > 100)
      ) {
        return res.status(400).json({
          success: false,
          error: { message: '기본 마진율은 0-100% 사이여야 합니다.' },
        });
      }

      const settings = await Settings.findOneAndUpdate(
        {},
        { $set: updates },
        { new: true, upsert: true }
      );

      logger.info('Settings updated', { updates });

      res.json({
        success: true,
        data: settings,
        message: '설정이 업데이트되었습니다.',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Reset settings to default
   */
  async resetSettings(req: Request, res: Response, next: NextFunction) {
    try {
      const defaultSettings = {
        syncInterval: 60,
        autoSync: false,
        lowStockThreshold: 10,
        exchangeRateMode: 'api',
        customExchangeRate: 1300,
        defaultMargin: 15,
        notificationEmail: '',
        webhookUrl: '',
        timezone: 'Asia/Seoul',
      };

      const settings = await Settings.findOneAndUpdate(
        {},
        { $set: defaultSettings },
        { new: true, upsert: true }
      );

      logger.info('Settings reset to default');

      res.json({
        success: true,
        data: settings,
        message: '설정이 기본값으로 초기화되었습니다.',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get setting by key
   */
  async getSettingByKey(req: Request, res: Response, next: NextFunction) {
    try {
      const { key } = req.params;
      const settings = await Settings.findOne().lean();

      if (!settings) {
        return res.status(404).json({
          success: false,
          error: 'Settings not found',
        });
      }

      const value = settings[key];
      if (value === undefined) {
        return res.status(404).json({
          success: false,
          error: `Setting key "${key}" not found`,
        });
      }

      res.json({
        success: true,
        data: {
          key,
          value,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update setting by key
   */
  async updateSettingByKey(req: Request, res: Response, next: NextFunction) {
    try {
      const { key } = req.params;
      const { value } = req.body;

      const settings = await Settings.findOne();
      if (!settings) {
        return res.status(404).json({
          success: false,
          error: 'Settings not found',
        });
      }

      settings[key] = value;
      await settings.save();

      res.json({
        success: true,
        data: {
          key,
          value,
        },
        message: `Setting "${key}" updated successfully`,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Export settings
   */
  async exportSettings(req: Request, res: Response, next: NextFunction) {
    try {
      const settings = await Settings.findOne().lean();

      if (!settings) {
        return res.status(404).json({
          success: false,
          error: 'Settings not found',
        });
      }

      // Remove sensitive fields
      const exportData = { ...settings };
      delete exportData._id;
      delete exportData.__v;

      res.json({
        success: true,
        data: exportData,
        exportedAt: new Date(),
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Import settings
   */
  async importSettings(req: Request, res: Response, next: NextFunction) {
    try {
      const importData = req.body;

      // Validate import data
      if (!importData || typeof importData !== 'object') {
        return res.status(400).json({
          success: false,
          error: 'Invalid import data',
        });
      }

      // Update or create settings
      const settings = await Settings.findOneAndUpdate(
        {},
        importData,
        { new: true, upsert: true }
      );

      logger.info('Settings imported successfully', {
        userId: (req as any).user?.id,
      });

      res.json({
        success: true,
        data: settings,
        message: 'Settings imported successfully',
      });
    } catch (error) {
      next(error);
    }
  }
}
