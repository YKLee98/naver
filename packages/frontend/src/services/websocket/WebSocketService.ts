// packages/frontend/src/services/websocket/WebSocketService.ts
import { io, Socket } from 'socket.io-client';
import { store } from '@store/index';
import { 
  setConnectionStatus, 
  addNotification,
  updateSyncStatus,
  updateInventory,
  updatePrices,
} from '@store/slices/websocketSlice';

/**
 * WebSocket event types
 */
export enum WebSocketEvent {
  // Connection events
  CONNECT = 'connect',
  DISCONNECT = 'disconnect',
  CONNECT_ERROR = 'connect_error',
  RECONNECT = 'reconnect',
  RECONNECT_ATTEMPT = 'reconnect_attempt',
  
  // Business events
  SYNC_STARTED = 'sync:started',
  SYNC_PROGRESS = 'sync:progress',
  SYNC_COMPLETED = 'sync:completed',
  SYNC_FAILED = 'sync:failed',
  
  INVENTORY_UPDATED = 'inventory:updated',
  PRICE_UPDATED = 'price:updated',
  
  NOTIFICATION = 'notification',
  ALERT = 'alert',
  
  // Real-time data events
  DASHBOARD_UPDATE = 'dashboard:update',
  ACTIVITY_LOG = 'activity:log',
  METRIC_UPDATE = 'metric:update',
}

/**
 * WebSocket message interface
 */
export interface WebSocketMessage<T = any> {
  event: string;
  data: T;
  timestamp: string;
  id?: string;
  metadata?: Record<string, any>;
}

/**
 * Connection options
 */
interface ConnectionOptions {
  autoConnect?: boolean;
  reconnection?: boolean;
  reconnectionAttempts?: number;
  reconnectionDelay?: number;
  timeout?: number;
}

/**
 * Enterprise-grade WebSocket Service
 */
class WebSocketService {
  private socket: Socket | null = null;
  private isConnected = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private messageQueue: WebSocketMessage[] = [];
  private eventHandlers = new Map<string, Set<Function>>();
  private connectionPromise: Promise<void> | null = null;

  /**
   * Initialize WebSocket connection
   */
  async connect(options: ConnectionOptions = {}): Promise<void> {
    // Return existing connection promise if connecting
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    // Already connected
    if (this.isConnected && this.socket?.connected) {
      return Promise.resolve();
    }

    this.connectionPromise = this.createConnection(options);
    
    try {
      await this.connectionPromise;
    } finally {
      this.connectionPromise = null;
    }
  }

