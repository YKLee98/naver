// packages/backend/src/services/ServiceContainer.ts
import { Redis } from 'ioredis';
import { Server as SocketIOServer } from 'socket.io';
import { logger } from '../utils/logger.js';

export class ServiceContainer {
  private static instance: ServiceContainer;
  private redis: Redis;
  private io?: SocketIOServer;
  private services: Map<string, any> = new Map();

  private constructor(redis: Redis) {
    this.redis = redis;
  }

  static async initialize(redis: Redis): Promise<ServiceContainer> {
    if (!ServiceContainer.instance) {
      ServiceContainer.instance = new ServiceContainer(redis);
      await ServiceContainer.instance.initializeServices();
    }
    return ServiceContainer.instance;
  }

  private async initializeServices(): Promise<void> {
    try {
      // 여기에 필요한 서비스들을 초기화
      logger.info('Services initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize services:', error);
      throw error;
    }
  }

  setWebSocket(io: SocketIOServer): void {
    this.io = io;
  }

  getService(name: string): any {
    return this.services.get(name);
  }

  async cleanup(): Promise<void> {
    // 서비스 정리 로직
    logger.info('Services cleaned up');
  }
}