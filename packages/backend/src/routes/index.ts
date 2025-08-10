// ===== 5. packages/backend/src/routes/index.ts =====
import { Router } from 'express';
import authRoutes from './auth.routes.js';

export async function setupRoutes(): Promise<Router> {
  const router = Router();

  // Health check routes (인증 불필요)
  try {
    const healthModule = await import('./health.routes.js');
    router.use('/health', healthModule.default);
    console.log('✅ Health routes registered at /health');
  } catch (error) {
    console.log('Health routes not found, skipping...');
  }

  // Auth routes (인증 불필요) - 가장 먼저 등록!
  router.use('/auth', authRoutes);
  console.log('✅ Auth routes registered at /auth');

  // Webhook routes (특별 인증)
  try {
    const webhookModule = await import('./webhook.routes.js');
    router.use('/webhooks', webhookModule.default);
    console.log('✅ Webhook routes registered at /webhooks');
  } catch (error) {
    console.log('Webhook routes not found, skipping...');
  }

  // API routes - 동적 import 사용
  try {
    const apiModule = await import('./api.routes.js');
    const setupApiRoutes = apiModule.setupApiRoutes;
    if (typeof setupApiRoutes === 'function') {
      const apiRouter = await setupApiRoutes();
      router.use('/', apiRouter);
      console.log('✅ API routes registered');
    }
  } catch (error: any) {
    console.log('API routes error:', error.message);
  }

  // Dashboard routes - 동적 import 사용
  try {
    const dashboardModule = await import('./dashboard.routes.js');
    const setupDashboardRoutes = dashboardModule.setupDashboardRoutes;
    if (typeof setupDashboardRoutes === 'function') {
      const dashboardRouter = setupDashboardRoutes();
      router.use('/dashboard', dashboardRouter);
      console.log('✅ Dashboard routes registered at /dashboard');
    }
  } catch (error: any) {
    console.log('Dashboard routes error:', error.message);
  }

  // Settings routes - 동적 import 사용
  try {
    const settingsModule = await import('./settings.routes.js');
    const setupSettingsRoutes = settingsModule.setupSettingsRoutes;
    if (typeof setupSettingsRoutes === 'function') {
      const settingsRouter = setupSettingsRoutes();
      router.use('/settings', settingsRouter);
      console.log('✅ Settings routes registered at /settings');
    }
  } catch (error) {
    console.log('Settings routes not found, skipping...');
  }

  // Price sync routes
  try {
    const priceSyncModule = await import('./priceSync.routes.js');
    const setupPriceSyncRoutes = priceSyncModule.default;
    if (typeof setupPriceSyncRoutes === 'function') {
      router.use('/price-sync', setupPriceSyncRoutes());
      console.log('✅ Price sync routes registered at /price-sync');
    }
  } catch (error) {
    console.log('Price sync routes not found, skipping...');
  }

  // Exchange rate routes
  try {
    const exchangeRateModule = await import('./exchangeRate.routes.js');
    const setupExchangeRateRoutes = exchangeRateModule.default;
    if (typeof setupExchangeRateRoutes === 'function') {
      router.use('/exchange-rate', setupExchangeRateRoutes());
      console.log('✅ Exchange rate routes registered at /exchange-rate');
    }
  } catch (error) {
    console.log('Exchange rate routes not found, skipping...');
  }

  return router;
}