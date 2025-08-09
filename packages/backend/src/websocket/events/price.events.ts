// packages/backend/src/websocket/events/price.events.ts
import { Server, Socket } from 'socket.io';
import { logger } from '../../utils/logger';

/**
 * Register price-related WebSocket event handlers
 */
export function registerPriceEvents(io: Server, socket: Socket): void {
  // Get price status
  socket.on('price:status', async (data: { sku?: string }, callback) => {
    try {
      // TODO: Get actual price status from price service
      const status = {
        sku: data.sku,
        naverPrice: 45000,
        shopifyPrice: 38.08,
        exchangeRate: 1300,
        margin: 0.1,
        lastUpdated: new Date().toISOString()
      };

      if (typeof callback === 'function') {
        callback({ success: true, status });
      }
    } catch (error: any) {
      logger.error('Error getting price status', error);
      if (typeof callback === 'function') {
        callback({ success: false, error: error.message });
      }
    }
  });

  // Update price
  socket.on('price:update', async (data: {
    sku: string;
    naverPrice?: number;
    shopifyPrice?: number;
    margin?: number;
    reason?: string;
  }, callback) => {
    try {
      logger.info(`Price update requested by ${socket.id}`, data);
      
      // Broadcast price update to all clients
      io.emit('price:updated', {
        ...data,
        updatedBy: socket.id,
        timestamp: Date.now()
      });

      if (typeof callback === 'function') {
        callback({ success: true });
      }
    } catch (error: any) {
      logger.error('Error updating price', error);
      if (typeof callback === 'function') {
        callback({ success: false, error: error.message });
      }
    }
  });

  // Subscribe to price updates for specific SKU
  socket.on('price:subscribe:sku', async (data: { sku: string }, callback) => {
    try {
      const room = `price:sku:${data.sku}`;
      await socket.join(room);
      logger.info(`Socket ${socket.id} subscribed to price updates for SKU ${data.sku}`);

      if (typeof callback === 'function') {
        callback({ success: true, room });
      }
    } catch (error: any) {
      logger.error('Error subscribing to SKU price', error);
      if (typeof callback === 'function') {
        callback({ success: false, error: error.message });
      }
    }
  });

  // Unsubscribe from price updates
  socket.on('price:unsubscribe:sku', async (data: { sku: string }, callback) => {
    try {
      const room = `price:sku:${data.sku}`;
      await socket.leave(room);
      logger.info(`Socket ${socket.id} unsubscribed from price updates for SKU ${data.sku}`);

      if (typeof callback === 'function') {
        callback({ success: true });
      }
    } catch (error: any) {
      logger.error('Error unsubscribing from SKU price', error);
      if (typeof callback === 'function') {
        callback({ success: false, error: error.message });
      }
    }
  });

  // Get exchange rate
  socket.on('price:exchange-rate', async (callback) => {
    try {
      // TODO: Get actual exchange rate from service
      const rate = {
        baseCurrency: 'KRW',
        targetCurrency: 'USD',
        rate: 1300,
        lastUpdated: new Date().toISOString(),
        source: 'exchangerate-api'
      };

      if (typeof callback === 'function') {
        callback({ success: true, rate });
      }
    } catch (error: any) {
      logger.error('Error getting exchange rate', error);
      if (typeof callback === 'function') {
        callback({ success: false, error: error.message });
      }
    }
  });
}

/**
 * Emit price update event
 */
export function emitPriceUpdate(
  io: Server,
  data: {
    sku: string;
    productName?: string;
    previousNaverPrice: number;
    newNaverPrice: number;
    previousShopifyPrice: number;
    newShopifyPrice: number;
    exchangeRate: number;
    margin: number;
    reason?: string;
  }
): void {
  const event = {
    ...data,
    timestamp: Date.now(),
    naverPriceChange: data.newNaverPrice - data.previousNaverPrice,
    shopifyPriceChange: data.newShopifyPrice - data.previousShopifyPrice,
    naverPriceChangePercent: ((data.newNaverPrice - data.previousNaverPrice) / data.previousNaverPrice) * 100,
    shopifyPriceChangePercent: ((data.newShopifyPrice - data.previousShopifyPrice) / data.previousShopifyPrice) * 100
  };

  // Emit to all clients
  io.emit('price:changed', event);

  // Emit to SKU-specific room
  io.to(`price:sku:${data.sku}`).emit('price:sku:changed', event);

  logger.info('Emit price update', event);
}

/**
 * Emit bulk price update event
 */
