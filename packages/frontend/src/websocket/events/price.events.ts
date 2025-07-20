import { Socket } from 'socket.io';
import { SocketServer } from '../SocketServer';
import { PriceHistory, ExchangeRate, ProductMapping } from '@/models';
import { logger } from '@/utils/logger';

export function setupPriceEvents(socket: Socket, server: SocketServer): void {
  // 가격 구독
  socket.on('price:subscribe', async (data: { skus: string[] }) => {
    try {
      const { skus } = data;
      
      if (!Array.isArray(skus) || skus.length === 0) {
        socket.emit('price:error', { message: 'Invalid SKUs' });
        return;
      }

      // SKU별 룸 참가
      skus.forEach(sku => {
        socket.join(`price:${sku}`);
      });

      // 현재 가격 정보 전송
      const currentPrices = await Promise.all(
        skus.map(async (sku) => {
          const lastPrice = await PriceHistory.findOne({ sku })
            .sort({ createdAt: -1 })
            .lean();

          return {
            sku,
            naverPrice: lastPrice?.naverPrice || 0,
            shopifyPrice: lastPrice?.finalShopifyPrice || 0,
            exchangeRate: lastPrice?.exchangeRate || 0,
            lastUpdated: lastPrice?.createdAt || null,
          };
        })
      );

      socket.emit('price:current', { prices: currentPrices });
      
      logger.info(`Client ${socket.id} subscribed to price updates for ${skus.length} SKUs`);
    } catch (error) {
      logger.error('Error in price:subscribe:', error);
      socket.emit('price:error', { message: 'Failed to subscribe to price updates' });
    }
  });

  // 가격 구독 해제
  socket.on('price:unsubscribe', (data: { skus: string[] }) => {
    try {
      const { skus } = data;
      
      if (Array.isArray(skus)) {
        skus.forEach(sku => {
          socket.leave(`price:${sku}`);
        });
        
        logger.info(`Client ${socket.id} unsubscribed from ${skus.length} SKUs`);
      }
    } catch (error) {
      logger.error('Error in price:unsubscribe:', error);
    }
  });

  // 가격 이력 요청
  socket.on('price:history', async (data: {
    sku: string;
    limit?: number;
    startDate?: string;
    endDate?: string;
  }) => {
    try {
      const { sku, limit = 50, startDate, endDate } = data;
      
      const query: any = { sku };
      
      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) query.createdAt.$lte = new Date(endDate);
      }

      const priceHistory = await PriceHistory.find(query)
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();

      const total = await PriceHistory.countDocuments(query);

      socket.emit('price:history', {
        sku,
        history: priceHistory,
        pagination: {
          total,
          limit,
          hasMore: priceHistory.length < total,
        },
      });
    } catch (error) {
      logger.error('Error in price:history:', error);
      socket.emit('price:error', { message: 'Failed to fetch price history' });
    }
  });

  // 환율 구독
  socket.on('exchangeRate:subscribe', async () => {
    try {
      socket.join('exchangeRate:updates');
      
      // 현재 환율 전송
      const currentRate = await ExchangeRate.getCurrentRate('KRW', 'USD');
      
      if (currentRate) {
        socket.emit('exchangeRate:current', {
          baseCurrency: currentRate.baseCurrency,
          targetCurrency: currentRate.targetCurrency,
          rate: currentRate.rate,
          timestamp: currentRate.createdAt,
        });
      }
      
      logger.info(`Client ${socket.id} subscribed to exchange rate updates`);
    } catch (error) {
      logger.error('Error in exchangeRate:subscribe:', error);
      socket.emit('exchangeRate:error', { message: 'Failed to subscribe to exchange rate updates' });
    }
  });

  // 환율 구독 해제
  socket.on('exchangeRate:unsubscribe', () => {
    socket.leave('exchangeRate:updates');
    logger.info(`Client ${socket.id} unsubscribed from exchange rate updates`);
  });

  // 수동 환율 설정
  socket.on('exchangeRate:setManual', async (data: {
    rate: number;
    reason: string;
  }) => {
    try {
      const { rate, reason } = data;
      const userId = socket.data.user?.id;
      
      if (!userId) {
        socket.emit('exchangeRate:error', { message: 'Unauthorized' });
        return;
      }

      if (typeof rate !== 'number' || rate <= 0) {
        socket.emit('exchangeRate:error', { message: 'Invalid exchange rate' });
        return;
      }

      const now = new Date();
      const validUntil = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7일

      const newRate = await ExchangeRate.create({
        baseCurrency: 'KRW',
        targetCurrency: 'USD',
        rate,
        source: 'manual',
        isManual: true,
        validFrom: now,
        validUntil,
        metadata: {
          manualReason: reason,
          setBy: userId,
        },
      });

      // 모든 구독자에게 환율 업데이트 전송
      server.emitToRoom('exchangeRate:updates', 'exchangeRate:updated', {
        baseCurrency: newRate.baseCurrency,
        targetCurrency: newRate.targetCurrency,
        rate: newRate.rate,
        timestamp: newRate.createdAt,
        isManual: true,
        reason,
      });
      
      logger.info(`Manual exchange rate set: 1 KRW = ${rate} USD (${reason})`);
    } catch (error) {
      logger.error('Error in exchangeRate:setManual:', error);
      socket.emit('exchangeRate:error', { message: 'Failed to set manual exchange rate' });
    }
  });

  // 가격 계산 요청
  socket.on('price:calculate', async (data: {
    sku: string;
    naverPrice: number;
    margin?: number;
  }) => {
    try {
      const { sku, naverPrice, margin = 1.15 } = data;
      
      // 현재 환율 조회
      const currentRate = await ExchangeRate.getCurrentRate('KRW', 'USD');
      
      if (!currentRate) {
        socket.emit('price:error', { message: 'Exchange rate not available' });
        return;
      }

      // 가격 계산
      const usdPrice = naverPrice * currentRate.rate;
      const finalPrice = Math.round(usdPrice * margin * 100) / 100;

      socket.emit('price:calculated', {
        sku,
        naverPrice,
        exchangeRate: currentRate.rate,
        calculatedPrice: usdPrice,
        finalPrice,
        margin,
      });
    } catch (error) {
      logger.error('Error in price:calculate:', error);
      socket.emit('price:error', { message: 'Failed to calculate price' });
    }
  });
}

// 가격 업데이트 브로드캐스트 함수
export function broadcastPriceUpdate(
  server: SocketServer,
  sku: string,
  update: {
    naverPrice: number;
    shopifyPrice: number;
    exchangeRate: number;
    margin: number;
  }
): void {
  server.emitToRoom(`price:${sku}`, 'price:updated', {
    sku,
    ...update,
    timestamp: new Date(),
  });
}

// 환율 업데이트 브로드캐스트 함수
export function broadcastExchangeRateUpdate(
  server: SocketServer,
  update: {
    baseCurrency: string;
    targetCurrency: string;
    rate: number;
  }
): void {
  server.emitToRoom('exchangeRate:updates', 'exchangeRate:updated', {
    ...update,
    timestamp: new Date(),
  });
}

