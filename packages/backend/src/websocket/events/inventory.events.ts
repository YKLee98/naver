// packages/backend/src/websocket/events/inventory.events.ts
import { Server, Socket } from 'socket.io';
import { logger } from '../../utils/logger';

/**
 * Register inventory-related WebSocket event handlers
 */
export function registerInventoryEvents(io: Server, socket: Socket): void {
  // Get inventory status
  socket.on('inventory:status', async (data: { sku?: string }, callback) => {
    try {
      // TODO: Get actual inventory status from inventory service
      const status = {
        sku: data.sku,
        naverQuantity: 100,
        shopifyQuantity: 100,
        lastUpdated: new Date().toISOString(),
        inSync: true,
      };

      if (typeof callback === 'function') {
        callback({ success: true, status });
      }
    } catch (error: any) {
      logger.error('Error getting inventory status', error);
      if (typeof callback === 'function') {
        callback({ success: false, error: error.message });
      }
    }
  });

  // Adjust inventory
  socket.on(
    'inventory:adjust',
    async (
      data: {
        sku: string;
        platform: 'naver' | 'shopify' | 'both';
        quantity: number;
        reason: string;
      },
      callback
    ) => {
      try {
        logger.info(`Inventory adjustment requested by ${socket.id}`, data);

        // Broadcast adjustment to all clients
        io.emit('inventory:adjusted', {
          ...data,
          adjustedBy: socket.id,
          timestamp: Date.now(),
        });

        if (typeof callback === 'function') {
          callback({ success: true });
        }
      } catch (error: any) {
        logger.error('Error adjusting inventory', error);
        if (typeof callback === 'function') {
          callback({ success: false, error: error.message });
        }
      }
    }
  );

  // Subscribe to inventory updates for specific SKU
  socket.on(
    'inventory:subscribe:sku',
    async (data: { sku: string }, callback) => {
      try {
        const room = `inventory:sku:${data.sku}`;
        await socket.join(room);
        logger.info(
          `Socket ${socket.id} subscribed to inventory updates for SKU ${data.sku}`
        );

        if (typeof callback === 'function') {
          callback({ success: true, room });
        }
      } catch (error: any) {
        logger.error('Error subscribing to SKU inventory', error);
        if (typeof callback === 'function') {
          callback({ success: false, error: error.message });
        }
      }
    }
  );

  // Unsubscribe from inventory updates
  socket.on(
    'inventory:unsubscribe:sku',
    async (data: { sku: string }, callback) => {
      try {
        const room = `inventory:sku:${data.sku}`;
        await socket.leave(room);
        logger.info(
          `Socket ${socket.id} unsubscribed from inventory updates for SKU ${data.sku}`
        );

        if (typeof callback === 'function') {
          callback({ success: true });
        }
      } catch (error: any) {
        logger.error('Error unsubscribing from SKU inventory', error);
        if (typeof callback === 'function') {
          callback({ success: false, error: error.message });
        }
      }
    }
  );

  // Get low stock items
  socket.on(
    'inventory:low-stock',
    async (_data: { threshold?: number }, callback) => {
      try {
        // TODO: Get actual low stock items from inventory service
        const lowStockItems = [
          { sku: 'SKU001', quantity: 5, threshold: 10 },
          { sku: 'SKU002', quantity: 3, threshold: 10 },
        ];

        if (typeof callback === 'function') {
          callback({ success: true, items: lowStockItems });
        }
      } catch (error: any) {
        logger.error('Error getting low stock items', error);
        if (typeof callback === 'function') {
          callback({ success: false, error: error.message });
        }
      }
    }
  );
}

/**
 * Broadcast inventory update to all connected clients
 */
export function broadcastInventoryUpdate(
  io: Server,
  data: {
    sku: string;
    platform: 'naver' | 'shopify' | 'both';
    previousQuantity: number;
    newQuantity: number;
    reason?: string;
    transactionType?: string;
  }
): void {
  const event = {
    ...data,
    timestamp: Date.now(),
    difference: data.newQuantity - data.previousQuantity,
  };

  // Emit to all clients
  io.emit('inventory:updated', event);

  // Emit to SKU-specific room
  io.to(`inventory:sku:${data.sku}`).emit('inventory:sku:updated', event);

  logger.info('Broadcast inventory update', event);
}

