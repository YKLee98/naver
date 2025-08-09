// packages/backend/src/websocket/SocketServer.ts
import { Server, Socket } from 'socket.io';
import { logger } from '../utils/logger';
import {
  registerSyncEvents,
  registerInventoryEvents,
  registerPriceEvents
} from './events';

/**
 * Enterprise WebSocket Server Management
 * Handles all real-time communication with clients
 */
export class SocketServer {
  private io: Server;
  private connectedClients: Map<string, Socket> = new Map();
  private rooms: Map<string, Set<string>> = new Map();

  constructor(io: Server) {
    this.io = io;
    this.setupMiddleware();
    this.setupConnectionHandlers();
    logger.info('SocketServer initialized');
  }

  /**
   * Setup authentication and validation middleware
   */
  private setupMiddleware(): void {
    this.io.use(async (socket: Socket, next) => {
      try {
        // Extract token from auth header or query
        const token = socket.handshake.auth?.token || 
                     socket.handshake.query?.token;

        if (token) {
          // TODO: Validate JWT token here
          // const decoded = jwt.verify(token, config.jwt.secret);
          // socket.data.user = decoded;
          socket.data.authenticated = true;
        } else {
          socket.data.authenticated = false;
        }

        // Add request ID for tracking
        socket.data.requestId = `ws-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        next();
      } catch (error: any) {
        logger.error('WebSocket authentication error:', error);
        next(new Error('Authentication failed'));
      }
    });
  }

  /**
   * Setup connection event handlers
   */
  private setupConnectionHandlers(): void {
    this.io.on('connection', (socket: Socket) => {
      this.handleConnection(socket);
    });

    this.io.on('error', (error) => {
      logger.error('WebSocket server error:', error);
    });
  }

  /**
   * Handle new client connection
   */
  private handleConnection(socket: Socket): void {
    const clientId = socket.id;
    const requestId = socket.data.requestId;

    logger.info(`New WebSocket connection: ${clientId}`, {
      requestId,
      authenticated: socket.data.authenticated,
      origin: socket.handshake.headers.origin,
      userAgent: socket.handshake.headers['user-agent']
    });

    // Store client reference
    this.connectedClients.set(clientId, socket);

    // Authenticate if needed
    this.authenticateSocket(socket);

    // Register event handlers
    this.registerEventHandlers(socket);

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      logger.info(`Socket disconnected: ${clientId}`, { reason });
      this.handleDisconnection(socket);
    });

    // Handle errors
    socket.on('error', (error) => {
      logger.error(`Socket error for ${clientId}:`, error);
    });

    // Send connection acknowledgment
    socket.emit('connected', {
      id: clientId,
      timestamp: new Date().toISOString(),
      authenticated: socket.data.authenticated
    });
  }

  /**
   * Handle client disconnection
   */
  private handleDisconnection(socket: Socket): void {
    const clientId = socket.id;

    // Remove from connected clients
    this.connectedClients.delete(clientId);

    // Remove from all rooms
    this.rooms.forEach((clients, room) => {
      clients.delete(clientId);
      if (clients.size === 0) {
        this.rooms.delete(room);
      }
    });
  }

  /**
   * Authenticate socket connection
   */
  private authenticateSocket(socket: Socket): void {
    const user = socket.data.user;

    if (!user) {
      logger.warn(`Socket ${socket.id} connected without authentication`);
      socket.emit('auth:required', {
        message: 'Authentication required for full access'
      });
      return;
    }

    logger.info(`Socket ${socket.id} authenticated as user ${user.id}`);
    socket.emit('auth:success', {
      user: {
        id: user.id,
        email: user.email,
        role: user.role
      }
    });
  }

  /**
   * Register all event handlers for a socket
   */
  private registerEventHandlers(socket: Socket): void {
    // Register domain-specific event handlers
    registerSyncEvents(this.io, socket);
    registerInventoryEvents(this.io, socket);
    registerPriceEvents(this.io, socket);

    // Common event handlers
    this.registerCommonEvents(socket);
    this.registerRoomEvents(socket);
    this.registerHealthEvents(socket);
  }

  /**
   * Register common event handlers
   */
  private registerCommonEvents(socket: Socket): void {
    // Ping-pong for connection health
    socket.on('ping', (callback) => {
      if (typeof callback === 'function') {
        callback({ timestamp: Date.now() });
      } else {
        socket.emit('pong', { timestamp: Date.now() });
      }
    });

    // Echo test
    socket.on('echo', (data, callback) => {
      if (typeof callback === 'function') {
        callback(data);
      } else {
        socket.emit('echo:response', data);
      }
    });

    // Request server time
    socket.on('time:request', () => {
      socket.emit('time:response', {
        timestamp: Date.now(),
        iso: new Date().toISOString()
      });
    });
  }

  /**
   * Register room-related event handlers
   */
  private registerRoomEvents(socket: Socket): void {
    // Join room
    socket.on('room:join', async (data: { room: string }, callback) => {
      try {
        const room = data.room;
        
        if (!room) {
          throw new Error('Room name is required');
        }

        await socket.join(room);
        
        // Track room membership
        if (!this.rooms.has(room)) {
          this.rooms.set(room, new Set());
        }
        this.rooms.get(room)!.add(socket.id);

        logger.info(`Socket ${socket.id} joined room: ${room}`);

        // Notify room members
        socket.to(room).emit('room:member:joined', {
          socketId: socket.id,
          room,
          timestamp: Date.now()
        });

        if (typeof callback === 'function') {
          callback({ success: true, room });
        }
      } catch (error: any) {
        logger.error(`Error joining room:`, error);
        if (typeof callback === 'function') {
          callback({ success: false, error: error.message });
        }
      }
    });

    // Leave room
    socket.on('room:leave', async (data: { room: string }, callback) => {
      try {
        const room = data.room;
        
        if (!room) {
          throw new Error('Room name is required');
        }

        await socket.leave(room);
        
        // Update room membership tracking
        if (this.rooms.has(room)) {
          this.rooms.get(room)!.delete(socket.id);
          if (this.rooms.get(room)!.size === 0) {
            this.rooms.delete(room);
          }
        }

        logger.info(`Socket ${socket.id} left room: ${room}`);

        // Notify room members
        socket.to(room).emit('room:member:left', {
          socketId: socket.id,
          room,
          timestamp: Date.now()
        });

        if (typeof callback === 'function') {
          callback({ success: true, room });
        }
      } catch (error: any) {
        logger.error(`Error leaving room:`, error);
        if (typeof callback === 'function') {
          callback({ success: false, error: error.message });
        }
      }
    });

    // Broadcast to room
    socket.on('room:broadcast', (data: { room: string; event: string; payload: any }) => {
      if (!socket.data.authenticated) {
        socket.emit('error', { message: 'Authentication required' });
        return;
      }

      const { room, event, payload } = data;
      socket.to(room).emit(event, payload);
      logger.debug(`Broadcast to room ${room}:`, { event, payload });
    });

    // Get room members
    socket.on('room:members', async (data: { room: string }, callback) => {
      try {
        const room = data.room;
        const members = this.rooms.get(room) || new Set();
        
        if (typeof callback === 'function') {
          callback({
            success: true,
            room,
            members: Array.from(members),
            count: members.size
          });
        }
      } catch (error: any) {
        if (typeof callback === 'function') {
          callback({ success: false, error: error.message });
        }
      }
    });
  }

  /**
   * Register health check events
   */
  private registerHealthEvents(socket: Socket): void {
    socket.on('health:check', (callback) => {
      const health = {
        status: 'healthy',
        timestamp: Date.now(),
        connections: this.connectedClients.size,
        rooms: this.rooms.size,
        uptime: process.uptime()
      };

      if (typeof callback === 'function') {
        callback(health);
      } else {
        socket.emit('health:status', health);
      }
    });
  }

  // Public methods for external event emission

  /**
   * Emit event to all connected clients
   */
  public emit(event: string, data: any): void {
    this.io.emit(event, data);
    logger.debug(`Emitted to all clients:`, { event, data });
  }

  /**
   * Emit event to specific room
   */
  public emitToRoom(room: string, event: string, data: any): void {
    this.io.to(room).emit(event, data);
    logger.debug(`Emitted to room ${room}:`, { event, data });
  }

  /**
   * Emit event to specific socket
   */
  public emitToSocket(socketId: string, event: string, data: any): void {
    const socket = this.connectedClients.get(socketId);
    if (socket) {
      socket.emit(event, data);
      logger.debug(`Emitted to socket ${socketId}:`, { event, data });
    } else {
      logger.warn(`Socket ${socketId} not found`);
    }
  }

  /**
   * Get Socket.IO server instance
   */
  public getIO(): Server {
    return this.io;
  }

  /**
   * Get connected clients count
   */
  public getConnectionCount(): number {
    return this.connectedClients.size;
  }

  /**
   * Get room member count
   */
  public getRoomMemberCount(room: string): number {
    return this.rooms.get(room)?.size || 0;
  }

  /**
   * Check if socket is connected
   */
  public isSocketConnected(socketId: string): boolean {
    return this.connectedClients.has(socketId);
  }

  /**
   * Disconnect specific socket
   */
  public disconnectSocket(socketId: string, reason?: string): void {
    const socket = this.connectedClients.get(socketId);
    if (socket) {
      socket.disconnect(true);
      logger.info(`Forcefully disconnected socket ${socketId}`, { reason });
    }
  }

  /**
   * Broadcast system notification
   */
  public broadcastNotification(notification: {
    type: 'info' | 'warning' | 'error' | 'success';
    title: string;
    message: string;
    metadata?: any;
  }): void {
    this.io.emit('notification', {
      ...notification,
      timestamp: Date.now(),
      id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    });
  }
}