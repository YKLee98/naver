// packages/backend/src/utils/mongodb.ts
import mongoose from 'mongoose';
import { logger } from './logger';

/**
 * MongoDB가 replica set으로 구성되어 있는지 확인
 */
export async function isReplicaSet(): Promise<boolean> {
  try {
    if (mongoose.connection.readyState !== 1) {
      return false;
    }

    const admin = mongoose.connection.db.admin();
    const status = await admin.replSetGetStatus();
    return !!status && status.ok === 1;
  } catch (error: any) {
    // replica set이 아닌 경우 오류 발생
    if (error.code === 76 || error.codeName === 'NotReplicaSet') {
      return false;
    }
    logger.error('Error checking replica set status:', error);
    return false;
  }
}

/**
 * 환경에 따라 트랜잭션 사용 여부 결정
 */
export function shouldUseTransaction(): boolean {
  // 환경 변수로 명시적으로 트랜잭션 사용 여부 제어
  if (process.env['DISABLE_TRANSACTIONS'] === 'true') {
    return false;
  }

  // 개발 환경에서는 트랜잭션 사용하지 않음
  if (process.env['NODE_ENV'] === 'development') {
    return false;
  }

  // 테스트 환경에서도 트랜잭션 사용하지 않음
  if (process.env['NODE_ENV'] === 'test') {
    return false;
  }

  // CI 환경에서는 트랜잭션 사용하지 않음
  if (process.env['CI'] === 'true') {
    return false;
  }

  // 프로덕션 환경에서만 트랜잭션 사용
  return process.env['NODE_ENV'] === 'production';
}

/**
 * 조건부 트랜잭션 래퍼
 * 트랜잭션이 필요하지 않은 환경에서는 일반 함수처럼 동작
 */
export async function withTransaction<T>(
  operation: (session?: mongoose.ClientSession) => Promise<T>
): Promise<T> {
  const useTransaction = shouldUseTransaction() && (await isReplicaSet());

  if (!useTransaction) {
    // 트랜잭션 없이 실행
    return await operation();
  }

  // 트랜잭션과 함께 실행
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const result = await operation(session);
    await session.commitTransaction();
    return result;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

/**
 * MongoDB 연결 정보 로깅
 */
export async function logMongoDBInfo(): Promise<void> {
  try {
    const isReplSet = await isReplicaSet();
    const canUseTransaction = shouldUseTransaction();

    logger.info('MongoDB Connection Info:', {
      environment: process.env['NODE_ENV'],
      isReplicaSet: isReplSet,
      transactionsEnabled: canUseTransaction && isReplSet,
      readyState: mongoose.connection.readyState,
      host: mongoose.connection.host,
      name: mongoose.connection.name,
    });
  } catch (error) {
    logger.error('Failed to log MongoDB info:', error);
  }
}
