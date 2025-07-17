import { logger } from './logger';

export interface RetryOptions {
  retries?: number;
  factor?: number;
  minTimeout?: number;
  maxTimeout?: number;
  randomize?: boolean;
  onRetry?: (error: Error, attempt: number) => void;
}

const defaultOptions: Required<RetryOptions> = {
  retries: 3,
  factor: 2,
  minTimeout: 1000,
  maxTimeout: 60000,
  randomize: true,
  onRetry: (error, attempt) => {
    logger.warn(`Retry attempt ${attempt}:`, { error: error.message });
  },
};

/**
 * 지수 백오프를 사용한 재시도 함수
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...defaultOptions, ...options };
  let lastError: Error;
  
  for (let attempt = 1; attempt <= opts.retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt === opts.retries) {
        break;
      }
      
      // 재시도 콜백 실행
      opts.onRetry(lastError, attempt);
      
      // 대기 시간 계산
      const timeout = Math.min(
        opts.minTimeout * Math.pow(opts.factor, attempt - 1),
        opts.maxTimeout
      );
      
      // 랜덤화 적용
      const finalTimeout = opts.randomize
        ? timeout * (0.5 + Math.random())
        : timeout;
      
      // 대기
      await new Promise(resolve => setTimeout(resolve, finalTimeout));
    }
  }
  
  throw lastError!;
}

/**
 * 조건부 재시도 함수
 */
export async function retryWithCondition<T>(
  fn: () => Promise<T>,
  shouldRetry: (error: Error) => boolean,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...defaultOptions, ...options };
  let lastError: Error;
  
  for (let attempt = 1; attempt <= opts.retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      // 재시도 조건 확인
      if (!shouldRetry(lastError) || attempt === opts.retries) {
        break;
      }
      
      opts.onRetry(lastError, attempt);
      
      const timeout = Math.min(
        opts.minTimeout * Math.pow(opts.factor, attempt - 1),
        opts.maxTimeout
      );
      
      const finalTimeout = opts.randomize
        ? timeout * (0.5 + Math.random())
        : timeout;
      
      await new Promise(resolve => setTimeout(resolve, finalTimeout));
    }
  }
  
  throw lastError!;
}

/**
 * Rate limit 에러 확인
 */
export function isRateLimitError(error: any): boolean {
  return (
    error.response?.status === 429 ||
    error.code === 'RATE_LIMIT_EXCEEDED' ||
    error.message?.toLowerCase().includes('rate limit')
  );
}

/**
 * 네트워크 에러 확인
 */
export function isNetworkError(error: any): boolean {
  return (
    error.code === 'ECONNRESET' ||
    error.code === 'ENOTFOUND' ||
    error.code === 'ECONNREFUSED' ||
    error.code === 'ETIMEDOUT' ||
    error.message?.toLowerCase().includes('network')
  );
}

/**
 * 재시도 가능한 에러인지 확인
 */
export function isRetryableError(error: any): boolean {
  return (
    isRateLimitError(error) ||
    isNetworkError(error) ||
    error.response?.status >= 500 ||
    error.code === 'ECONNABORTED'
  );
}

