// packages/backend/src/websocket/events/price.events.ts
import { Server, Socket } from 'socket.io';
import { logger } from '../../utils/logger';
import { PriceSyncService } from '../../services/sync';
import { getRedisClient } from '../../config/redis';

export function registerPriceEvents(io: Server, socket: Socket): void {
  // 가격 동기화 진행 상황 구독
  socket.on('price:subscribe', async (data: { room?: string }) => {
    const room = data.room || 'price:updates';
    socket.join(room);
    logger.info(`Socket ${socket.id} joined price room: ${room}`);
  });

  // 가격 동기화 진행 상황 구독 해제
  socket.on('price:unsubscribe', async (data: { room?: string }) => {
    const room = data.room || 'price:updates';
    socket.leave(room);
    logger.info(`Socket ${socket.id} left price room: ${room}`);
  });

  // 실시간 가격 업데이트 요청
  socket.on('price:check', async (data: { skus: string[] }) => {
    try {
      const redis = getRedisClient();
      
      // Redis에서 캐시된 가격 정보 조회
      const priceData = await Promise.all(
        data.skus.map(async (sku) => {
          const cacheKey = `price:${sku}`;
          const cached = await redis.get(cacheKey);
          
          if (cached) {
            return JSON.parse(cached);
          }
          
          return {
            sku,
            status: 'not_cached',
            message: 'Price data not available in cache'
          };
        })
      );

      socket.emit('price:check:response', {
        success: true,
        data: priceData
      });
    } catch (error) {
      logger.error('Error checking prices:', error);
      socket.emit('price:check:response', {
        success: false,
        error: 'Failed to check prices'
      });
    }
  });

  // 가격 동기화 시작 알림
  socket.on('price:sync:start', async (data: { jobId: string; skus: string[] }) => {
    io.to('price:updates').emit('price:sync:started', {
      jobId: data.jobId,
      skus: data.skus,
      timestamp: new Date()
    });
  });

  // 가격 동기화 진행 상황 업데이트
  socket.on('price:sync:progress', async (data: { 
    jobId: string; 
    progress: number; 
    currentSku?: string;
    message?: string;
  }) => {
    io.to('price:updates').emit('price:sync:progress', {
      jobId: data.jobId,
      progress: data.progress,
      currentSku: data.currentSku,
      message: data.message,
      timestamp: new Date()
    });
  });

  // 가격 동기화 완료 알림
  socket.on('price:sync:complete', async (data: { 
    jobId: string; 
    success: boolean;
    results?: any;
    error?: string;
  }) => {
    io.to('price:updates').emit('price:sync:completed', {
      jobId: data.jobId,
      success: data.success,
      results: data.results,
      error: data.error,
      timestamp: new Date()
    });
  });

  // 환율 업데이트 알림
  socket.on('exchange:rate:updated', async (data: { 
    rate: number;
    source: string;
    timestamp: Date;
  }) => {
    io.emit('exchange:rate:update', {
      rate: data.rate,
      source: data.source,
      timestamp: data.timestamp
    });
  });
}

// 가격 업데이트 이벤트 발송 헬퍼 함수
export function emitPriceUpdate(io: Server, data: {
  sku: string;
  naverPrice?: number;
  shopifyPrice?: number;
  margin?: number;
  exchangeRate?: number;
  status: 'success' | 'error' | 'warning';
  message?: string;
}): void {
  io.to('price:updates').emit('price:updated', {
    ...data,
    timestamp: new Date()
  });
}

// 대량 가격 업데이트 이벤트 발송 헬퍼 함수
export function emitBulkPriceUpdate(io: Server, data: {
  jobId: string;
  totalCount: number;
  successCount: number;
  failureCount: number;
  results: Array<{
    sku: string;
    status: 'success' | 'error';
    message?: string;
  }>;
}): void {
  io.to('price:updates').emit('price:bulk:updated', {
    ...data,
    timestamp: new Date()
  });
}