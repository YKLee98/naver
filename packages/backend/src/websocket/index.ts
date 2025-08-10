// packages/backend/src/websocket/index.ts
import { Server as SocketIOServer, Socket } from 'socket.io';
import { ServiceContainer } from '../services/ServiceContainer.js';
import { logger } from '../utils/logger.js';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  user?: any;
}

/**
 * Setup WebSocket handlers
 */
export function setupSocketHandlers(
  io: SocketIOServer,
  services: ServiceContainer
): void {
  // Authentication middleware
  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      const token = socket.handshake.auth.token || 
                   socket.handshake.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        return next(new Error('Authentication required'));
      }

      const decoded = jwt.verify(token, config.jwt.secret) as any;
      socket.userId = decoded.id;
      socket.user = decoded;
      
      next();
    } catch (error) {
      logger.error('WebSocket authentication failed:', error);
      next(new Error('Authentication failed'));
    }
  });

  // Connection handler
  io.on('connection', (socket: AuthenticatedSocket) => {
    logger.info(`WebSocket client connected: ${socket.id} (User: ${socket.userId})`);

    // Join user room
    if (socket.userId) {
      socket.join(`user:${socket.userId}`);
    }

    // Handle sync events
    socket.on('sync:subscribe', (jobId: string) => {
      socket.join(`sync:${jobId}`);
      logger.debug(`Client ${socket.id} subscribed to sync job ${jobId}`);
    });

    socket.on('sync:unsubscribe', (jobId: string) => {
      socket.leave(`sync:${jobId}`);
      logger.debug(`Client ${socket.id} unsubscribed from sync job ${jobId}`);
    });

    // Handle dashboard events
    socket.on('dashboard:subscribe', () => {
      socket.join('dashboard');
      logger.debug(`Client ${socket.id} subscribed to dashboard`);
    });

    // Handle real-time queries
    socket.on('metrics:get', async (callback) => {
      try {
        const metrics = await services.getMetrics();
        callback({ success: true, data: metrics });
      } catch (error) {
        callback({ success: false, error: (error as Error).message });
      }
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      logger.info(`WebSocket client disconnected: ${socket.id} (Reason: ${reason})`);
    });

    // Error handler
    socket.on('error', (error) => {
      logger.error(`WebSocket error for client ${socket.id}:`, error);
    });
  });

  // Setup event emitters from services
  setupServiceEventEmitters(io, services);
  
  logger.info('✅ WebSocket handlers initialized');
}

/**
 * Setup service event emitters
 */
function setupServiceEventEmitters(
  io: SocketIOServer,
  services: ServiceContainer
): void {
  // Sync service events
  if (services.hasService('syncService')) {
    const syncService = services.getService('syncService');
    
    syncService.on('sync:started', (data) => {
      io.to(`sync:${data.jobId}`).emit('sync:started', data);
      io.to('dashboard').emit('sync:started', data);
    });

    syncService.on('sync:progress', (data) => {
      io.to(`sync:${data.jobId}`).emit('sync:progress', data);
    });

    syncService.on('sync:completed', (data) => {
      io.to(`sync:${data.jobId}`).emit('sync:completed', data);
      io.to('dashboard').emit('sync:completed', data);
    });

    syncService.on('sync:failed', (data) => {
      io.to(`sync:${data.jobId}`).emit('sync:failed', data);
      io.to('dashboard').emit('sync:failed', data);
    });
  }

  // Health check events
  if (services.hasService('healthCheckService')) {
    const healthService = services.getService('healthCheckService');
    
    healthService.on('health:unhealthy', (data) => {
      io.to('dashboard').emit('health:alert', {
        type: 'error',
        message: 'System health check failed',
        data
      });
    });

    healthService.on('health:degraded', (data) => {
      io.to('dashboard').emit('health:alert', {
        type: 'warning',
        message: 'System health degraded',
        data
      });
    });
  }
}

/**
 * WebSocket event handlers
 */
export class WebSocketManager {
  private io: SocketIOServer;
  private services: ServiceContainer;
  private connectedClients: Map<string, AuthenticatedSocket> = new Map();

  constructor(io: SocketIOServer, services: ServiceContainer) {
    this.io = io;
    this.services = services;
  }

  /**
   * Initialize WebSocket manager
   */
  initialize(): void {
    setupSocketHandlers(this.io, this.services);
  }

  /**
   * Emit event to specific user
   */
  emitToUser(userId: string, event: string, data: any): void {
    this.io.to(`user:${userId}`).emit(event, data);
  }

  /**
   * Emit event to specific room
   */
  emitToRoom(room: string, event: string, data: any): void {
    this.io.to(room).emit(event, data);
  }

  /**
   * Broadcast event to all connected clients
   */
  broadcast(event: string, data: any): void {
    this.io.emit(event, data);
  }

  /**
   * Get connected clients count
   */
  getConnectedClientsCount(): number {
    return this.io.sockets.sockets.size;
  }

  /**
   * Disconnect specific client
   */
  disconnectClient(socketId: string): void {
    const socket = this.io.sockets.sockets.get(socketId);
    if (socket) {
      socket.disconnect(true);
    }
  }

  /**
   * Get rooms for a specific socket
   */
  getSocketRooms(socketId: string): Set<string> | undefined {
    const socket = this.io.sockets.sockets.get(socketId);
    return socket?.rooms;
  }
}

// Export default setup function
export default setupSocketHandlers;

// Export all functions and classes
export {
  setupServiceEventEmitters,
  type AuthenticatedSocket
};