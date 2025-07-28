// packages/backend/src/routes/dashboard.routes.ts
import { Router } from 'express';
import { DashboardController } from '@/controllers';
import { authenticate } from '@/middlewares';

const router = Router();
const dashboardController = new DashboardController();

// 모든 대시보드 라우트는 인증 필요
router.use(authenticate);

// 대시보드 통계
router.get('/stats', dashboardController.getStats);

// 최근 활동
router.get('/activity', dashboardController.getRecentActivity);

// 차트 데이터
router.get('/charts/sales', dashboardController.getSalesChartData);
router.get('/charts/inventory', dashboardController.getInventoryChartData);
router.get('/charts/sync', dashboardController.getSyncChartData);

// 알림
router.get('/notifications', dashboardController.getNotifications);
router.put('/notifications/:id/read', dashboardController.markNotificationAsRead);

// 시스템 상태
router.get('/health', dashboardController.getSystemHealth);

export default router;