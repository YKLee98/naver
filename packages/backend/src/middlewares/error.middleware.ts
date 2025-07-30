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
  _next: NextFunction  // next를 _next로 변경 (사용하지 않음을 표시)
): Promise<void> => {
  const error = err as AppError;
  const statusCode = error.statusCode || 500;
  const message = error.message || 'Internal server error';

  // Log error
  logger.error('Error middleware:', {
    error: message,
    statusCode,
    stack: error.stack,
    path: req.path,
    method: req.method,
    ip: req.ip,
  });

  // Save to database
  if (statusCode >= 500) {
    await SystemLog.create({
      level: 'error',
      category: 'http-error',
      message,
      context: {
        service: 'express',
        method: req.method,
        path: req.path,
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
    }).catch(dbError => logger.error('Failed to save error log:', dbError));
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env['NODE_ENV'] === 'development' && { stack: error.stack }),  // NODE_ENV를 ['NODE_ENV']로 변경
  });
};