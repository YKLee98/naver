// packages/backend/src/config/database.ts
import mongoose from 'mongoose';
import { logger } from '../utils/logger';

export async function connectDatabase(): Promise<void> {
  const uri = process.env['MONGODB_URI'];
  
  if (!uri) {
    throw new Error('MONGODB_URI environment variable is not defined');
  }

  const options: mongoose.ConnectOptions = {
    // 연결 풀 설정
    maxPoolSize: 10,
    minPoolSize: 5,
    // 타임아웃 설정
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    // 재시도 설정
    retryWrites: true,
    retryReads: true,
  };

  try {
    await mongoose.connect(uri, options);
    
    logger.info('MongoDB connected successfully');

    // 연결 이벤트 리스너
    mongoose.connection.on('error', (error) => {
      logger.error('MongoDB connection error:', error);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected');
    });

    mongoose.connection.on('reconnected', () => {
      logger.info('MongoDB reconnected');
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      logger.info('MongoDB connection closed through app termination');
      process.exit(0);
    });

  } catch (error) {
    logger.error('MongoDB connection failed:', error);
    throw error;
  }
}

// 연결 상태 확인 헬퍼
export function isDatabaseConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

// 데이터베이스 연결 닫기
export async function disconnectDatabase(): Promise<void> {
  await mongoose.connection.close();
  logger.info('MongoDB connection closed');
}