/**
 * Broadcast out of stock alert
 */
export function broadcastOutOfStock(
  io: Server,
  data: {
    sku: string;
    productName: string;
    platform: 'naver' | 'shopify' | 'both';
    lastQuantity: number;
  }
): void {
  const event = {
    ...data,
    timestamp: Date.now(),
    alert: 'OUT_OF_STOCK',
  };

  // Emit critical alert to all clients
  io.emit('inventory:out-of-stock', event);

  // Emit to SKU-specific room
  io.to(`inventory:sku:${data.sku}`).emit('inventory:sku:out-of-stock', event);

  // Also emit as general alert
  io.emit('alert:critical', {
    type: 'inventory',
    severity: 'critical',
    ...event,
  });

  logger.warn('Broadcast out of stock alert', event);
}

/**
 * Broadcast low stock warning
 */
export function broadcastLowStock(
  io: Server,
  data: {
    sku: string;
    productName: string;
    platform: 'naver' | 'shopify' | 'both';
    currentQuantity: number;
    threshold: number;
  }
): void {
  const event = {
    ...data,
    timestamp: Date.now(),
    alert: 'LOW_STOCK',
  };

  // Emit warning to all clients
  io.emit('inventory:low-stock', event);

  // Emit to SKU-specific room
  io.to(`inventory:sku:${data.sku}`).emit('inventory:sku:low-stock', event);

  // Also emit as general alert
  io.emit('alert:warning', {
    type: 'inventory',
    severity: 'warning',
    ...event,
  });

  logger.warn('Broadcast low stock warning', event);
}

/**
 * Broadcast inventory sync status
 */
export function broadcastInventorySyncStatus(
  io: Server,
  data: {
    sku?: string;
    status: 'syncing' | 'synced' | 'error';
    message?: string;
    details?: any;
  }
): void {
  const event = {
    ...data,
    timestamp: Date.now(),
  };

  if (data.sku) {
    // SKU-specific sync status
    io.to(`inventory:sku:${data.sku}`).emit('inventory:sync:status', event);
  } else {
    // General inventory sync status
    io.emit('inventory:sync:status', event);
  }

  logger.debug('Broadcast inventory sync status', event);
}

/**
 * Broadcast inventory discrepancy alert
 */
export function broadcastInventoryDiscrepancy(
  io: Server,
  data: {
    sku: string;
    productName: string;
    naverQuantity: number;
    shopifyQuantity: number;
    difference: number;
    threshold: number;
  }
): void {
  const event = {
    ...data,
    timestamp: Date.now(),
    alert: 'INVENTORY_DISCREPANCY',
    severity:
      Math.abs(data.difference) > data.threshold * 2 ? 'critical' : 'warning',
  };

  // Emit to all clients
  io.emit('inventory:discrepancy', event);

  // Emit to SKU-specific room
  io.to(`inventory:sku:${data.sku}`).emit('inventory:sku:discrepancy', event);

  // Also emit as general alert
  io.emit(`alert:${event.severity}`, {
    type: 'inventory_discrepancy',
    ...event,
  });

  logger.warn('Broadcast inventory discrepancy', event);
}

/**
 * Broadcast bulk inventory update
 */
export function broadcastBulkInventoryUpdate(
  io: Server,
  data: {
    items: Array<{
      sku: string;
      previousQuantity: number;
      newQuantity: number;
      platform: string;
    }>;
    reason?: string;
    totalUpdated: number;
    totalFailed: number;
  }
): void {
  const event = {
    ...data,
    timestamp: Date.now(),
  };

  // Emit to all clients
  io.emit('inventory:bulk:updated', event);

  // Emit to individual SKU rooms
  data.items.forEach((item) => {
    io.to(`inventory:sku:${item.sku}`).emit('inventory:sku:updated', {
      ...item,
      timestamp: Date.now(),
      reason: data.reason,
    });
  });

  logger.info('Broadcast bulk inventory update', {
    totalUpdated: data.totalUpdated,
    totalFailed: data.totalFailed,
  });
}
