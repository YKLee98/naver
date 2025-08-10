// packages/frontend/src/services/websocket.ts
import io, { Socket } from 'socket.io-client';
import { AppDispatch } from '@/store';
import {
  updateInventoryRealTime,
  updatePriceRealTime,
  updateExchangeRate,
  addActivity,
  addNotification,
  setConnected,
  setReconnecting,
  incrementReconnectAttempts,
  resetReconnectAttempts,
  setWebSocketError,
} from '@/store/slices';

class WebSocketService {
  private socket: Socket | null = null;
  private dispatch: AppDispatch | null = null;
  private reconnectInterval: number = 5000;
  private maxReconnectAttempts: number = 5;

  connect(dispatch: AppDispatch): void {
    this.dispatch = dispatch;
    const token = localStorage.getItem('token');
    
    if (!token) {
      console.error('No authentication token found');
      dispatch(setWebSocketError('No authentication token'));
      return;
    }

    // Use regular HTTP URL for Socket.IO (it will upgrade to WS automatically)
    const wsUrl = import.meta.env.VITE_WS_URL || 'http://localhost:3000';
    
    this.socket = io(wsUrl, {
      auth: {
        token,
      },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: this.reconnectInterval,
      reconnectionAttempts: this.maxReconnectAttempts,
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    if (!this.socket || !this.dispatch) return;

    // Connection events
    this.socket.on('connect', () => {
      console.log('WebSocket connected');
      this.dispatch!(setConnected(true));
      this.dispatch!(resetReconnectAttempts());
      
      this.dispatch!(addNotification({
        type: 'success',
        title: '실시간 연결',
        message: '실시간 데이터 연결이 성공했습니다.',
      }));
    });

    this.socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
      this.dispatch!(setConnected(false));
      
      this.dispatch!(addNotification({
        type: 'warning',
        title: '연결 끊김',
        message: '실시간 데이터 연결이 끊어졌습니다. 재연결 중...',
      }));
    });

    this.socket.on('reconnect_attempt', (attemptNumber) => {
      console.log(`WebSocket reconnection attempt ${attemptNumber}`);
      this.dispatch!(setReconnecting(true));
      this.dispatch!(incrementReconnectAttempts());
    });

    this.socket.on('reconnect', () => {
      console.log('WebSocket reconnected');
      this.dispatch!(setConnected(true));
      this.dispatch!(setReconnecting(false));
      this.dispatch!(resetReconnectAttempts());
      
      this.dispatch!(addNotification({
        type: 'success',
        title: '재연결 성공',
        message: '실시간 데이터 연결이 복구되었습니다.',
      }));
    });

    this.socket.on('reconnect_failed', () => {
      console.error('WebSocket reconnection failed');
      this.dispatch!(setReconnecting(false));
      this.dispatch!(setWebSocketError('Failed to reconnect'));
      
      this.dispatch!(addNotification({
        type: 'error',
        title: '연결 실패',
        message: '실시간 데이터 연결에 실패했습니다. 페이지를 새로고침해주세요.',
      }));
    });

    this.socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
      this.dispatch!(setWebSocketError(error.message));
    });

    // Data events
    this.socket.on('inventory:update', (data) => {
      console.log('Inventory update received:', data);
      this.dispatch!(updateInventoryRealTime(data));
    });

    this.socket.on('price:update', (data) => {
      console.log('Price update received:', data);
      this.dispatch!(updatePriceRealTime(data));
    });

    this.socket.on('exchange-rate:update', (data) => {
      console.log('Exchange rate update received:', data);
      this.dispatch!(updateExchangeRate(data));
    });

    this.socket.on('activity:new', (data) => {
      console.log('New activity received:', data);
      this.dispatch!(addActivity(data));
    });

    this.socket.on('notification', (data) => {
      console.log('Notification received:', data);
      this.dispatch!(addNotification({
        type: data.type || 'info',
        title: data.title || '알림',
        message: data.message || '',
      }));
    });

    // Error handling
    this.socket.on('error', (error) => {
      console.error('WebSocket error:', error);
      this.dispatch!(setWebSocketError(error.message || 'Unknown error'));
      
      this.dispatch!(addNotification({
        type: 'error',
        title: '실시간 오류',
        message: error.message || '실시간 데이터 처리 중 오류가 발생했습니다.',
      }));
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  emit(event: string, data: any): void {
    if (this.socket && this.socket.connected) {
      this.socket.emit(event, data);
    } else {
      console.warn('WebSocket is not connected. Cannot emit event:', event);
    }
  }

  on(event: string, callback: (data: any) => void): void {
    if (this.socket) {
      this.socket.on(event, callback);
    }
  }

  off(event: string, callback?: (data: any) => void): void {
    if (this.socket) {
      if (callback) {
        this.socket.off(event, callback);
      } else {
        this.socket.off(event);
      }
    }
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }
}

export default new WebSocketService();