
import { Socket } from 'socket.io';
import { SocketServer } from '../SocketServer';
import { InventoryTransaction, ProductMapping } from '../../models';
import { logger } from '../../utils/logger';

export function setupInventoryEvents(socket: Socket, server: SocketServer): void {
  // 실시간 재고 구독
  socket.on('inventory:subscribe', async (data: { skus: string[] }) => {
    try {
      const { skus } = data;
      
      if (!Array.isArray(skus) || skus.length === 0) {
        socket.emit('inventory:error', { message: 'Invalid SKUs' });
        return;
      }

      // SKU별 룸 참가
      skus.forEach(sku => {
        socket.join(`inventory:${sku}`);
      });

      // 현재 재고 상태 전송
      const currentInventory = await Promise.all(
        skus.map(async (sku) => {
          const lastTransaction = await InventoryTransaction.findOne({ sku })
            .sort({ createdAt: -1 })
            .lean();

          return {
            sku,
            quantity: lastTransaction?.newQuantity || 0,
            lastUpdated: lastTransaction?.createdAt || null,
          };
        })
      );

      socket.emit('inventory:current', { inventory: currentInventory });
      
      logger.info(`Client ${socket.id} subscribed to inventory updates for ${skus.length} SKUs`);
    } catch (error) {
      logger.error('Error in inventory:subscribe:', error);
      socket.emit('inventory:error', { message: 'Failed to subscribe to inventory updates' });
    }
  });

  // 실시간 재고 구독 해제
  socket.on('inventory:unsubscribe', (data: { skus: string[] }) => {
    try {
      const { skus } = data;
      
      if (Array.isArray(skus)) {
        skus.forEach(sku => {
          socket.leave(`inventory:${sku}`);
        });
        
        logger.info(`Client ${socket.id} unsubscribed from ${skus.length} SKUs`);
      }
    } catch (error) {
      logger.error('Error in inventory:unsubscribe:', error);
    }
  });

  // 재고 조정 요청
  socket.on('inventory:adjust', async (data: { 
    sku: string; 
    adjustment: number; 
    reason: string; 
  }) => {
    try {
      const { sku, adjustment, reason } = data;
      const userId = socket.data.user?.id;

      // 권한 확인
      if (!userId) {
        socket.emit('inventory:error', { message: 'Unauthorized' });
        return;
      }

      // 유효성 검사
      if (!sku || typeof adjustment !== 'number' || !reason) {
        socket.emit('inventory:error', { message: 'Invalid adjustment data' });
        return;
      }

      // 현재 재고 조회
      const lastTransaction = await InventoryTransaction.findOne({ sku })
        .sort({ createdAt: -1 })
        .lean();

      const currentQuantity = lastTransaction?.newQuantity || 0;
      const newQuantity = currentQuantity + adjustment;

      if (newQuantity < 0) {
        socket.emit('inventory:error', { message: 'Insufficient inventory' });
        return;
      }

      // 재고 트랜잭션 생성
      const transaction = await InventoryTransaction.create({
        sku,
        platform: 'manual',
        transactionType: 'adjustment',
        quantity: adjustment,
        previousQuantity: currentQuantity,
        newQuantity,
        reason,
        performedBy: 'manual',
        syncStatus: 'pending',
        metadata: {
          adjustedBy: userId,
          adjustedAt: new Date(),
        },
      });

      // 조정 완료 이벤트 전송
      socket.emit('inventory:adjusted', {
        sku,
        transaction: transaction.toObject(),
      });

      // 해당 SKU를 구독 중인 모든 클라이언트에게 업데이트 전송
      server.emitToRoom(`inventory:${sku}`, 'inventory:updated', {
        sku,
        quantity: newQuantity,
        lastUpdated: transaction.createdAt,
        transaction: {
          type: transaction.transactionType,
          quantity: transaction.quantity,
          reason: transaction.reason,
        },
      });

      logger.info(`Inventory adjusted for SKU ${sku}: ${adjustment} (${reason})`);
    } catch (error) {
      logger.error('Error in inventory:adjust:', error);
      socket.emit('inventory:error', { message: 'Failed to adjust inventory' });
    }
  });

  // 재고 이력 요청
  socket.on('inventory:history', async (data: { 
    sku: string; 
    limit?: number; 
    offset?: number; 
  }) => {
    try {
      const { sku, limit = 50, offset = 0 } = data;

      const transactions = await InventoryTransaction.find({ sku })
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(offset)
        .lean();

      const total = await InventoryTransaction.countDocuments({ sku });

      socket.emit('inventory:history', {
        sku,
        transactions,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + transactions.length < total,
        },
      });
    } catch (error) {
      logger.error('Error in inventory:history:', error);
      socket.emit('inventory:error', { message: 'Failed to fetch inventory history' });
    }
  });

  // 재고 부족 알림 설정
  socket.on('inventory:alert:setup', async (data: {
    sku: string;
    threshold: number;
  }) => {
    try {
      const { sku, threshold } = data;
      const userId = socket.data.user?.id;

      if (!userId || !sku || typeof threshold !== 'number') {
        socket.emit('inventory:error', { message: 'Invalid alert setup data' });
        return;
      }

      // 알림 설정 저장 (Redis 또는 DB)
      // TODO: 알림 설정 구현

      socket.emit('inventory:alert:created', {
        sku,
        threshold,
        status: 'active',
      });

      logger.info(`Low stock alert created for SKU ${sku} at threshold ${threshold}`);
    } catch (error) {
      logger.error('Error in inventory:alert:setup:', error);
      socket.emit('inventory:error', { message: 'Failed to setup inventory alert' });
    }
  });
}

// 재고 업데이트 브로드캐스트 함수 (다른 서비스에서 호출)
export function broadcastInventoryUpdate(
  server: SocketServer,
  sku: string,
  update: {
    quantity: number;
    platform: string;
    transactionType: string;
    reason?: string;
  }
): void {
  server.emitToRoom(`inventory:${sku}`, 'inventory:updated', {
    sku,
    ...update,
    timestamp: new Date(),
  });
}

