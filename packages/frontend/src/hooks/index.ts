// packages/frontend/src/hooks/index.ts
import { useDispatch, useSelector, TypedUseSelectorHook } from 'react-redux';
import type { RootState, AppDispatch } from '@/store';
import { useWebSocket } from './useWebSocket';
import { useDebounce } from './useDebounce';
import { useInfiniteScroll } from './useInfiniteScroll';
import { useLocalStorage } from './useLocalStorage';
import { useNotification } from './useNotification';


export * from './redux';
 
// Redux 훅을 타입 안전하게 사용하기 위한 커스텀 훅
export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
export { useWebSocket } from './useWebSocket';
export { useDebounce } from './useDebounce';
export { useInfiniteScroll } from './useInfiniteScroll';

