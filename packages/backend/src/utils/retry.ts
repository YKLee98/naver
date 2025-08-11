// ===== 5. packages/backend/src/utils/retry.ts =====
import retry from 'async-retry';
import { logger } from './logger';

export interface RetryOptions {
  retries?: number;
  factor?: number;
  minTimeout?: number;
  maxTimeout?: number;
  randomize?: boolean;
  onRetry?: (error: Error, attempt: number) => void;
}

/**
 * 재시도 로직 래퍼
 */
export async function retryOperation<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const defaultOptions: RetryOptions = {
    retries: 3,
    factor: 2,
    minTimeout: 1000,
    maxTimeout: 10000,
    randomize: true,
    onRetry: (error, attempt) => {
      logger.warn(`Retry attempt ${attempt}:`, error.message);
    },
  };

  return retry(operation, { ...defaultOptions, ...options });
}

/**
 * 조건부 재시도
 */
export async function retryWithCondition<T>(
  operation: () => Promise<T>,
  condition: (error: Error) => boolean,
  options: RetryOptions = {}
): Promise<T> {
  return retry(async (bail) => {
    try {
      return await operation();
    } catch (error) {
      if (!condition(error as Error)) {
        bail(error as Error);
      }
      throw error;
    }
  }, options);
}

// Export retry 자체도 export
export { default as retry } from 'async-retry';
