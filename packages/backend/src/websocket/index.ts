// packages/backend/src/websocket/index.ts
import { Server as SocketIOServer } from 'socket.io';
import { SocketServer } from './SocketServer';
import { logger } from '../utils/logger';

let socketServer: SocketServer | null = null;

/**
 * Initialize WebSocket server
 * Main entry point for WebSocket initialization
 */
export function initializeWebSocket(io: SocketIOServer): void {
  if (socketServer) {
    logger.warn('WebSocket server already initialized');
    return;
  }

  try {
    socketServer = new SocketServer(io);
    logger.info('WebSocket server initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize WebSocket server:', error);
    throw error;
  }
}

/**
 * Get the active socket server instance
 */
export function getSocketServer(): SocketServer {
  if (!socketServer) {
    throw new Error('Socket server not initialized. Call initializeWebSocket() first.');
  }
  return socketServer;
}

/**
 * Shutdown WebSocket server gracefully
 */
export function shutdownWebSocket(): void {
  if (socketServer) {
    logger.info('Shutting down WebSocket server...');
    socketServer = null;
  }
}

// Re-export all event handlers
export * from './events';
export { SocketServer } from './SocketServer';

// Export utility functions for external event emission
export const emitToAll = (event: string, data: any): void => {
  const server = getSocketServer();
  server.emit(event, data);
};

export const emitToRoom = (room: string, event: string, data: any): void => {
  const server = getSocketServer();
  server.emitToRoom(room, event, data);
};