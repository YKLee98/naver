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

    const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:3001';

    this.socket = io(wsUrl, {
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

    // 연결 이벤트
    this.socket.on('connect', () => {
      console.log('WebSocket connected');
      this.reconnectAttempts = 0;
      
      this.dispatch?.addNotification({
        type: 'success',
        title: '연결됨',
        message: '실시간 업데이트가 활성화되었습니다.',
      });
    });

    // 연결 해제 이벤트
    this.socket.on('disconnect', (reason) => {
      console.log('WebSocket disconnected:', reason);
      
      this.dispatch?.addNotification({
        type: 'warning',
        title: '연결 끊김',
        message: '실시간 업데이트가 일시적으로 중단되었습니다.',
      });
    });

    // 재연결 시도
    this.socket.on('reconnect_attempt', (attemptNumber) => {
      this.reconnectAttempts = attemptNumber;
      console.log(`Reconnection attempt ${attemptNumber}`);
    });

    // 재연결 실패
    this.socket.on('reconnect_failed', () => {
      this.dispatch?.addNotification({
        type: 'error',
        title: '연결 실패',
        message: '서버와의 연결을 재설정할 수 없습니다.',
      });
    });

    // 에러 처리
    this.socket.on('error', (error) => {
      console.error('WebSocket error:', error);
    });

    // 재고 업데이트
    this.socket.on('inventory:updated', (data) => {
      this.dispatch?.updateInventoryRealTime(data);
      
      this.dispatch?.addActivity({
        id: Date.now().toString(),
        type: 'inventory',
        action: 'update',
        sku: data.sku,
        details: data,
        timestamp: new Date().toISOString(),
      });
    });

    // 재고 현재 상태
    this.socket.on('inventory:current', (data) => {
      data.inventory.forEach((item: any) => {
        this.dispatch?.updateInventoryRealTime({
          sku: item.sku,
          quantity: item.quantity,
          platform: 'current',
          transactionType: 'sync',
          timestamp: item.lastUpdated || new Date().toISOString(),
        });
      });
    });

    // 재고 에러
    this.socket.on('inventory:error', (data) => {
      this.dispatch?.addNotification({
        type: 'error',
        title: '재고 오류',
        message: data.message,
      });
    });

    // 가격 업데이트
    this.socket.on('price:updated', (data) => {
      this.dispatch?.updatePriceRealTime(data);
      
      this.dispatch?.addActivity({
        id: Date.now().toString(),
        type: 'price',
        action: 'update',
        sku: data.sku,
        details: data,
        timestamp: new Date().toISOString(),
      });
    });

    // 환율 업데이트
    this.socket.on('exchangeRate:updated', (data) => {
      this.dispatch?.updateExchangeRate(data);
      
      this.dispatch?.addNotification({
        type: 'info',
        title: '환율 업데이트',
        message: `새로운 환율: 1 KRW = ${data.rate} USD`,
      });
    });

    // 동기화 상태 업데이트
    this.socket.on('sync:progress', (data) => {
      this.dispatch?.addActivity({
        id: Date.now().toString(),
        type: 'sync',
        action: 'progress',
        details: data,
        timestamp: new Date().toISOString(),
      });
    });

    // 동기화 완료
    this.socket.on('sync:complete', (data) => {
      this.dispatch?.addNotification({
        type: 'success',
        title: '동기화 완료',
        message: `${data.successCount}개 항목이 성공적으로 동기화되었습니다.`,
      });
    });

    // 핑퐁
    this.socket.on('pong', (data) => {
      console.log('Pong received:', data);
    });
  }

  // 재고 구독
  subscribeToInventory(skus: string[]): void {
    if (!this.socket) return;
    this.socket.emit('inventory:subscribe', { skus });
  }

  // 재고 구독 해제
  unsubscribeFromInventory(skus: string[]): void {
    if (!this.socket) return;
    this.socket.emit('inventory:unsubscribe', { skus });
  }

  // 재고 조정
  adjustInventory(sku: string, adjustment: number, reason: string): void {
    if (!this.socket) return;
    this.socket.emit('inventory:adjust', { sku, adjustment, reason });
  }

  // 재고 이력 요청
  requestInventoryHistory(sku: string, limit?: number): void {
    if (!this.socket) return;
    this.socket.emit('inventory:history', { sku, limit });
  }

  // 가격 구독
  subscribeToPricing(skus: string[]): void {
    if (!this.socket) return;
    this.socket.emit('price:subscribe', { skus });
  }

  // 가격 구독 해제
  unsubscribeFromPricing(skus: string[]): void {
    if (!this.socket) return;
    this.socket.emit('price:unsubscribe', { skus });
  }

  // 환율 구독
  subscribeToExchangeRate(): void {
    if (!this.socket) return;
    this.socket.emit('exchangeRate:subscribe');
  }

  // 수동 환율 설정
  setManualExchangeRate(rate: number, reason: string): void {
    if (!this.socket) return;
    this.socket.emit('exchangeRate:setManual', { rate, reason });
  }

  // 연결 해제
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  // 재연결
  reconnect(): void {
    if (this.socket) {
      this.socket.connect();
    }
  }

  // 연결 상태 확인
  isConnected(): boolean {
    return this.socket?.connected || false;
  }

  // 핑 보내기
  ping(): void {
    if (!this.socket) return;
    this.socket.emit('ping');
  }
}

const webSocketService = new WebSocketService();

// 자동 연결 초기화 함수
export function initializeWebSocket(dispatch: AppDispatch): () => void {
  webSocketService.connect(dispatch);
  
  // 주기적 핑 설정
  const pingInterval = setInterval(() => {
    if (webSocketService.isConnected()) {
      webSocketService.ping();
    }
  }, 30000); // 30초마다

  // 정리 함수 반환
  return () => {
    clearInterval(pingInterval);
    webSocketService.disconnect();
  };
}

export default webSocketService;

