// packages/backend/src/websocket/SocketServer.ts
import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger';
import config from '../config';
import { registerSyncEvents } from './events/sync.events';
import { registerInventoryEvents } from './events/inventory.events';
import { registerPriceEvents } from './events/price.events';

interface JWTPayload {
  id: string;
  email: string;
  role: string;
  iat: number;
  exp: number;
}

export class SocketServer {
  private io: Server;

  constructor(httpServer: HttpServer) {
    this.io = new Server(httpServer, {
      cors: {
        origin: config.corsOrigin,
        credentials: true,
      },
    });

    this.initialize();
  }

  private initialize(): void {
    // 인증 미들웨어
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token;
        
        if (!token) {
          logger.warn(`Socket connection attempt without token from ${socket.id}`);
          // 개발 환경에서는 인증 없이 허용
          if (config.env === 'development') {
            socket.data.user = {
              id: 'dev-user',
              email: 'dev@example.com',
              role: 'admin'
            };
            return next();
          }
          return next(new Error('Authentication token required'));
        }

        // JWT 토큰 검증
        const decoded = jwt.verify(token, config.jwt.secret) as JWTPayload;
        if (!decoded || !decoded.id) {
          return next(new Error('Invalid token'));
        }

        socket.data.user = {
          id: decoded.id,
          email: decoded.email,
          role: decoded.role,
        };
        
        next();
      } catch (error) {
        logger.error('Socket authentication failed:', error);
        next(new Error('Authentication failed'));
      }
    });

    // 연결 이벤트 처리
    this.io.on('connection', (socket: Socket) => {
      logger.info(`Socket connected: ${socket.id}`);

      // 인증 처리 (옵션)
      this.authenticateSocket(socket);

      // 이벤트 핸들러 등록
      this.registerEventHandlers(socket);

      // 연결 해제 처리
      socket.on('disconnect', () => {
        logger.info(`Socket disconnected: ${socket.id}`);
      });

      // 에러 처리
      socket.on('error', (error: Error) => {
        logger.error(`Socket error for ${socket.id}:`, error);
      });
    });
  }

  private authenticateSocket(socket: Socket): void {
    const user = socket.data.user;
    
    if (!user) {
      logger.warn(`Socket ${socket.id} connected without authentication`);
      return;
    }

    logger.info(`Socket ${socket.id} authenticated as user ${user.id}`);
  }

  private registerEventHandlers(socket: Socket): void {
    // 각 도메인별 이벤트 핸들러 등록
    registerSyncEvents(this.io, socket);
    registerInventoryEvents(this.io, socket);
    registerPriceEvents(this.io, socket);

    // 공통 이벤트 핸들러
    socket.on('ping', () => {
      socket.emit('pong');
    });

    // 룸 참가/탈퇴
    socket.on('join:room', (room: string) => {
      socket.join(room);
      logger.info(`Socket ${socket.id} joined room: ${room}`);
    });

    socket.on('leave:room', (room: string) => {
      socket.leave(room);
      logger.info(`Socket ${socket.id} left room: ${room}`);
    });
  }

  // 외부에서 이벤트 발송을 위한 메서드
  public emit(event: string, data: any): void {
    this.io.emit(event, data);
  }

  public emitToRoom(room: string, event: string, data: any): void {
    this.io.to(room).emit(event, data);
  }

  public getIO(): Server {
    return this.io;
  }
}