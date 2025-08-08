// packages/backend/src/websocket.ts

import { Server as SocketIOServer, Socket } from 'socket.io';
import { logger } from './utils/logger';

export function setupWebSocket(io: SocketIOServer): void {
  logger.info('Setting up WebSocket server...');

  // Middleware for authentication (optional)
  io.use((socket: Socket, next) => {
    // TODO: Add authentication logic here if needed
    // const token = socket.handshake.auth.token;
    // if (!token) {
    //   return next(new Error('Authentication error'));
    // }
    next();
  });

  // Connection handler
  io.on('connection', (socket: Socket) => {
    logger.info(`New WebSocket connection: ${socket.id}`);

    // Join room based on user ID or session
    socket.on('join-room', (room: string) => {
      socket.join(room);
      logger.info(`Socket ${socket.id} joined room: ${room}`);
    });

    // Handle sync status updates
    socket.on('sync-status', (data: any) => {
      logger.info('Sync status update:', data);
      // Broadcast to all clients in the room
      socket.broadcast.emit('sync-status-update', data);
    });

    // Handle inventory updates
    socket.on('inventory-update', (data: any) => {
      logger.info('Inventory update:', data);
      io.emit('inventory-changed', data);
    });

    // Handle price updates
    socket.on('price-update', (data: any) => {
      logger.info('Price update:', data);
      io.emit('price-changed', data);
    });

    // Handle mapping updates
    socket.on('mapping-update', (data: any) => {
      logger.info('Mapping update:', data);
      io.emit('mapping-changed', data);
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      logger.info(`Socket disconnected: ${socket.id}`);
    });

    // Error handling
    socket.on('error', (error: Error) => {
      logger.error(`Socket error for ${socket.id}:`, error);
    });
  });

  logger.info('WebSocket server setup complete');
}

// Export utility functions for emitting events from other parts of the app
export const emitToAll = (io: SocketIOServer, event: string, data: any) => {
  io.emit(event, data);
};

export const emitToRoom = (io: SocketIOServer, room: string, event: string, data: any) => {
  io.to(room).emit(event, data);
};

export default setupWebSocket;