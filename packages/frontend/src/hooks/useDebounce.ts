// ===== 2. packages/frontend/src/hooks/useDebounce.ts =====
import { useState, useEffect } from 'react';

/**
 * 디바운스 훅
 * @param value 디바운스할 값
 * @param delay 지연 시간(ms)
 * @returns 디바운스된 값
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    // 타이머 설정
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // 클린업 함수: 값이 변경되면 이전 타이머를 취소
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}
