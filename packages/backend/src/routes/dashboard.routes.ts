// packages/backend/src/routes/dashboard.routes.ts
import { Router } from 'express';
import { authMiddleware } from '../middlewares';
import { DashboardController } from '../controllers';

const router = Router();

// 컨트롤러 인스턴스 생성
const dashboardController = new DashboardController();

// 인증 미들웨어 적용
router.use(authMiddleware);

// 대시보드 통계
router.get('/statistics', dashboardController.getStatistics);

// 최근 활동
router.get('/activities', dashboardController.getRecentActivities);

// 차트 데이터
router.get('/charts/price', dashboardController.getPriceChartData);
router.get('/charts/inventory', dashboardController.getInventoryChartData);

export default router;