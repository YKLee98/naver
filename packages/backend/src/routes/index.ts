// packages/backend/src/routes/index.ts
import { Router } from 'express';
import { authMiddleware } from '../middlewares';

// 라우터 설정을 함수로만 export
export function setupRoutes(): Router {
  const router = Router();

  // Health check routes (no auth required)
  const healthRoutes = require('./health.routes').default;
  router.use('/health', healthRoutes);

  // Webhook routes (special auth)
  const webhookRoutes = require('./webhook.routes').default;
  router.use('/webhooks', webhookRoutes);

  // API routes - 함수 호출로 변경
  const { setupApiRoutes } = require('./api.routes');
  const apiRouter = setupApiRoutes();

  // Dashboard routes
  const { setupDashboardRoutes } = require('./dashboard.routes');
  router.use('/dashboard', setupDashboardRoutes());

  // Settings routes
  const { setupSettingsRoutes } = require('./settings.routes');
  router.use('/settings', setupSettingsRoutes());

  // Price sync routes
  const setupPriceSyncRoutes = require('./priceSync.routes').default;
  router.use('/price-sync', setupPriceSyncRoutes());

  // Exchange rate routes
  const setupExchangeRateRoutes = require('./exchangeRate.routes').default;
  router.use('/exchange-rate', setupExchangeRateRoutes());

  // Main API routes
  router.use('/', apiRouter);

  return router;
}