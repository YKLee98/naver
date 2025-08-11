// ===== 1. packages/backend/src/middlewares/error.middleware.ts =====
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { AppError } from '../utils/errors';
import { config } from '../config';

interface ErrorWithStatus extends Error {
  statusCode?: number;
  status?: string;
  isOperational?: boolean;
  code?: string;
  path?: string;
  value?: string;
  errors?: any;
}

/**
 * MongoDB 에러 처리
 */
const handleCastErrorDB = (err: any): AppError => {
  const message = `Invalid ${err.path}: ${err.value}`;
  return new AppError(message, 400);
};

const handleDuplicateFieldsDB = (err: any): AppError => {
  const value = err.errmsg.match(/(["'])(\\?.)*?\1/)[0];
  const message = `Duplicate field value: ${value}. Please use another value!`;
  return new AppError(message, 400);
};

const handleValidationErrorDB = (err: any): AppError => {
  const errors = Object.values(err.errors).map((el: any) => el.message);
  const message = `Invalid input data. ${errors.join('. ')}`;
  return new AppError(message, 400);
};

const handleJWTError = (): AppError =>
  new AppError('Invalid token. Please log in again!', 401);

const handleJWTExpiredError = (): AppError =>
  new AppError('Your token has expired! Please log in again.', 401);

/**
 * 개발 환경 에러 응답
 */
const sendErrorDev = (err: ErrorWithStatus, req: Request, res: Response) => {
  // API
  if (req.originalUrl.startsWith('/api')) {
    return res.status(err.statusCode || 500).json({
      success: false,
      error: err,
      message: err.message,
      stack: err.stack,
    });
  }

  // 렌더링된 웹사이트
  logger.error('ERROR 💥', err);
  return res.status(err.statusCode || 500).json({
    success: false,
    message: err.message,
  });
};

/**
 * 프로덕션 환경 에러 응답
 */
const sendErrorProd = (err: ErrorWithStatus, req: Request, res: Response) => {
  // API
  if (req.originalUrl.startsWith('/api')) {
    // 운영상 에러: 클라이언트에 메시지 전송
    if (err.isOperational) {
      return res.status(err.statusCode || 500).json({
        success: false,
        message: err.message,
      });
    }

    // 프로그래밍 또는 알 수 없는 에러: 상세 정보 노출 안함
    logger.error('ERROR 💥', err);
    return res.status(500).json({
      success: false,
      message: 'Something went wrong!',
    });
  }

  // 렌더링된 웹사이트
  if (err.isOperational) {
    return res.status(err.statusCode || 500).json({
      success: false,
      message: err.message,
    });
  }

  logger.error('ERROR 💥', err);
  return res.status(err.statusCode || 500).json({
    success: false,
    message: 'Please try again later.',
  });
};

/**
 * 글로벌 에러 핸들러
 */
export const errorHandler = (
  err: ErrorWithStatus,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  if (config.env === 'development') {
    sendErrorDev(err, req, res);
  } else {
    let error = { ...err };
    error.message = err.message;

    // MongoDB 에러 처리
    if (err.name === 'CastError') error = handleCastErrorDB(err);
    if (err.code === '11000') error = handleDuplicateFieldsDB(err);
    if (err.name === 'ValidationError') error = handleValidationErrorDB(err);

    // JWT 에러 처리
    if (err.name === 'JsonWebTokenError') error = handleJWTError();
    if (err.name === 'TokenExpiredError') error = handleJWTExpiredError();

    sendErrorProd(error, req, res);
  }
};
