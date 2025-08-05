// packages/backend/src/middlewares/error.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { SystemLog } from '../models';

export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorMiddleware = async (
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const error = err as AppError;
  const statusCode = error.statusCode || 500;
  const message = error.message || 'Internal server error';

  // 상세한 에러 로깅
  const errorDetails = {
    error: message,
    statusCode,
    stack: error.stack,
    path: req.path,
    method: req.method,
    query: req.query,
    body: req.body,
    headers: req.headers,
    ip: req.ip,
    timestamp: new Date().toISOString(),
  };

  logger.error('Error middleware:', errorDetails);

  // Shopify API 관련 에러 특별 처리
  if (error.message?.includes('Shopify') || error.message?.includes('GraphQL')) {
    logger.error('Shopify API Error Details:', {
      response: (error as any).response?.data,
      extensions: (error as any).extensions,
      query: req.query,
    });
  }

  // 데이터베이스에 에러 로그 저장 (500 에러만)
  if (statusCode >= 500) {
    try {
      await SystemLog.create({
        level: 'error',
        category: 'http-error',
        message,
        context: {
          service: 'express',
          method: req.method,
          path: req.path,
          query: req.query,
        },
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
        metadata: {
          statusCode,
          ip: req.ip,
          userAgent: req.headers['user-agent'],
        },
      });
    } catch (dbError) {
      logger.error('Failed to save error log:', dbError);
    }
  }

  // 개발 환경과 프로덕션 환경 구분
  const isDevelopment = process.env.NODE_ENV === 'development';

  res.status(statusCode).json({
    success: false,
    message,
    ...(isDevelopment && {
      error: {
        name: error.name,
        stack: error.stack,
        details: errorDetails,
      }
    }),
  });
};