// packages/backend/src/websocket/events/sync.events.ts
import { Server, Socket } from 'socket.io';
import { logger } from '../../utils/logger';

/**
 * Register sync-related WebSocket event handlers
 */
export function registerSyncEvents(io: Server, socket: Socket): void {
  // Sync start event
  socket.on(
    'sync:start',
    async (data: { type: string; sku?: string }, callback) => {
      try {
        logger.info(`Sync start requested by ${socket.id}`, data);

        // Broadcast to all clients that sync has started
        io.emit('sync:started', {
          type: data.type,
          sku: data.sku,
          startedBy: socket.id,
          timestamp: Date.now(),
        });

        if (typeof callback === 'function') {
          callback({ success: true });
        }
      } catch (error: any) {
        logger.error('Error handling sync:start', error);
        if (typeof callback === 'function') {
          callback({ success: false, error: error.message });
        }
      }
    }
  );

  // Sync status request
  socket.on('sync:status', async (callback) => {
    try {
      // TODO: Get actual sync status from sync service
      const status = {
        isRunning: false,
        currentJob: null,
        lastSync: new Date().toISOString(),
        queue: [],
      };

      if (typeof callback === 'function') {
        callback({ success: true, status });
      }
    } catch (error: any) {
      logger.error('Error getting sync status', error);
      if (typeof callback === 'function') {
        callback({ success: false, error: error.message });
      }
    }
  });

  // Cancel sync request
  socket.on('sync:cancel', async (data: { jobId: string }, callback) => {
    try {
      logger.info(`Sync cancel requested for job ${data.jobId}`);

      // Broadcast cancellation
      io.emit('sync:cancelled', {
        jobId: data.jobId,
        cancelledBy: socket.id,
        timestamp: Date.now(),
      });

      if (typeof callback === 'function') {
        callback({ success: true });
      }
    } catch (error: any) {
      logger.error('Error cancelling sync', error);
      if (typeof callback === 'function') {
        callback({ success: false, error: error.message });
      }
    }
  });

  // Subscribe to sync updates for specific SKU
  socket.on('sync:subscribe:sku', async (data: { sku: string }, callback) => {
    try {
      const room = `sync:sku:${data.sku}`;
      await socket.join(room);
      logger.info(
        `Socket ${socket.id} subscribed to sync updates for SKU ${data.sku}`
      );

      if (typeof callback === 'function') {
        callback({ success: true, room });
      }
    } catch (error: any) {
      logger.error('Error subscribing to SKU sync', error);
      if (typeof callback === 'function') {
        callback({ success: false, error: error.message });
      }
    }
  });

  // Unsubscribe from sync updates
  socket.on('sync:unsubscribe:sku', async (data: { sku: string }, callback) => {
    try {
      const room = `sync:sku:${data.sku}`;
      await socket.leave(room);
      logger.info(
        `Socket ${socket.id} unsubscribed from sync updates for SKU ${data.sku}`
      );

      if (typeof callback === 'function') {
        callback({ success: true });
      }
    } catch (error: any) {
      logger.error('Error unsubscribing from SKU sync', error);
      if (typeof callback === 'function') {
        callback({ success: false, error: error.message });
      }
    }
  });
}

/**
 * Broadcast sync progress to all connected clients
 */
export function broadcastSyncProgress(
  io: Server,
  data: {
    jobId: string;
    type: string;
    progress: number;
    total: number;
    current: number;
    message?: string;
    sku?: string;
  }
): void {
  const event = {
    ...data,
    timestamp: Date.now(),
    percentage: Math.round((data.progress / data.total) * 100),
  };

  // Emit to all clients
  io.emit('sync:progress', event);

  // If SKU specific, also emit to SKU room
  if (data.sku) {
    io.to(`sync:sku:${data.sku}`).emit('sync:sku:progress', event);
  }

  logger.debug('Broadcast sync progress', event);
}

/**
 * Broadcast sync completion
 */
export function broadcastSyncComplete(
  io: Server,
  data: {
    jobId: string;
    type: string;
    success: boolean;
    itemsSynced: number;
    errors?: any[];
    duration: number;
    sku?: string;
  }
): void {
  const event = {
    ...data,
    timestamp: Date.now(),
  };

  // Emit to all clients
  io.emit('sync:complete', event);

  // If SKU specific, also emit to SKU room
  if (data.sku) {
    io.to(`sync:sku:${data.sku}`).emit('sync:sku:complete', event);
  }

  logger.info('Broadcast sync complete', event);
}

/**
 * Broadcast sync error
 */
export function broadcastSyncError(
  io: Server,
  data: {
    jobId: string;
    type: string;
    error: string;
    details?: any;
    sku?: string;
  }
): void {
  const event = {
    ...data,
    timestamp: Date.now(),
  };

  // Emit error to all clients
  io.emit('sync:error', event);

  // If SKU specific, also emit to SKU room
  if (data.sku) {
    io.to(`sync:sku:${data.sku}`).emit('sync:sku:error', event);
  }

  logger.error('Broadcast sync error', event);
}

/**
 * Notify specific client about sync status change
 */
export function notifySyncStatusChange(
  socket: Socket,
  status: {
    jobId: string;
    previousStatus: string;
    newStatus: string;
    message?: string;
  }
): void {
  socket.emit('sync:status:changed', {
    ...status,
    timestamp: Date.now(),
  });
}

/**
 * Broadcast batch sync update
 */
export function broadcastBatchSyncUpdate(
  io: Server,
  data: {
    jobId: string;
    batchNumber: number;
    totalBatches: number;
    itemsInBatch: number;
    itemsProcessed: number;
    errors: number;
    skus?: string[];
  }
): void {
  const event = {
    ...data,
    timestamp: Date.now(),
    batchProgress: Math.round((data.itemsProcessed / data.itemsInBatch) * 100),
    overallProgress: Math.round((data.batchNumber / data.totalBatches) * 100),
  };

  io.emit('sync:batch:update', event);

  // Notify SKU-specific rooms if applicable
  if (data.skus && data.skus.length > 0) {
    data.skus.forEach((sku) => {
      io.to(`sync:sku:${sku}`).emit('sync:sku:batch:update', {
        ...event,
        sku,
      });
    });
  }

  logger.debug('Broadcast batch sync update', event);
}
