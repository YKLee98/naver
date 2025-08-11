// packages/backend/src/index.ts
import 'dotenv/config';
import { logger } from './utils/logger.js';
import { config, validateConfig } from './config/index.js';
import { startCluster } from './cluster.js';

/**
 * Main application entry point
 * Determines whether to run in cluster mode or single process mode
 */
async function startApplication() {
  try {
    logger.info('🚀 Starting Hallyu-Fomaholic Sync System...');
    logger.info(`Environment: ${config.env}`);
    logger.info(`Node Version: ${process.version}`);
    
    // Validate configuration
    const errors = validateConfig();
    
    if (errors.length > 0) {
      logger.error('Configuration validation failed:', errors);
      process.exit(1);
    }

    // Check if clustering is enabled
    if (config.features.enableClustering && config.env === 'production') {
      logger.info('Starting in cluster mode...');
      await startCluster();
    } else {
      logger.info('Starting in single process mode...');
      
      // Import server dynamically to avoid loading it in cluster primary
      const serverModule = await import('./server.js');
      
      // Server module exports a default class that auto-starts
      logger.info('Server module loaded and starting...');
    }
    
    logger.info('Application started successfully');
  } catch (error) {
    logger.error('Failed to start application:', error);
    process.exit(1);
  }
}

// Handle process-level errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the application
startApplication();
