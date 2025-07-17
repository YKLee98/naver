// packages/backend/src/server.ts
import 'dotenv/config';
import { App } from './app';
import { logger } from './utils/logger';
import { setupCronJobs } from './utils/cronJobs';

const PORT = parseInt(process.env.PORT || '3000', 10);

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
