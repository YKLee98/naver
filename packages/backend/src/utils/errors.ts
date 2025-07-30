// packages/backend/src/utils/errors.ts
export class AppError extends Error {
  statusCode: number;
  status: string;
  isOperational: boolean;
  code?: string;
  details?: any;

  constructor(
    message: string, 
    statusCode: number, 
    code?: string, 
    details?: any
  ) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;
    this.code = code;
    this.details = details;

    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 404, 'NOT_FOUND', details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 401, 'UNAUTHORIZED', details);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 403, 'FORBIDDEN', details);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 409, 'CONFLICT', details);
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Too many requests', details?: any) {
    super(message, 429, 'RATE_LIMIT_EXCEEDED', details);
  }
}

export class BadRequestError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 400, 'BAD_REQUEST', details);
  }
}

export class InternalServerError extends AppError {
  constructor(message: string = 'Internal server error', details?: any) {
    super(message, 500, 'INTERNAL_SERVER_ERROR', details);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message: string = 'Service temporarily unavailable', details?: any) {
    super(message, 503, 'SERVICE_UNAVAILABLE', details);
  }
}