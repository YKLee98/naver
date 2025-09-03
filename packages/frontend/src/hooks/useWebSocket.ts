// packages/frontend/src/hooks/useWebSocket.ts
import { useEffect, useRef } from 'react';
import { useAppDispatch } from '@/hooks';
import websocketService from '@/services/websocket';

export function useWebSocket() {
  const dispatch = useAppDispatch();
  const isConnected = useRef(false);

  useEffect(() => {
    // WebSocket 연결 비활성화 - 백엔드에 WebSocket 서버가 없음
    // if (!isConnected.current) {
    //   websocketService.connect(dispatch);
    //   isConnected.current = true;
    // }

    return () => {
      // if (isConnected.current) {
      //   websocketService.disconnect();
      //   isConnected.current = false;
      // }
    };
  }, [dispatch]);

  return {
    emit: () => {}, // no-op
    on: () => {}, // no-op
    off: () => {}, // no-op
    isConnected: () => true, // 항상 연결된 것으로 표시
  };
}