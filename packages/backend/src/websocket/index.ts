// packages/backend/src/websocket/index.ts
import { Server as SocketIOServer } from 'socket.io';
import { ServiceContainer } from '../services/ServiceContainer.js';
import { logger } from '../utils/logger.js';
import jwt from 'jsonwebtoken';

interface SocketData {
  userId?: string;
  role?: string;
  joinedRooms: Set<string>;
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
  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth['token'] ||
        socket.handshake.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        // Allow anonymous connections but with limited access
        socket.data = { joinedRooms: new Set() } as SocketData;
        return next();
      }

      // Verify JWT token
      const decoded = jwt.verify(
        token,
        process.env['JWT_SECRET'] || 'secret'
      ) as any;
      socket.data = {
        userId: decoded.userId,
        role: decoded.role,
        joinedRooms: new Set(),
      } as SocketData;

      logger.info(`WebSocket authenticated: User ${decoded.userId}`);
      next();
    } catch (error: any) {
      logger.error('WebSocket authentication failed:', error);
      next(new Error('Authentication failed'));
    }
  });

  // Connection handler
  io.on('connection', (socket) => {
    logger.info(
      `WebSocket client connected: ${socket.id} (User: ${socket.data.userId || 'anonymous'})`
    );

    // Join user-specific room if authenticated
    if (socket.data.userId) {
      socket.join(`user:${socket.data.userId}`);
      socket.data.joinedRooms.add(`user:${socket.data.userId}`);
    }

    // ==================================
    // Room Management
    // ==================================

    socket.on('join:room', async (roomName: string, callback?: Function) => {
      try {
        // Validate room access (implement your logic)
        if (!isValidRoom(roomName, socket.data)) {
          throw new Error('Access denied to room');
        }

        await socket.join(roomName);
        socket.data.joinedRooms.add(roomName);

        logger.info(`Socket ${socket.id} joined room: ${roomName}`);

        if (callback) {
          callback({ success: true, room: roomName });
        }
      } catch (error: any) {
        logger.error(`Failed to join room ${roomName}:`, error);
        if (callback) {
          callback({ success: false, error: error.message });
        }
      }
    });

    socket.on('leave:room', async (roomName: string, callback?: Function) => {
      try {
        await socket.leave(roomName);
        socket.data.joinedRooms.delete(roomName);

        logger.info(`Socket ${socket.id} left room: ${roomName}`);

        if (callback) {
          callback({ success: true, room: roomName });
        }
      } catch (error: any) {
        logger.error(`Failed to leave room ${roomName}:`, error);
        if (callback) {
          callback({ success: false, error: error.message });
        }
      }
    });

    // ==================================
    // Sync Events
    // ==================================

    socket.on('sync:subscribe', async (jobId: string, callback?: Function) => {
      try {
        const roomName = `sync:${jobId}`;
        await socket.join(roomName);
        socket.data.joinedRooms.add(roomName);

        logger.info(`Socket ${socket.id} subscribed to sync job: ${jobId}`);

        // Send current sync status if available
        if (services.hasService('syncService')) {
          const syncService = services.getService('syncService');
          const status = await syncService.getJobStatus(jobId);

          if (status) {
            socket.emit('sync:status', status);
          }
        }

        if (callback) {
          callback({ success: true, jobId });
        }
      } catch (error: any) {
        logger.error(`Failed to subscribe to sync job ${jobId}:`, error);
        if (callback) {
          callback({ success: false, error: error.message });
        }
      }
    });

    socket.on(
      'sync:unsubscribe',
      async (jobId: string, callback?: Function) => {
        try {
          const roomName = `sync:${jobId}`;
          await socket.leave(roomName);
          socket.data.joinedRooms.delete(roomName);

          logger.info(
            `Socket ${socket.id} unsubscribed from sync job: ${jobId}`
          );

          if (callback) {
            callback({ success: true, jobId });
          }
        } catch (error: any) {
          if (callback) {
            callback({ success: false, error: error.message });
          }
        }
      }
    );

    socket.on('sync:start', async (options: any, callback?: Function) => {
      try {
        if (!socket.data.userId) {
          throw new Error('Authentication required');
        }

        if (!services.hasService('syncService')) {
          throw new Error('Sync service not available');
        }

        const syncService = services.getService('syncService');
        const job = await syncService.startSync({
          ...options,
          userId: socket.data.userId,
        });

        // Auto-subscribe to job updates
        const roomName = `sync:${job.id}`;
        await socket.join(roomName);
        socket.data.joinedRooms.add(roomName);

        if (callback) {
          callback({ success: true, job });
        }
      } catch (error: any) {
        logger.error('Failed to start sync:', error);
        if (callback) {
          callback({ success: false, error: error.message });
        }
      }
    });

    // ==================================
    // Dashboard Events
    // ==================================

    socket.on('dashboard:subscribe', async (callback?: Function) => {
      try {
        await socket.join('dashboard');
        socket.data.joinedRooms.add('dashboard');

        logger.info(`Socket ${socket.id} subscribed to dashboard`);

        // Send initial dashboard data
        const dashboardData = await getDashboardData(services);
        socket.emit('dashboard:data', dashboardData);

        if (callback) {
          callback({ success: true });
        }
      } catch (error: any) {
        logger.error('Failed to subscribe to dashboard:', error);
        if (callback) {
          callback({ success: false, error: error.message });
        }
      }
    });

    socket.on('dashboard:refresh', async (callback?: Function) => {
      try {
        const dashboardData = await getDashboardData(services);
        socket.emit('dashboard:data', dashboardData);

        if (callback) {
          callback({ success: true, data: dashboardData });
        }
      } catch (error: any) {
        logger.error('Failed to refresh dashboard:', error);
        if (callback) {
          callback({ success: false, error: error.message });
        }
      }
    });

    // ==================================
    // Notification Events
    // ==================================

    socket.on('notification:subscribe', async (callback?: Function) => {
      try {
        if (!socket.data.userId) {
          throw new Error('Authentication required');
        }

        const roomName = `notifications:${socket.data.userId}`;
        await socket.join(roomName);
        socket.data.joinedRooms.add(roomName);

        logger.info(`Socket ${socket.id} subscribed to notifications`);

        if (callback) {
          callback({ success: true });
        }
      } catch (error: any) {
        logger.error('Failed to subscribe to notifications:', error);
        if (callback) {
          callback({ success: false, error: error.message });
        }
      }
    });

    socket.on(
      'notification:markRead',
      async (notificationId: string, callback?: Function) => {
        try {
          if (!socket.data.userId) {
            throw new Error('Authentication required');
          }

          if (services.hasService('notificationService')) {
            const notificationService = services.getService(
              'notificationService'
            );
            await notificationService.markAsRead(
              notificationId,
              socket.data.userId
            );
          }

          if (callback) {
            callback({ success: true });
          }
        } catch (error: any) {
          logger.error('Failed to mark notification as read:', error);
          if (callback) {
            callback({ success: false, error: error.message });
          }
        }
      }
    );

    // ==================================
    // Disconnection Handler
    // ==================================

    socket.on('disconnect', (reason) => {
      logger.info(
        `WebSocket client disconnected: ${socket.id} (Reason: ${reason})`
      );

      // Clean up room memberships
      socket.data.joinedRooms.clear();
    });

    // ==================================
    // Error Handler
    // ==================================

    socket.on('error', (error) => {
      logger.error(`WebSocket error for client ${socket.id}:`, error);
    });

    // ==================================
    // Ping/Pong for connection health
    // ==================================

    socket.on('ping', (callback?: Function) => {
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
  // Sync service events
  if (services.hasService('syncService')) {
    const syncService = services.getService('syncService');

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
  }

  // Notification service events
  if (services.hasService('notificationService')) {
    const notificationService = services.getService('notificationService');

    notificationService.on('notification:created', (data: any) => {
      if (data.userId) {
        io.to(`notifications:${data.userId}`).emit('notification:new', data);
      }

      // Also send to dashboard if it's a system notification
      if (data.type === 'system') {
        io.to('dashboard').emit('notification:system', data);
      }
    });
  }

  // Activity service events
  if (services.hasService('activityService')) {
    const activityService = services.getService('activityService');

    activityService.on('activity:created', (data: any) => {
      io.to('dashboard').emit('activity:new', data);
    });
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
