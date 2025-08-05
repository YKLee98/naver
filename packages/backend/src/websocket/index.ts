// packages/backend/src/websocket/index.ts
import { Server as SocketIOServer } from 'socket.io';
import { SocketServer } from './SocketServer';
import { logger } from '../utils/logger';

let socketServer: SocketServer | null = null;

export function initializeWebSocket(io: SocketIOServer): void {
  if (socketServer) {
    logger.warn('WebSocket server already initialized');
    return;
  }

  socketServer = new SocketServer(io);
  logger.info('WebSocket server initialized successfully');
}

export function getSocketServer(): SocketServer {
  if (!socketServer) {
    throw new Error('Socket server not initialized. Call initializeWebSocket() first.');
  }
  return socketServer;
}

// Re-export from other modules
export { SocketServer } from './SocketServer';
export { 
  broadcastInventoryUpdate, 
  broadcastOutOfStock 
} from './events/inventory.events';
export { 
  emitPriceUpdate, 
  emitBulkPriceUpdate 
} from './events/price.events';
export { 
  broadcastSyncProgress, 
  broadcastSyncComplete 
} from './events/sync.events';