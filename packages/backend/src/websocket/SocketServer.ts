
import { Server as SocketIOServer, Socket } from 'socket.io';
import { logger } from '../utils/logger';
import { authMiddleware } from '../middlewares';
import { setupInventoryEvents } from './events/inventory.events';
import { setupPriceEvents } from './events/price.events';

export class SocketServer {
  private io: SocketIOServer;
  private connectedClients: Map<string, Socket> = new Map();

  constructor(io: SocketIOServer) {
    this.io = io;
  }

  public initialize(): void {
    logger.info('Initializing WebSocket server');

    // 인증 미들웨어
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token;
        
        if (!token) {
          return next(new Error('Authentication token required'));
        }

        // JWT 토큰 검증
        // TODO: JWT 검증 로직 구현
        const user = { id: 'user123', email: 'user@example.com' };
        socket.data.user = user;
        
        next();
      } catch (error) {
        logger.error('Socket authentication failed:', error);
        next(new Error('Authentication failed'));
      }
    });

    // 연결 이벤트
    this.io.on('connection', (socket: Socket) => {
      this.handleConnection(socket);
    });

    logger.info('WebSocket server initialized');
  }

  private handleConnection(socket: Socket): void {
    const userId = socket.data.user?.id;
    logger.info(`Client connected: ${socket.id}, User: ${userId}`);

    // 클라이언트 저장
    this.connectedClients.set(socket.id, socket);

    // 룸 참가 (사용자별 개인 룸)
    if (userId) {
      socket.join(`user:${userId}`);
    }

    // 이벤트 핸들러 설정
    setupInventoryEvents(socket, this);
    setupPriceEvents(socket, this);

    // 연결 해제 이벤트
    socket.on('disconnect', (reason) => {
      logger.info(`Client disconnected: ${socket.id}, Reason: ${reason}`);
      this.connectedClients.delete(socket.id);
    });

    // 에러 핸들링
    socket.on('error', (error) => {
      logger.error(`Socket error for ${socket.id}:`, error);
    });

    // 핑퐁 (연결 상태 확인)
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: Date.now() });
    });
  }

  // 특정 사용자에게 이벤트 전송
  public emitToUser(userId: string, event: string, data: any): void {
    this.io.to(`user:${userId}`).emit(event, data);
  }

  // 모든 클라이언트에게 이벤트 전송
  public broadcast(event: string, data: any): void {
    this.io.emit(event, data);
  }

  // 특정 룸에 이벤트 전송
  public emitToRoom(room: string, event: string, data: any): void {
    this.io.to(room).emit(event, data);
  }

  // 연결된 클라이언트 수 조회
  public getConnectedClientsCount(): number {
    return this.connectedClients.size;
  }

  // 특정 클라이언트 정보 조회
  public getClient(socketId: string): Socket | undefined {
    return this.connectedClients.get(socketId);
  }
}
