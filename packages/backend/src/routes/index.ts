// packages/backend/src/routes/index.ts
import { Router } from 'express';
import authRoutes from './auth.routes';

export function setupRoutes(): Router {
  const router = Router();

  // Health check routes (인증 불필요)
  try {
    const healthRoutes = require('./health.routes').default;
    router.use('/health', healthRoutes);
  } catch (error) {
    console.log('Health routes not found, skipping...');
  }

  // Auth routes (인증 불필요) - 가장 먼저 등록!
  router.use('/auth', authRoutes);
  console.log('✅ Auth routes registered at /auth');

  // Webhook routes (특별 인증)
  try {
    const webhookRoutes = require('./webhook.routes').default;
    router.use('/webhooks', webhookRoutes);
  } catch (error) {
    console.log('Webhook routes not found, skipping...');
  }

  // API routes - 다른 라우트들
  try {
    const { setupApiRoutes } = require('./api.routes');
    const apiRouter = setupApiRoutes();
    router.use('/', apiRouter);
  } catch (error) {
    console.log('API routes error:', error.message);
  }

  // Dashboard routes
  try {
    const { setupDashboardRoutes } = require('./dashboard.routes');
    const dashboardRouter = setupDashboardRoutes();
    router.use('/dashboard', dashboardRouter);
  } catch (error) {
    console.log('Dashboard routes not found, skipping...');
  }

  // Settings routes
  try {
    const { setupSettingsRoutes } = require('./settings.routes');
    const settingsRouter = setupSettingsRoutes();
    router.use('/settings', settingsRouter);
  } catch (error) {
    console.log('Settings routes not found, skipping...');
  }

  // Price sync routes
  try {
    const setupPriceSyncRoutes = require('./priceSync.routes').default;
    if (typeof setupPriceSyncRoutes === 'function') {
      router.use('/price-sync', setupPriceSyncRoutes());
    }
  } catch (error) {
    console.log('Price sync routes not found, skipping...');
  }

  // Exchange rate routes
  try {
    const setupExchangeRateRoutes = require('./exchangeRate.routes').default;
    if (typeof setupExchangeRateRoutes === 'function') {
      router.use('/exchange-rate', setupExchangeRateRoutes());
    }
  } catch (error) {
    console.log('Exchange rate routes not found, skipping...');
  }

  return router;
}