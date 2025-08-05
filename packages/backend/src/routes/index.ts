// packages/backend/src/routes/index.ts
import { Router } from 'express';
import { setupApiRoutes } from './api.routes';
import webhookRoutes from './webhook.routes';
import healthRoutes from './health.routes';
import setupPriceSyncRoutes from './priceSync.routes';
import setupExchangeRateRoutes from './exchangeRate.routes';
import settingsRoutes from './settings.routes';
import dashboardRoutes from './dashboard.routes';

const router = Router();

// Health check routes (no auth required)
router.use('/health', healthRoutes);

// Webhook routes (special auth)
router.use('/webhooks', webhookRoutes);

// API routes - 함수로 설정
router.use('/api/v1', setupApiRoutes());

// Dashboard routes
router.use('/api/v1/dashboard', dashboardRoutes);

// Price sync routes - 함수로 설정
router.use('/api/v1/price-sync', setupPriceSyncRoutes());

// Exchange rate routes - 함수로 설정  
router.use('/api/v1/exchange-rate', setupExchangeRateRoutes());

// Settings routes
router.use('/api/v1/settings', settingsRoutes);

export default router;