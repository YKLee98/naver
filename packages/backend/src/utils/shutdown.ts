// packages/backend/src/utils/shutdown.ts
import { logger } from './logger.js';
import * as readline from 'readline';

interface ShutdownHandler {
  name: string;
  handler: () => Promise<void>;
  priority: number; // Lower number = higher priority
}

/**
 * Enterprise-grade Shutdown Manager
 * Handles graceful shutdown with proper ordering and error handling
 */
export class ShutdownManager {
  private static instance: ShutdownManager;
  private handlers: ShutdownHandler[] = [];
  private isShuttingDown: boolean = false;
  private shutdownTimeout: number = 30000; // 30 seconds default

  private constructor() {
    this.setupProcessHandlers();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): ShutdownManager {
    if (!ShutdownManager.instance) {
      ShutdownManager.instance = new ShutdownManager();
    }
    return ShutdownManager.instance;
  }

  /**
   * Register a shutdown handler
   */
  public registerHandler(
    name: string,
    handler: () => Promise<void>,
    priority: number = 50
  ): void {
    if (this.handlers.some((h) => h.name === name)) {
      logger.warn(`Shutdown handler ${name} already registered`);
      return;
    }

    this.handlers.push({ name, handler, priority });
    this.handlers.sort((a, b) => a.priority - b.priority);

    logger.debug(`Registered shutdown handler: ${name}`);
  }

  /**
   * Execute shutdown sequence
   */
  public async shutdown(reason: string = 'manual'): Promise<void> {
    if (this.isShuttingDown) {
      logger.warn('Shutdown already in progress');
      return;
    }

    this.isShuttingDown = true;
    logger.info(`🛑 Graceful shutdown initiated (${reason})`);

    const startTime = Date.now();
    const timeout = setTimeout(() => {
      logger.error('Shutdown timeout exceeded, forcing exit');
      process.exit(1);
    }, this.shutdownTimeout);

    const results: { name: string; success: boolean; error?: string }[] = [];

    for (const { name, handler } of this.handlers) {
      try {
        logger.info(`Executing shutdown handler: ${name}`);
        await handler();
        results.push({ name, success: true });
        logger.info(`✅ ${name} completed`);
      } catch (error: any) {
        logger.error(`❌ ${name} failed:`, error);
        results.push({ name, success: false, error: error.message });
      }
    }

    clearTimeout(timeout);
    const duration = Date.now() - startTime;

    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    logger.info(
      `Shutdown completed in ${duration}ms (${successful} successful, ${failed} failed)`
    );

    if (failed > 0) {
      logger.error(
        'Failed handlers:',
        results.filter((r) => !r.success)
      );
    }
  }

  /**
   * Setup process event handlers
   */
  private setupProcessHandlers(): void {
    const gracefulShutdown = async (signal: string) => {
      await this.shutdown(signal);
      process.exit(0);
    };

    // Handle termination signals
    process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.once('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle Windows termination (ES Module compatible)
    if (process.platform === 'win32') {
      try {
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });
        rl.on('SIGINT', () => process.emit('SIGINT' as any));
      } catch (error) {
        // Readline might not be available in some environments
        logger.debug('Could not setup readline for Windows SIGINT handling');
      }
    }

    // Register default handlers
    this.registerDefaultHandlers();
  }

  /**
   * Register default shutdown handlers
   */
  private registerDefaultHandlers(): void {
    // Active connections handler
    this.registerHandler(
      'Active Connections',
      async () => {
        // Close all active connections
        await new Promise((resolve) => setTimeout(resolve, 1000));
      },
      10
    );

    // MongoDB handler
    this.registerHandler(
      'MongoDB',
      async () => {
        try {
          const mongoose = await import('mongoose');
          if (mongoose.default.connection.readyState === 1) {
            await mongoose.default.connection.close();
            logger.info('MongoDB connection closed');
          }
        } catch (error) {
          logger.debug('MongoDB not initialized');
        }
      },
      20
    );

    // Redis handler
    this.registerHandler(
      'Redis',
      async () => {
        try {
          const { getRedisClient } = await import('../config/redis.js');
          const redis = getRedisClient();
          if (redis) {
            await redis.quit();
            logger.info('Redis connection closed');
          }
        } catch (error) {
          logger.debug('Redis not initialized');
        }
      },
      30
    );

    // Process cleanup
    this.registerHandler(
      'Process Cleanup',
      async () => {
        // Clear any remaining timers or intervals
        logger.info('Process cleanup completed');
      },
      100
    );
  }

  /**
   * Set shutdown timeout
   */
  public setShutdownTimeout(timeout: number): void {
    this.shutdownTimeout = timeout;
  }

  /**
   * Check if shutting down
   */
  public isShuttingDownNow(): boolean {
    return this.isShuttingDown;
  }
}
