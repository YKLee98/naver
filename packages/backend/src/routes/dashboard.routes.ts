// packages/backend/src/routes/dashboard.routes.ts
import { Router } from 'express';
import { authMiddleware } from '../middlewares';
import { DashboardController } from '../controllers';

// 라우터 설정을 함수로 export하여 지연 초기화
export function setupDashboardRoutes(): Router {
  const router = Router();

  // 컨트롤러 인스턴스 생성
  const dashboardController = new DashboardController();

  // 인증 미들웨어 적용
  router.use(authMiddleware);

  // ✅ 수정된 라우트 - 메서드 이름을 올바르게 매핑
  router.get('/statistics', dashboardController.getStatistics);
  router.get('/activities', dashboardController.getRecentActivities);
  router.get('/charts/price', dashboardController.getPriceChartData);
  router.get('/charts/inventory', dashboardController.getInventoryChartData);

  return router;
}

// 기본 export도 제공
export default setupDashboardRoutes();
