// packages/backend/src/utils/retry.ts
import { logger } from './logger';

interface RetryOptions {
  retries: number;
  minTimeout: number;
  maxTimeout: number;
  factor?: number;
  onRetry?: (error: Error, attempt: number) => void;
}

/**
 * 지수 백오프를 사용한 재시도 함수
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  const {
    retries,
    minTimeout,
    maxTimeout,
    factor = 2,
    onRetry
  } = options;

  let lastError: Error;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt === retries) {
        break;
      }

      // 재시도 간격 계산 (지수 백오프)
      const timeout = Math.min(
        minTimeout * Math.pow(factor, attempt),
        maxTimeout
      );

      logger.debug(`Retry attempt ${attempt + 1}/${retries} after ${timeout}ms`);
      
      if (onRetry) {
        onRetry(lastError, attempt + 1);
      }

      await sleep(timeout);
    }
  }

  throw lastError!;
}

/**
 * 조건부 재시도 함수
 */
export async function retryWithCondition<T>(
  fn: () => Promise<T>,
  condition: (error: Error) => boolean,
  options: RetryOptions
): Promise<T> {
  const {
    retries,
    minTimeout,
    maxTimeout,
    factor = 2,
    onRetry
  } = options;

  let lastError: Error;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      // 재시도 조건 확인
      if (!condition(lastError) || attempt === retries) {
        break;
      }

      const timeout = Math.min(
        minTimeout * Math.pow(factor, attempt),
        maxTimeout
      );

      logger.debug(`Conditional retry attempt ${attempt + 1}/${retries} after ${timeout}ms`);
      
      if (onRetry) {
        onRetry(lastError, attempt + 1);
      }

      await sleep(timeout);
    }
  }

  throw lastError!;
}

/**
 * 비동기 sleep 함수
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 타임아웃을 포함한 Promise 실행
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutError?: Error
): Promise<T> {
  let timeoutHandle: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(timeoutError || new Error(`Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutHandle!);
    return result;
  } catch (error) {
    clearTimeout(timeoutHandle!);
    throw error;
  }
}

/**
 * 병렬 실행 with 재시도
 */
export async function retryAll<T>(
  fns: Array<() => Promise<T>>,
  options: RetryOptions
): Promise<T[]> {
  return Promise.all(
    fns.map(fn => retry(fn, options))
  );
}

/**
 * 순차 실행 with 재시도
 */
export async function retrySequential<T>(
  fns: Array<() => Promise<T>>,
  options: RetryOptions
): Promise<T[]> {
  const results: T[] = [];
  
  for (const fn of fns) {
    const result = await retry(fn, options);
    results.push(result);
  }
  
  return results;
}

/**
 * Circuit Breaker 패턴 구현
 */
export class CircuitBreaker {
  private failureCount = 0;
  private lastFailureTime?: Date;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';

  constructor(
    private readonly threshold: number,
    private readonly timeout: number
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (this.shouldTryHalfOpen()) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = new Date();

    if (this.failureCount >= this.threshold) {
      this.state = 'OPEN';
      logger.warn(`Circuit breaker opened after ${this.failureCount} failures`);
    }
  }

  private shouldTryHalfOpen(): boolean {
    if (!this.lastFailureTime) {
      return true;
    }

    const now = new Date();
    const elapsed = now.getTime() - this.lastFailureTime.getTime();
    
    return elapsed >= this.timeout;
  }

  getState(): string {
    return this.state;
  }

  reset(): void {
    this.failureCount = 0;
    this.lastFailureTime = undefined;
    this.state = 'CLOSED';
  }
}