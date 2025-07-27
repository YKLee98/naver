// packages/frontend/src/services/websocket.ts
import io, { Socket } from 'socket.io-client';
import { AppDispatch } from '@/store';
import {
  updateInventoryRealTime,
  updatePriceRealTime,
  updateExchangeRate,
  addActivity,
  addNotification,
} from '@/store/slices';

class WebSocketService {
  private socket: Socket | null = null;
  private dispatch: AppDispatch | null = null;
  private reconnectInterval: number = 5000;
  private maxReconnectAttempts: number = 5;
  private reconnectAttempts: number = 0;

  connect(dispatch: AppDispatch): void {
    this.dispatch = dispatch;
    const token = localStorage.getItem('token');
    
    if (!token) {
      console.error('No authentication token found');
      return;
    }

    this.socket = io(import.meta.env.VITE_WS_URL || 'ws://localhost:3001', {
      auth: {
        token,
      },
      transports: ['websocket'],
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
      this.reconnectAttempts = 0;
      
      this.dispatch!(addNotification({
        type: 'success',
        title: '실시간 연결',
        message: '실시간 데이터 연결이 성공했습니다.',
      }));
    });

    this.socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
      
      this.dispatch!(addNotification({
        type: 'warning',
        title: '연결 끊김',
        message: '실시간 데이터 연결이 끊어졌습니다. 재연결 중...',
      }));
    });

    this.socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
      this.reconnectAttempts++;
      
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        this.dispatch!(addNotification({
          type: 'error',
          title: '연결 실패',
          message: '실시간 데이터 연결에 실패했습니다.',
        }));
      }
    });

    // Data events
    this.socket.on('inventory:update', (data) => {
      this.dispatch!(updateInventoryRealTime(data));
    });

    this.socket.on('price:update', (data) => {
      this.dispatch!(updatePriceRealTime(data));
    });

    this.socket.on('exchange-rate:update', (data) => {
      this.dispatch!(updateExchangeRate(data));
    });

    this.socket.on('activity:new', (data) => {
      this.dispatch!(addActivity(data));
    });

    this.socket.on('notification', (data) => {
      this.dispatch!(addNotification(data));
    });

    // Error handling
    this.socket.on('error', (error) => {
      console.error('WebSocket error:', error);
      
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
    this.dispatch = null;
  }

  emit(event: string, data: any): void {
    if (this.socket?.connected) {
      this.socket.emit(event, data);
    } else {
      console.warn('Socket not connected, cannot emit event:', event);
    }
  }

  on(event: string, callback: (...args: any[]) => void): void {
    if (this.socket) {
      this.socket.on(event, callback);
    }
  }

  off(event: string, callback?: (...args: any[]) => void): void {
    if (this.socket) {
      this.socket.off(event, callback);
    }
  }

  get isConnected(): boolean {
    return this.socket?.connected || false;
  }
}

export default new WebSocketService();