  /**
   * Create WebSocket connection
   */
  private async createConnection(options: ConnectionOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:3001';
      const token = localStorage.getItem('authToken');

      if (!token) {
        reject(new Error('No authentication token available'));
        return;
      }

      // Create socket instance
      this.socket = io(wsUrl, {
        auth: { token },
        transports: ['websocket', 'polling'],
        reconnection: options.reconnection !== false,
        reconnectionAttempts: options.reconnectionAttempts || 5,
        reconnectionDelay: options.reconnectionDelay || 1000,
        reconnectionDelayMax: 5000,
        timeout: options.timeout || 20000,
        autoConnect: options.autoConnect !== false,
        query: {
          version: import.meta.env.VITE_APP_VERSION || '1.0.0',
          platform: 'web',
        },
      });

      // Setup event handlers
      this.setupEventHandlers();

      // Handle connection success
      this.socket.once('connect', () => {
        this.isConnected = true;
        store.dispatch(setConnectionStatus('connected'));
        this.startHeartbeat();
        this.flushMessageQueue();
        console.log('[WebSocket] Connected successfully');
        resolve();
      });

      // Handle connection error
      this.socket.once('connect_error', (error) => {
        console.error('[WebSocket] Connection error:', error);
        store.dispatch(setConnectionStatus('error'));
        reject(error);
      });

      // Set connection timeout
      const timeout = setTimeout(() => {
        if (!this.isConnected) {
          this.socket?.disconnect();
          reject(new Error('WebSocket connection timeout'));
        }
      }, options.timeout || 20000);

      // Clear timeout on connection
      this.socket.once('connect', () => {
        clearTimeout(timeout);
      });
    });
  }

  /**
   * Setup WebSocket event handlers
   */
  private setupEventHandlers(): void {
    if (!this.socket) return;

    // Connection events
    this.socket.on('connect', this.handleConnect.bind(this));
    this.socket.on('disconnect', this.handleDisconnect.bind(this));
    this.socket.on('connect_error', this.handleConnectError.bind(this));
    this.socket.on('reconnect', this.handleReconnect.bind(this));
    this.socket.on('reconnect_attempt', this.handleReconnectAttempt.bind(this));

    // Business events
    this.socket.on(WebSocketEvent.SYNC_STARTED, this.handleSyncStarted.bind(this));
    this.socket.on(WebSocketEvent.SYNC_PROGRESS, this.handleSyncProgress.bind(this));
    this.socket.on(WebSocketEvent.SYNC_COMPLETED, this.handleSyncCompleted.bind(this));
    this.socket.on(WebSocketEvent.SYNC_FAILED, this.handleSyncFailed.bind(this));

    this.socket.on(WebSocketEvent.INVENTORY_UPDATED, this.handleInventoryUpdate.bind(this));
    this.socket.on(WebSocketEvent.PRICE_UPDATED, this.handlePriceUpdate.bind(this));

    this.socket.on(WebSocketEvent.NOTIFICATION, this.handleNotification.bind(this));
    this.socket.on(WebSocketEvent.ALERT, this.handleAlert.bind(this));

    // Real-time data events
    this.socket.on(WebSocketEvent.DASHBOARD_UPDATE, this.handleDashboardUpdate.bind(this));
    this.socket.on(WebSocketEvent.ACTIVITY_LOG, this.handleActivityLog.bind(this));
    this.socket.on(WebSocketEvent.METRIC_UPDATE, this.handleMetricUpdate.bind(this));

    // Heartbeat
    this.socket.on('pong', this.handlePong.bind(this));
  }

  /**
   * Connection event handlers
   */
  private handleConnect(): void {
    console.log('[WebSocket] Connected');
    this.isConnected = true;
    store.dispatch(setConnectionStatus('connected'));
    this.startHeartbeat();
    this.flushMessageQueue();
    this.emit('ws:connected');
  }

  private handleDisconnect(reason: string): void {
    console.log('[WebSocket] Disconnected:', reason);
    this.isConnected = false;
    store.dispatch(setConnectionStatus('disconnected'));
    this.stopHeartbeat();
    this.emit('ws:disconnected', reason);
  }

  private handleConnectError(error: Error): void {
    console.error('[WebSocket] Connection error:', error);
    store.dispatch(setConnectionStatus('error'));
    this.emit('ws:error', error);
  }

  private handleReconnect(attemptNumber: number): void {
    console.log('[WebSocket] Reconnected after', attemptNumber, 'attempts');
    store.dispatch(setConnectionStatus('connected'));
    this.emit('ws:reconnected', attemptNumber);
  }

  private handleReconnectAttempt(attemptNumber: number): void {
    console.log('[WebSocket] Reconnection attempt', attemptNumber);
    store.dispatch(setConnectionStatus('reconnecting'));
    this.emit('ws:reconnecting', attemptNumber);
  }

  /**
   * Business event handlers
   */
  private handleSyncStarted(data: any): void {
    store.dispatch(updateSyncStatus({ status: 'started', data }));
    this.emit('sync:started', data);
  }

  private handleSyncProgress(data: any): void {
    store.dispatch(updateSyncStatus({ status: 'progress', data }));
    this.emit('sync:progress', data);
  }

  private handleSyncCompleted(data: any): void {
    store.dispatch(updateSyncStatus({ status: 'completed', data }));
    this.emit('sync:completed', data);
  }

  private handleSyncFailed(data: any): void {
    store.dispatch(updateSyncStatus({ status: 'failed', data }));
    this.emit('sync:failed', data);
  }

  private handleInventoryUpdate(data: any): void {
    store.dispatch(updateInventory(data));
    this.emit('inventory:updated', data);
  }

  private handlePriceUpdate(data: any): void {
    store.dispatch(updatePrices(data));
    this.emit('price:updated', data);
  }

  private handleNotification(data: any): void {
    store.dispatch(addNotification(data));
    this.emit('notification', data);
  }

  private handleAlert(data: any): void {
    store.dispatch(addNotification({ ...data, type: 'alert' }));
    this.emit('alert', data);
  }

  /**
   * Real-time data event handlers
   */
  private handleDashboardUpdate(data: any): void {
    this.emit('dashboard:update', data);
  }

  private handleActivityLog(data: any): void {
    this.emit('activity:log', data);
  }

  private handleMetricUpdate(data: any): void {
    this.emit('metric:update', data);
  }

  /**
   * Heartbeat management
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    
    this.heartbeatTimer = setInterval(() => {
      if (this.socket?.connected) {
        this.socket.emit('ping');
      }
    }, 25000); // Send ping every 25 seconds
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private handlePong(): void {
    // Server responded to ping
    console.debug('[WebSocket] Heartbeat response received');
  }

  /**
   * Message queue management
   */
  private queueMessage(message: WebSocketMessage): void {
    this.messageQueue.push(message);
    
    // Limit queue size
    if (this.messageQueue.length > 100) {
      this.messageQueue.shift();
    }
  }

  private flushMessageQueue(): void {
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      if (message) {
        this.send(message.event, message.data);
      }
    }
  }

  /**
   * Public methods
   */

  /**
   * Send message to server
   */
  send(event: string, data?: any): void {
    const message: WebSocketMessage = {
      event,
      data,
      timestamp: new Date().toISOString(),
      id: this.generateMessageId(),
    };

    if (!this.socket?.connected) {
      console.warn('[WebSocket] Not connected, queuing message:', event);
      this.queueMessage(message);
      return;
    }

    this.socket.emit(event, message);
    console.debug('[WebSocket] Sent message:', event, data);
  }

  /**
   * Subscribe to events
   */
  on(event: string, handler: Function): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    
    this.eventHandlers.get(event)!.add(handler);
    
    // Return unsubscribe function
    return () => {
      this.off(event, handler);
    };
  }

  /**
   * Unsubscribe from events
   */
  off(event: string, handler: Function): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.eventHandlers.delete(event);
      }
    }
  }

  /**
   * Emit event to local handlers
   */
  private emit(event: string, data?: any): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error(`[WebSocket] Error in event handler for ${event}:`, error);
        }
      });
    }
  }

  /**
   * Join a room/channel
   */
  join(room: string): void {
    if (this.socket?.connected) {
      this.socket.emit('join', room);
      console.log('[WebSocket] Joined room:', room);
    }
  }

  /**
   * Leave a room/channel
   */
  leave(room: string): void {
    if (this.socket?.connected) {
      this.socket.emit('leave', room);
      console.log('[WebSocket] Left room:', room);
    }
  }

  /**
   * Disconnect from server
   */
  disconnect(): void {
    this.stopHeartbeat();
    
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    
    this.isConnected = false;
    this.messageQueue = [];
    store.dispatch(setConnectionStatus('disconnected'));
    console.log('[WebSocket] Disconnected');
  }

  /**
   * Reconnect to server
   */
  async reconnect(): Promise<void> {
    this.disconnect();
    await this.connect();
  }

  /**
   * Get connection status
   */
  getStatus(): {
    connected: boolean;
    socketId?: string;
    transport?: string;
  } {
    return {
      connected: this.isConnected,
      socketId: this.socket?.id,
      transport: this.socket?.io.engine.transport.name,
    };
  }

  /**
   * Generate unique message ID
   */
  private generateMessageId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Export singleton instance
export const websocketService = new WebSocketService();

// Export convenience methods
export const ws = {
  connect: websocketService.connect.bind(websocketService),
  disconnect: websocketService.disconnect.bind(websocketService),
  reconnect: websocketService.reconnect.bind(websocketService),
  send: websocketService.send.bind(websocketService),
  on: websocketService.on.bind(websocketService),
  off: websocketService.off.bind(websocketService),
  join: websocketService.join.bind(websocketService),
  leave: websocketService.leave.bind(websocketService),
  getStatus: websocketService.getStatus.bind(websocketService),
};