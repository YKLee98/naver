// ===== 13. packages/backend/src/routes/settings.routes.ts =====
import { Router } from 'express';
import { authMiddleware, adminMiddleware } from '../middlewares/index.js';
import { Settings } from '../models/index.js';
import { logger } from '../utils/logger.js';

// 라우터 설정을 함수로 export하여 지연 초기화
export function setupSettingsRoutes(): Router {
  const router = Router();

  // 인증 미들웨어 적용
  router.use(authMiddleware);

  // 설정 조회
  router.get('/', async (req, res, next) => {
    try {
      const settings = await Settings.findOne().lean();

      if (!settings) {
        // 기본 설정 생성
        const defaultSettings = await Settings.create({
          syncInterval: 60, // 60분
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
  });

  // 설정 업데이트 (관리자 전용)
  router.put('/', adminMiddleware, async (req, res, next) => {
    try {
      const updates = req.body;

      // 유효성 검사
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
  });

  return router;
}

// 기본 export도 제공 (임시)
export default setupSettingsRoutes();
