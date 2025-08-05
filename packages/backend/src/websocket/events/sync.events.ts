// packages/backend/src/websocket/events/sync.events.ts
import { Server, Socket } from 'socket.io';
import { logger } from '../../utils/logger';
import { SyncJob } from '../../models';

export function registerSyncEvents(io: Server, socket: Socket): void {
  // 동기화 진행 상황 구독
  socket.on('sync:subscribe', async (data: { jobId?: string }) => {
    if (data.jobId) {
      socket.join(`sync:${data.jobId}`);
      logger.info(`Socket ${socket.id} subscribed to sync job: ${data.jobId}`);
      
      // 현재 동기화 상태 전송
      try {
        const job = await SyncJob.findById(data.jobId);
        if (job) {
          socket.emit('sync:status', {
            jobId: job._id,
            status: job.status,
            progress: job.progress,
            startedAt: job.startedAt,
            completedAt: job.completedAt,
          });
        }
      } catch (error) {
        logger.error('Error fetching sync job:', error);
      }
    } else {
      socket.join('sync:updates');
      logger.info(`Socket ${socket.id} subscribed to all sync updates`);
    }
  });

  // 동기화 진행 상황 구독 해제
  socket.on('sync:unsubscribe', async (data: { jobId?: string }) => {
    if (data.jobId) {
      socket.leave(`sync:${data.jobId}`);
    } else {
      socket.leave('sync:updates');
    }
  });

  // 동기화 상태 조회
  socket.on('sync:status', async (data: { jobId: string }) => {
    try {
      const job = await SyncJob.findById(data.jobId);
      socket.emit('sync:status:response', {
        success: true,
        data: job,
      });
    } catch (error) {
      socket.emit('sync:status:response', {
        success: false,
        error: 'Failed to fetch sync status',
      });
    }
  });
}

// 동기화 진행 상황 업데이트 브로드캐스트
export function broadcastSyncProgress(io: Server, data: {
  jobId: string;
  status: string;
  progress: number;
  currentItem?: string;
  message?: string;
}): void {
  // 특정 작업 구독자에게 전송
  io.to(`sync:${data.jobId}`).emit('sync:progress', data);
  
  // 전체 구독자에게도 전송
  io.to('sync:updates').emit('sync:progress', data);
}

// 동기화 완료 알림
export function broadcastSyncComplete(io: Server, data: {
  jobId: string;
  status: 'completed' | 'failed';
  results?: any;
  error?: string;
}): void {
  io.to(`sync:${data.jobId}`).emit('sync:complete', data);
  io.to('sync:updates').emit('sync:complete', data);
}