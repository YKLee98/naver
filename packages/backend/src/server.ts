// packages/backend/src/server.ts
import 'dotenv/config';
import { App } from './app';
import { logger } from './utils/logger';
import { setupCronJobs ,setCronServices} from './utils/cronjobs';
import { getRedisClient } from './config/redis'; 
import{
  NaverAuthService,
  NaverProductService,
  NaverOrderService
} from './services/naver';
import { ShopifyBulkService}  from './services/shopify';
import { SyncService } from './services/sync';
import { ExchangeRateService } from './services/exchangeRate';  

const PORT = parseInt(process.env.PORT || '3000', 10);
const redis = getRedisClient();
const naverAuthService = new NaverAuthService(redis);
const naverProductService = new NaverProductService(redis);
const naverOrderService = new NaverOrderService();
const shopifyBulkService = new ShopifyBulkService();
const syncService = new SyncService(
  naverProductService,
  naverOrderService,
  shopifyBulkService,
  redis
);
const exchangeRateService = new ExchangeRateService(redis);

setCronServices({
  syncService,
  exchangeRateService
});

async function startServer() {
  try {
    const app = new App();
    await app.initialize();
    
    // Start cron jobs
    setupCronJobs();
    
    // Start server
    app.listen(PORT);

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM received, shutting down gracefully');
      process.exit(0);
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
