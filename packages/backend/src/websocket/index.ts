// packages/backend/src/websocket/index.ts
import { Server as SocketIOServer, Socket } from 'socket.io';
import { ServiceContainer } from '../services/ServiceContainer.js';
import { logger } from '../utils/logger.js';
import jwt from 'jsonwebtoken';

interface SocketData {
  userId?: string;
  username?: string;
  role?: string;
  sessionId?: string;
}

/**
 * Setup WebSocket handlers
 */
export function setupSocketHandlers(
  io: SocketIOServer,
  services: ServiceContainer
): void {
  logger.info('Setting up WebSocket handlers...');

  // Authentication middleware
  io.use(async (socket: Socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      
      if (token) {
        // Verify JWT token
        const decoded = jwt.verify(
          token,
          process.env['JWT_SECRET'] || 'default-secret'
        ) as any;
        
        // Store user data in socket
        (socket.data as SocketData) = {
          userId: decoded.userId,
          username: decoded.username,
          role: decoded.role,
          sessionId: socket.id,
        };
        
        logger.info(`Authenticated socket connection: ${socket.id} for user: ${decoded.username}`);
      } else {
        // Allow unauthenticated connections but with limited access
        (socket.data as SocketData) = {
          sessionId: socket.id,
        };
        
        logger.info(`Unauthenticated socket connection: ${socket.id}`);
      }
      
      next();
    } catch (error: any) {
      logger.error('Socket authentication error:', error);
      next(new Error('Authentication failed'));
    }
  });

  // Connection handler
  io.on('connection', (socket: Socket) => {
    const socketData = socket.data as SocketData;
    
    logger.info(`New WebSocket connection: ${socket.id}`, {
      userId: socketData.userId,
      username: socketData.username,
      role: socketData.role,
    });

    // Join user-specific room if authenticated
    if (socketData.userId) {
      socket.join(`user:${socketData.userId}`);
      socket.join(`notifications:${socketData.userId}`);
      
      // Join role-specific rooms
      if (socketData.role) {
        socket.join(`role:${socketData.role}`);
      }
    }

    // Join public rooms
    socket.join('public');
    socket.join('dashboard');

    // Handle room subscriptions
    socket.on('subscribe', (room: string) => {
      if (isValidRoom(room, socketData)) {
        socket.join(room);
        logger.info(`Socket ${socket.id} joined room: ${room}`);
        socket.emit('subscribed', { room, success: true });
      } else {
        logger.warn(`Socket ${socket.id} denied access to room: ${room}`);
        socket.emit('subscribed', { room, success: false, error: 'Access denied' });
      }
    });

    // Handle room unsubscriptions
    socket.on('unsubscribe', (room: string) => {
      socket.leave(room);
      logger.info(`Socket ${socket.id} left room: ${room}`);
      socket.emit('unsubscribed', { room, success: true });
    });

    // Handle sync status requests
    socket.on('sync:status', async (callback: Function) => {
      try {
        if (services.hasService('syncService')) {
          const syncService = services.getService('syncService');
          const status = await syncService.getActiveSyncJobs();
          callback({ success: true, data: status });
        } else {
          callback({ success: false, error: 'Sync service not available' });
        }
      } catch (error: any) {
        logger.error('Error getting sync status:', error);
        callback({ success: false, error: error.message });
      }
    });

    // Handle inventory updates
    socket.on('inventory:update', async (data: any, callback: Function) => {
      try {
        if (!socketData.userId) {
          callback({ success: false, error: 'Authentication required' });
          return;
        }

        if (services.hasService('inventoryService')) {
          const inventoryService = services.getService('inventoryService');
          const result = await inventoryService.updateInventory(data);
          
          // Broadcast update to relevant rooms
          io.to('dashboard').emit('inventory:updated', result);
          
          callback({ success: true, data: result });
        } else {
          callback({ success: false, error: 'Inventory service not available' });
        }
      } catch (error: any) {
        logger.error('Error updating inventory:', error);
        callback({ success: false, error: error.message });
      }
    });

    // Handle price updates
    socket.on('price:update', async (data: any, callback: Function) => {
      try {
        if (!socketData.userId) {
          callback({ success: false, error: 'Authentication required' });
          return;
        }

        if (services.hasService('priceService')) {
          const priceService = services.getService('priceService');
          const result = await priceService.updatePrice(data);
          
          // Broadcast update to relevant rooms
          io.to('dashboard').emit('price:updated', result);
          
          callback({ success: true, data: result });
        } else {
          callback({ success: false, error: 'Price service not available' });
        }
      } catch (error: any) {
        logger.error('Error updating price:', error);
        callback({ success: false, error: error.message });
      }
    });

    // Handle notification requests
    socket.on('notification:mark_read', async (notificationId: string, callback: Function) => {
      try {
        if (!socketData.userId) {
          callback({ success: false, error: 'Authentication required' });
          return;
        }

        if (services.hasService('notificationService')) {
          const notificationService = services.getService('notificationService');
          await notificationService.markAsRead(notificationId, socketData.userId);
          callback({ success: true });
        } else {
          callback({ success: false, error: 'Notification service not available' });
        }
      } catch (error: any) {
        logger.error('Error marking notification as read:', error);
        callback({ success: false, error: error.message });
      }
    });

    // Handle dashboard data requests
    socket.on('dashboard:refresh', async (callback: Function) => {
      try {
        const dashboardData = await getDashboardData(services);
        callback({ success: true, data: dashboardData });
      } catch (error: any) {
        logger.error('Error refreshing dashboard:', error);
        callback({ success: false, error: error.message });
      }
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      logger.info(`Socket disconnected: ${socket.id}`, { reason });
      
      // Clean up any resources if needed
      if (socketData.userId) {
        io.to('dashboard').emit('user:offline', {
          userId: socketData.userId,
          username: socketData.username,
        });
      }
    });

    // Handle errors
    socket.on('error', (error: Error) => {
      logger.error(`Socket error for ${socket.id}:`, error);
    });

    // Send initial data to authenticated users
    if (socketData.userId) {
      socket.emit('connected', {
        sessionId: socket.id,
        userId: socketData.userId,
        username: socketData.username,
        role: socketData.role,
        timestamp: new Date().toISOString(),
      });

      // Send any pending notifications
      if (services.hasService('notificationService')) {
        const notificationService = services.getService('notificationService');
        notificationService.getUnread(socketData.userId).then((notifications) => {
          if (notifications && notifications.length > 0) {
            socket.emit('notifications:unread', notifications);
          }
        }).catch((error) => {
          logger.error('Error fetching unread notifications:', error);
        });
      }
    } else {
      socket.emit('connected', {
        sessionId: socket.id,
        timestamp: new Date().toISOString(),
      });
    }

    // Heartbeat/ping mechanism
    socket.on('ping', (callback: Function) => {
      if (callback) {
        callback({ pong: true, timestamp: Date.now() });
      }
    });
  });

  // Setup service event emitters
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
  // Helper function to check if service supports events
  const isEventEmitter = (service: any): boolean => {
    return service && 
           typeof service.on === 'function' && 
           typeof service.emit === 'function';
  };

  // Sync service events
  if (services.hasService('syncService')) {
    const syncService = services.getService('syncService');
    
    if (isEventEmitter(syncService)) {
      syncService.on('sync:started', (data: any) => {
        io.to(`sync:${data.jobId}`).emit('sync:started', data);
        io.to('dashboard').emit('sync:started', data);
      });

      syncService.on('sync:progress', (data: any) => {
        io.to(`sync:${data.jobId}`).emit('sync:progress', data);
      });

      syncService.on('sync:completed', (data: any) => {
        io.to(`sync:${data.jobId}`).emit('sync:completed', data);
        io.to('dashboard').emit('sync:completed', data);
      });

      syncService.on('sync:failed', (data: any) => {
        io.to(`sync:${data.jobId}`).emit('sync:failed', data);
        io.to('dashboard').emit('sync:failed', data);
      });
    } else {
      logger.warn('SyncService does not support event emitting');
    }
  }

  // Notification service events
  if (services.hasService('notificationService')) {
    const notificationService = services.getService('notificationService');
    
    if (isEventEmitter(notificationService)) {
      notificationService.on('notification:created', (data: any) => {
        if (data.userId) {
          io.to(`notifications:${data.userId}`).emit('notification:new', data);
        }

        // Also send to dashboard if it's a system notification
        if (data.type === 'system') {
          io.to('dashboard').emit('notification:system', data);
        }
      });
    } else {
      logger.warn('NotificationService does not support event emitting');
    }
  }

  // Activity service events
  if (services.hasService('activityService')) {
    const activityService = services.getService('activityService');
    
    if (isEventEmitter(activityService)) {
      activityService.on('activity:created', (data: any) => {
        io.to('dashboard').emit('activity:new', data);
      });

      // Additional activity-specific events
      activityService.on('activity:sync', (data: any) => {
        io.to('dashboard').emit('activity:sync', data);
      });

      activityService.on('activity:inventory', (data: any) => {
        io.to('dashboard').emit('activity:inventory', data);
      });

      activityService.on('activity:price', (data: any) => {
        io.to('dashboard').emit('activity:price', data);
      });
    } else {
      logger.warn('ActivityService does not support event emitting');
    }
  }

  logger.info('✅ Service event emitters configured');
}

