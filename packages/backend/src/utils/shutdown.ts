// packages/backend/src/utils/shutdown.ts
import { logger } from './logger.js';

export interface ShutdownHandler {
  name: string;
  handler: () => Promise<void>;
  timeout?: number;
}

class GracefulShutdownManager {
  private handlers: ShutdownHandler[] = [];
  private isShuttingDown = false;
  private shutdownTimeout = 30000; // 30 seconds default

  /**
   * Register a shutdown handler
   */
  register(handler: ShutdownHandler): void {
    this.handlers.push(handler);
    logger.debug(`Registered shutdown handler: ${handler.name}`);
  }

  /**
   * Execute all shutdown handlers
   */
  async shutdown(timeout: number = this.shutdownTimeout): Promise<void> {
    if (this.isShuttingDown) {
      logger.warn('Shutdown already in progress');
      return;
    }

    this.isShuttingDown = true;
    logger.info('🛑 Starting graceful shutdown...');

    const shutdownPromises = this.handlers.map(async (handler) => {
      const handlerTimeout = handler.timeout || timeout;
      
      try {
        await this.executeWithTimeout(
          handler.handler(),
          handlerTimeout,
          `Shutdown handler '${handler.name}' timed out after ${handlerTimeout}ms`
        );
        logger.info(`✅ ${handler.name} shutdown completed`);
      } catch (error) {
        logger.error(`❌ ${handler.name} shutdown failed:`, error);
      }
    });

    try {
      await Promise.allSettled(shutdownPromises);
      logger.info('✅ All shutdown handlers completed');
    } catch (error) {
      logger.error('Error during shutdown:', error);
    }
  }

  /**
   * Execute a promise with timeout
   */
  private async executeWithTimeout<T>(
    promise: Promise<T>,
    timeout: number,
    timeoutMessage: string
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(timeoutMessage)), timeout)
      )
    ]);
  }

  /**
   * Check if shutdown is in progress
   */
  isShuttingDownNow(): boolean {
    return this.isShuttingDown;
  }
}

// Create singleton instance
const shutdownManager = new GracefulShutdownManager();

/**
 * Register a cleanup handler
 */
export function registerShutdownHandler(
  name: string,
  handler: () => Promise<void>,
  timeout?: number
): void {
  shutdownManager.register({ name, handler, timeout });
}

/**
 * Execute graceful shutdown
 */
export async function gracefulShutdown(
  customHandler?: () => Promise<void>,
  timeout?: number
): Promise<void> {
  if (customHandler) {
    await customHandler();
  }
  
  await shutdownManager.shutdown(timeout);
  
  // Force exit after timeout
  const forceExitTimeout = timeout || 30000;
  const forceExitTimer = setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, forceExitTimeout + 5000);

  // Clear timer if shutdown completes
  forceExitTimer.unref();
}

/**
 * Check if application is shutting down
 */
export function isShuttingDown(): boolean {
  return shutdownManager.isShuttingDownNow();
}

// Register default handlers
registerShutdownHandler(
  'Active Connections',
  async () => {
    // Close keep-alive connections
    await new Promise(resolve => setTimeout(resolve, 1000));
  },
  5000
);

export default {
  registerShutdownHandler,
  gracefulShutdown,
  isShuttingDown
};