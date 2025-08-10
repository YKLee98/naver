// packages/backend/src/utils/shutdown.ts
import mongoose from 'mongoose';
import { logger } from './logger.js';
import { closeRedis } from '../config/redis.js';

interface ShutdownHandler {
  name: string;
  handler: () => Promise<void>;
  priority: number;
  timeout: number;
}

class ShutdownManager {
  private handlers: ShutdownHandler[] = [];
  private isShuttingDown = false;
  private shutdownPromise?: Promise<void>;

  /**
   * Register shutdown handler
   */
  registerHandler(handler: ShutdownHandler): void {
    this.handlers.push(handler);
    // Sort by priority (higher priority first)
    this.handlers.sort((a, b) => b.priority - a.priority);
    
    logger.debug(`Registered shutdown handler: ${handler.name}`);
  }

  /**
   * Execute graceful shutdown
   */
  async shutdown(signal: string): Promise<void> {
    if (this.isShuttingDown) {
      logger.warn('Shutdown already in progress');
      return this.shutdownPromise;
    }

    this.isShuttingDown = true;
    logger.info(`🛑 Graceful shutdown initiated (${signal})`);

    this.shutdownPromise = this.executeShutdown();
    return this.shutdownPromise;
  }

  private async executeShutdown(): Promise<void> {
    const startTime = Date.now();
    const results: Array<{ name: string; success: boolean; error?: any }> = [];

    // Execute handlers in priority order
    for (const handler of this.handlers) {
      try {
        logger.info(`Executing shutdown handler: ${handler.name}`);
        
        await this.executeWithTimeout(
          handler.handler(),
          handler.timeout,
          handler.name
        );
        
        results.push({ name: handler.name, success: true });
        logger.info(`✅ ${handler.name} completed`);
      } catch (error) {
        results.push({ name: handler.name, success: false, error });
        logger.error(`❌ ${handler.name} failed:`, error);
      }
    }

    const duration = Date.now() - startTime;
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    logger.info(`Shutdown completed in ${duration}ms (${successful} successful, ${failed} failed)`);

    // Log failed handlers
    if (failed > 0) {
      logger.error('Failed shutdown handlers:', 
        results.filter(r => !r.success).map(r => ({
          name: r.name,
          error: r.error?.message
        }))
      );
    }
  }

  private async executeWithTimeout(
    promise: Promise<void>,
    timeout: number,
    name: string
  ): Promise<void> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`${name} timed out after ${timeout}ms`));
      }, timeout);
    });

    return Promise.race([promise, timeoutPromise]);
  }

  /**
   * Check if shutdown is in progress
   */
  isShutdownInProgress(): boolean {
    return this.isShuttingDown;
  }
}

// Create singleton instance
const shutdownManager = new ShutdownManager();

// Register default handlers
shutdownManager.registerHandler({
  name: 'Active Connections',
  priority: 100,
  timeout: 10000,
  handler: async () => {
    // Wait for active connections to complete
    // This would be implemented based on your connection tracking
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
});

shutdownManager.registerHandler({
  name: 'MongoDB',
  priority: 80,
  timeout: 5000,
  handler: async () => {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
      logger.info('MongoDB connection closed');
    }
  }
});

shutdownManager.registerHandler({
  name: 'Redis',
  priority: 70,
  timeout: 5000,
  handler: async () => {
    await closeRedis();
    logger.info('Redis connection closed');
  }
});

shutdownManager.registerHandler({
  name: 'Process Cleanup',
  priority: 10,
  timeout: 3000,
  handler: async () => {
    // Any final cleanup
    logger.info('Process cleanup completed');
  }
});

/**
 * Execute graceful shutdown
 */
export async function gracefulShutdown(): Promise<void> {
  await shutdownManager.shutdown('manual');
}

/**
 * Register shutdown handlers for signals
 */
export function registerShutdownHandlers(customHandler?: () => Promise<void>): void {
  if (customHandler) {
    shutdownManager.registerHandler({
      name: 'Custom Handler',
      priority: 90,
      timeout: 10000,
      handler: customHandler
    });
  }

  // Handle different signals
  const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT', 'SIGUSR2'];
  
  signals.forEach(signal => {
    process.once(signal, async () => {
      logger.info(`Received ${signal} signal`);
      
      try {
        await shutdownManager.shutdown(signal);
        process.exit(0);
      } catch (error) {
        logger.error('Shutdown failed:', error);
        process.exit(1);
      }
    });
  });

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    
    shutdownManager.shutdown('uncaughtException').finally(() => {
      process.exit(1);
    });
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    
    shutdownManager.shutdown('unhandledRejection').finally(() => {
      process.exit(1);
    });
  });

  logger.info('Shutdown handlers registered');
}

/**
 * Register a custom shutdown handler
 */
export function addShutdownHandler(
  name: string,
  handler: () => Promise<void>,
  priority: number = 50,
  timeout: number = 5000
): void {
  shutdownManager.registerHandler({
    name,
    handler,
    priority,
    timeout
  });
}

export { shutdownManager };