/**
 * Validate room access
 */
function isValidRoom(roomName: string, socketData: SocketData): boolean {
  // Public rooms
  const publicRooms = ['dashboard', 'public'];
  if (publicRooms.includes(roomName)) {
    return true;
  }

  // Authenticated user required for other rooms
  if (!socketData.userId) {
    return false;
  }

  // User-specific rooms
  if (roomName.startsWith(`user:${socketData.userId}`)) {
    return true;
  }

  // Sync job rooms
  if (roomName.startsWith('sync:')) {
    return true; // Could add more validation here
  }

  // Notification rooms
  if (roomName === `notifications:${socketData.userId}`) {
    return true;
  }

  // Admin-only rooms
  if (roomName.startsWith('admin:') && socketData.role !== 'admin') {
    return false;
  }

  return false;
}

/**
 * Get dashboard data
 */
async function getDashboardData(services: ServiceContainer): Promise<any> {
  const data: any = {
    timestamp: new Date().toISOString(),
    stats: {},
    recentActivities: [],
    systemHealth: {},
  };

  try {
    // Get sync statistics
    if (services.hasService('syncService')) {
      const syncService = services.getService('syncService');
      data.stats.sync = await syncService.getStatistics();
    }

    // Get recent activities
    if (services.hasService('activityService')) {
      const activityService = services.getService('activityService');
      data.recentActivities = await activityService.getRecent(10);
    }

    // Get system health
    data.systemHealth = {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      services: services.getInitializationStatus().summary,
    };

    return data;
  } catch (error: any) {
    logger.error('Failed to get dashboard data:', error);
    return data;
  }
}

// Export for use in other modules
export { SocketIOServer };
export { setupSocketHandlers as setupWebSocketHandlers };