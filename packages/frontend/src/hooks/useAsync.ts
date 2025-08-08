// ===== 5. packages/frontend/src/hooks/useAsync.ts =====
import { useState, useEffect, useCallback, useRef } from 'react';

interface AsyncState<T> {
  loading: boolean;
  error: Error | null;
  data: T | null;
}

/**
 * 비동기 작업 훅
 * @param asyncFunction 비동기 함수
 * @param immediate 즉시 실행 여부
 * @returns [state, execute, reset]
 */
export function useAsync<T, P extends any[] = []>(
  asyncFunction: (...args: P) => Promise<T>,
  immediate = false
): [
  AsyncState<T>,
  (...args: P) => Promise<T | null>,
  () => void
] {
  const [state, setState] = useState<AsyncState<T>>({
    loading: false,
    error: null,
    data: null,
  });

  // 마운트 상태 추적
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // 비동기 함수 실행
  const execute = useCallback(
    async (...args: P): Promise<T | null> => {
      setState((prev) => ({ ...prev, loading: true, error: null }));

      try {
        const result = await asyncFunction(...args);
        
        if (mountedRef.current) {
          setState({ loading: false, error: null, data: result });
        }
        
        return result;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        
        if (mountedRef.current) {
          setState({ loading: false, error: err, data: null });
        }
        
        throw err;
      }
    },
    [asyncFunction]
  );

  // 상태 초기화
  const reset = useCallback(() => {
    setState({ loading: false, error: null, data: null });
  }, []);

  // 즉시 실행
  useEffect(() => {
    if (immediate) {
      execute(...([] as unknown as P));
    }
  }, [immediate]);

  return [state, execute, reset];
}