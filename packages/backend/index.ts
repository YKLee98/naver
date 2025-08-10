// packages/backend/src/index.ts
import 'dotenv/config';
import { Server } from './server.js';
import { logger } from './utils/logger.js';

// Handle unhandled promise rejections
process.on('unhandledRejection', (err: Error) => {
  logger.error('Unhandled Promise Rejection:', err);
  // Close server and exit process
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err: Error) => {
  logger.error('Uncaught Exception:', err);
  // Close server and exit process
  process.exit(1);
});

// Create and start server
async function startServer() {
  try {
    const server = new Server();
    await server.start();
    
    // Graceful shutdown handlers
    const shutdown = async (signal: string) => {
      logger.info(`${signal} signal received, starting graceful shutdown...`);
      
      try {
        await server.stop();
        logger.info('Server stopped successfully');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();

export { Server } from './server.js';