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

  // 대시보드 통계 - 메서드 이름 수정됨
  router.get('/statistics', dashboardController.getStats);

  // 최근 활동 - 메서드 이름 수정됨
  router.get('/activities', dashboardController.getRecentActivity);

  // 차트 데이터 - 메서드 이름 수정됨
  router.get('/charts/price', dashboardController.getSalesChartData);
  router.get('/charts/inventory', dashboardController.getInventoryChartData);

  return router;
}

// 기본 export도 제공 (임시)
export default setupDashboardRoutes();
