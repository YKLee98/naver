// packages/backend/src/routes/index.ts
import { Router } from 'express';
import { setupApiRoutes } from './api.routes';
import webhookRoutes from './webhook.routes';
import healthRoutes from './health.routes';
import setupPriceSyncRoutes from './priceSync.routes';
import setupExchangeRateRoutes from './exchangeRate.routes';
import { setupSettingsRoutes } from './settings.routes';
import { setupDashboardRoutes } from './dashboard.routes';

// 라우터 설정을 함수로만 export - 기본 export 제거
export function setupRoutes(): Router {
  const router = Router();

  // Health check routes (no auth required)
  router.use('/health', healthRoutes);

  // Webhook routes (special auth)
  router.use('/webhooks', webhookRoutes);

  // API v1 routes - 중복 경로 수정
  const apiRouter = setupApiRoutes();

  // Dashboard routes - API router에 직접 추가
  router.use('/dashboard', setupDashboardRoutes());

  // Main API routes
  router.use('/', apiRouter);

  // Price sync routes - API router에 추가
  router.use('/price-sync', setupPriceSyncRoutes());

  // Exchange rate routes - API router에 추가
  router.use('/exchange-rate', setupExchangeRateRoutes());

  // Settings routes
  router.use('/settings', setupSettingsRoutes());

  return router;
}