export function emitBulkPriceUpdate(
  io: Server,
  data: {
    items: Array<{
      sku: string;
      previousPrice: number;
      newPrice: number;
      platform: 'naver' | 'shopify';
    }>;
    reason?: string;
    totalUpdated: number;
    totalFailed: number;
  }
): void {
  const event = {
    ...data,
    timestamp: Date.now()
  };

  // Emit to all clients
  io.emit('price:bulk:updated', event);

  // Emit to individual SKU rooms
  data.items.forEach(item => {
    io.to(`price:sku:${item.sku}`).emit('price:sku:changed', {
      ...item,
      timestamp: Date.now(),
      reason: data.reason,
      priceChange: item.newPrice - item.previousPrice,
      priceChangePercent: ((item.newPrice - item.previousPrice) / item.previousPrice) * 100
    });
  });

  logger.info('Emit bulk price update', {
    totalUpdated: data.totalUpdated,
    totalFailed: data.totalFailed
  });
}

/**
 * Broadcast price alert
 */
export function broadcastPriceAlert(
  io: Server,
  data: {
    sku: string;
    productName: string;
    alertType: 'PRICE_INCREASE' | 'PRICE_DECREASE' | 'MARGIN_LOW' | 'PRICE_MISMATCH';
    severity: 'info' | 'warning' | 'critical';
    details: {
      currentPrice?: number;
      expectedPrice?: number;
      difference?: number;
      percentChange?: number;
      margin?: number;
      threshold?: number;
    };
    message: string;
  }
): void {
  const event = {
    ...data,
    timestamp: Date.now(),
    id: `price-alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  };

  // Emit price alert to all clients
  io.emit('price:alert', event);

  // Emit to SKU-specific room
  io.to(`price:sku:${data.sku}`).emit('price:sku:alert', event);

  // Also emit as general alert
  io.emit(`alert:${data.severity}`, {
    type: 'price',
    ...event
  });

  logger.warn('Broadcast price alert', event);
}

/**
 * Broadcast exchange rate update
 */
export function broadcastExchangeRateUpdate(
  io: Server,
  data: {
    baseCurrency: string;
    targetCurrency: string;
    previousRate: number;
    newRate: number;
    changePercent: number;
    source: string;
  }
): void {
  const event = {
    ...data,
    timestamp: Date.now(),
    change: data.newRate - data.previousRate
  };

  // Emit to all clients
  io.emit('price:exchange-rate:updated', event);

  // If significant change, emit alert
  if (Math.abs(data.changePercent) > 2) {
    io.emit('alert:info', {
      type: 'exchange_rate',
      severity: Math.abs(data.changePercent) > 5 ? 'warning' : 'info',
      message: `Exchange rate changed by ${data.changePercent.toFixed(2)}%`,
      ...event
    });
  }

  logger.info('Broadcast exchange rate update', event);
}

/**
 * Broadcast price sync status
 */
export function broadcastPriceSyncStatus(
  io: Server,
  data: {
    status: 'started' | 'in_progress' | 'completed' | 'failed';
    itemsProcessed?: number;
    totalItems?: number;
    errors?: string[];
    message?: string;
  }
): void {
  const event = {
    ...data,
    timestamp: Date.now(),
    progress: data.totalItems ? (data.itemsProcessed || 0) / data.totalItems * 100 : 0
  };

  // Emit to all clients
  io.emit('price:sync:status', event);

  logger.debug('Broadcast price sync status', event);
}

/**
 * Broadcast margin alert
 */
export function broadcastMarginAlert(
  io: Server,
  data: {
    sku: string;
    productName: string;
    currentMargin: number;
    targetMargin: number;
    naverPrice: number;
    shopifyPrice: number;
    exchangeRate: number;
  }
): void {
  const event = {
    ...data,
    timestamp: Date.now(),
    marginDifference: data.currentMargin - data.targetMargin,
    alert: data.currentMargin < data.targetMargin ? 'MARGIN_BELOW_TARGET' : 'MARGIN_ABOVE_TARGET',
    severity: data.currentMargin < 0 ? 'critical' : data.currentMargin < data.targetMargin * 0.5 ? 'warning' : 'info'
  };

  // Emit to all clients
  io.emit('price:margin:alert', event);

  // Emit to SKU-specific room
  io.to(`price:sku:${data.sku}`).emit('price:sku:margin:alert', event);

  // Also emit as general alert
  io.emit(`alert:${event.severity}`, {
    type: 'margin',
    ...event
  });

  logger.warn('Broadcast margin alert', event);
}