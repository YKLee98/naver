// packages/frontend/src/hooks/useWebSocket.ts
import { useEffect, useRef } from 'react';
import { useAppDispatch } from '@/hooks';
import websocketService from '@/services/websocket';

export function useWebSocket() {
  const dispatch = useAppDispatch();
  const isConnected = useRef(false);

  useEffect(() => {
    if (!isConnected.current) {
      websocketService.connect(dispatch);
      isConnected.current = true;
    }

    return () => {
      if (isConnected.current) {
        websocketService.disconnect();
        isConnected.current = false;
      }
    };
  }, [dispatch]);

  return {
    emit: websocketService.emit.bind(websocketService),
    on: websocketService.on.bind(websocketService),
    off: websocketService.off.bind(websocketService),
    isConnected: websocketService.isConnected,
  };
}