// packages/backend/src/middleware/errorHandler.ts
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';
import { ZodError } from 'zod';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';

export interface ApiError extends Error {
  statusCode?: number;
  code?: string;
  details?: any;
  isOperational?: boolean;
}

export class AppError extends Error implements ApiError {
  statusCode: number;
  code: string;
  details?: any;
  isOperational: boolean;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR',
    details?: any
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error handler middleware
 */
export function errorHandler(
  err: ApiError,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Set default values
  err.statusCode = err.statusCode || 500;
  err.code = err.code || 'INTERNAL_ERROR';

  // Log error
  logError(err, req);

  // Handle specific error types
  if (err instanceof ZodError) {
    handleZodError(err, res);
    return;
  }

  if (err instanceof mongoose.Error.ValidationError) {
    handleMongooseValidationError(err, res);
    return;
  }

  if (err instanceof mongoose.Error.CastError) {
    handleMongooseCastError(err, res);
    return;
  }

  if (err.name === 'MongoServerError' && (err as any).code === 11000) {
    handleMongoDuplicateError(err, res);
    return;
  }

  // Handle JWT errors by checking error name
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError' || err.name === 'NotBeforeError') {
    handleJWTError(err, res);
    return;
  }

  // Send error response
  sendErrorResponse(err, req, res);
}

/**
 * Log error details
 */
function logError(err: ApiError, req: Request): void {
  const errorLog = {
    message: err.message,
    statusCode: err.statusCode,
    code: err.code,
    path: req.path,
    method: req.method,
    ip: req.ip,
    userId: (req as any).user?.id,
    requestId: req.id,
    stack: err.stack,
    details: err.details
  };

  if (err.statusCode && err.statusCode >= 500) {
    logger.error('Server Error:', errorLog);
  } else if (err.statusCode && err.statusCode >= 400) {
    logger.warn('Client Error:', errorLog);
  } else {
    logger.info('Error:', errorLog);
  }
}

/**
 * Handle Zod validation errors
 */
function handleZodError(err: ZodError, res: Response): void {
  const errors = err.errors.map(error => ({
    field: error.path.join('.'),
    message: error.message,
    code: error.code
  }));

  res.status(400).json({
    success: false,
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      details: errors
    }
  });
}

/**
 * Handle Mongoose validation errors
 */
function handleMongooseValidationError(
  err: mongoose.Error.ValidationError,
  res: Response
): void {
  const errors = Object.values(err.errors).map(error => ({
    field: error.path,
    message: error.message,
    value: (error as any).value
  }));

  res.status(400).json({
    success: false,
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Database validation failed',
      details: errors
    }
  });
}

/**
 * Handle Mongoose cast errors
 */
function handleMongooseCastError(
  err: mongoose.Error.CastError,
  res: Response
): void {
  res.status(400).json({
    success: false,
    error: {
      code: 'INVALID_ID',
      message: `Invalid ${err.path}: ${err.value}`,
      details: {
        path: err.path,
        value: err.value,
        kind: err.kind
      }
    }
  });
}

/**
 * Handle MongoDB duplicate key errors
 */
function handleMongoDuplicateError(err: any, res: Response): void {
  const field = Object.keys(err.keyValue)[0];
  const value = err.keyValue[field];

  res.status(409).json({
    success: false,
    error: {
      code: 'DUPLICATE_ERROR',
      message: `${field} already exists`,
      details: {
        field,
        value
      }
    }
  });
}

/**
 * Handle JWT errors
 */
function handleJWTError(err: any, res: Response): void {
  const statusCode = 401;
  let code = 'AUTHENTICATION_ERROR';
  let message = 'Authentication failed';

  // Check error name to determine specific JWT error
  if (err.name === 'TokenExpiredError') {
    code = 'TOKEN_EXPIRED';
    message = 'Token has expired';
  } else if (err.name === 'JsonWebTokenError') {
    if (err.message === 'invalid signature') {
      code = 'INVALID_TOKEN';
      message = 'Invalid token signature';
    } else if (err.message === 'jwt malformed') {
      code = 'MALFORMED_TOKEN';
      message = 'Malformed token';
    } else if (err.message === 'jwt must be provided') {
      code = 'NO_TOKEN';
      message = 'No token provided';
    } else if (err.message.includes('invalid token')) {
      code = 'INVALID_TOKEN';
      message = 'Invalid token';
    } else {
      message = err.message;
    }
  } else if (err.name === 'NotBeforeError') {
    code = 'TOKEN_NOT_ACTIVE';
    message = 'Token is not active yet';
  }

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      ...(config.isDevelopment && { originalError: err.message })
    }
  });
}

/**
 * Send error response
 */
function sendErrorResponse(
  err: ApiError,
  req: Request,
  res: Response
): void {
  const isDevelopment = config.isDevelopment;
  const statusCode = err.statusCode || 500;

  const response: any = {
    success: false,
    error: {
      code: err.code,
      message: err.message || 'Internal server error',
      ...(isDevelopment && { details: err.details }),
      ...(isDevelopment && statusCode === 500 && { stack: err.stack })
    },
    meta: {
      timestamp: new Date().toISOString(),
      path: req.path,
      method: req.method,
      requestId: req.id
    }
  };

  // Remove sensitive information in production
  if (!isDevelopment && statusCode === 500) {
    response.error.message = 'Internal server error';
    delete response.error.details;
  }

  res.status(statusCode).json(response);
}

/**
 * Async error wrapper
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Custom Error Classes
 */
export class NotFoundError extends AppError {
  constructor(resource: string = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication failed') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Access denied') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 409, 'CONFLICT_ERROR', details);
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Too many requests') {
    super(message, 429, 'RATE_LIMIT_ERROR');
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message: string = 'Service temporarily unavailable') {
    super(message, 503, 'SERVICE_UNAVAILABLE');
  }
}

export class BadRequestError extends AppError {
  constructor(message: string = 'Bad request', details?: any) {
    super(message, 400, 'BAD_REQUEST', details);
  }
}

export class UnprocessableEntityError extends AppError {
  constructor(message: string = 'Unprocessable entity', details?: any) {
    super(message, 422, 'UNPROCESSABLE_ENTITY', details);
  }
}

export class PaymentRequiredError extends AppError {
  constructor(message: string = 'Payment required') {
    super(message, 402, 'PAYMENT_REQUIRED');
  }
}

export class GoneError extends AppError {
  constructor(message: string = 'Resource no longer available') {
    super(message, 410, 'GONE');
  }
}

export class TimeoutError extends AppError {
  constructor(message: string = 'Request timeout') {
    super(message, 408, 'REQUEST_TIMEOUT');
  }
}