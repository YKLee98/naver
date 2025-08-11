// ===== 1. packages/backend/src/index.ts =====
import 'dotenv/config';
import server from './server.js';
import { logger } from './utils/logger.js';
import { config } from './config/index.js';

/**
 * Start the application
 */
async function startApplication() {
  try {
    // Validate environment
    if (!config.mongoUri) {
      throw new Error('MongoDB URI is not configured');
    }

    if (!config.jwtSecret) {
      throw new Error('JWT Secret is not configured');
    }

    // Log startup information
    logger.info('Starting Hallyu Pomaholic ERP Server...');
    logger.info(`Environment: ${config.env}`);
    logger.info(`Node Version: ${process.version}`);

    // Start the server
    await server.start();

    // Log successful startup
    logger.info('Application started successfully');
  } catch (error) {
    logger.error('Failed to start application:', error);
    process.exit(1);
  }
}

// Start the application
startApplication();
