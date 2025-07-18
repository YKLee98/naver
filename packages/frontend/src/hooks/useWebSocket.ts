import { useEffect, useRef } from 'react';
import { useDispatch } from 'react-redux';
import webSocketService from '@/services/websocket';
import { AppDispatch } from '@/store';

export function useWebSocket() {
  const dispatch = useDispatch<AppDispatch>();
  const isInitialized = useRef(false);

  useEffect(() => {
    if (!isInitialized.current) {
      webSocketService.connect(dispatch);
      isInitialized.current = true;
    }

    return () => {
      if (isInitialized.current) {
        webSocketService.disconnect();
        isInitialized.current = false;
      }
    };
  }, [dispatch]);

  return webSocketService;
}

