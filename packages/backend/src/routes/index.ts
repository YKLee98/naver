// packages/backend/src/routes/index.ts
import { Router } from 'express';
import apiRoutes from './api.routes';
import webhookRoutes from './webhook.routes';
import healthRoutes from './health.routes';
import priceSyncRoutes from './priceSync.routes';
import exchangeRateRoutes from './exchangeRate.routes';
import settingsRoutes from './settings.routes';
import dashboardRoutes from './dashboard.routes';

const router = Router();

// Health check routes (no auth required)
router.use('/health', healthRoutes);

// Webhook routes (special auth)
router.use('/webhooks', webhookRoutes);

// API routes
router.use('/api/v1', apiRoutes);

// Dashboard routes
router.use('/api/v1/dashboard', dashboardRoutes);

// Price sync routes
router.use('/api/price-sync', priceSyncRoutes);

// Exchange rate routes
router.use('/api/exchange-rate', exchangeRateRoutes);

// Settings routes
router.use('/api/settings', settingsRoutes);

export default router;