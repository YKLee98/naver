// packages/backend/src/routes/settings.routes.ts
import { Router } from 'express';
import { authMiddleware } from '../middlewares';
import { getRedisClient } from '../config/redis';
import { logger } from '../utils/logger';

// 라우터 설정 함수로 export
export default function setupSettingsRoutes(): Router {
  const router = Router();
  
  // Apply auth middleware
  router.use(authMiddleware);

  // Get all settings
  router.get('/', async (req, res, next) => {
    try {
      const redis = getRedisClient();
      const settings = await redis.hgetall('settings:general');
      
      res.json({
        success: true,
        data: settings,
      });
    } catch (error) {
      next(error);
    }
  });

  // Update settings
  router.put('/', async (req, res, next) => {
    try {
      const redis = getRedisClient();
      const { settings } = req.body;
      
      if (!settings || typeof settings !== 'object') {
        return res.status(400).json({
          success: false,
          message: 'Invalid settings format',
        });
      }
      
      // Save each setting
      for (const [key, value] of Object.entries(settings)) {
        await redis.hset('settings:general', key, String(value));
      }
      
      logger.info('Settings updated', settings);
      
      res.json({
        success: true,
        message: 'Settings updated successfully',
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}