// packages/backend/src/middleware/requestLogger.ts
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';
import { performance } from 'perf_hooks';

/**
 * Request logger middleware
 */
export function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Skip logging for health checks
  if (req.path === '/health' || req.path === '/metrics') {
    return next();
  }

  // Start timer
  req.startTime = performance.now();

  // Log request
  logger.http(`→ ${req.method} ${req.path}`, {
    query: req.query,
    body: sanitizeBody(req.body),
    ip: req.ip,
    userAgent: req.get('user-agent'),
    requestId: req.id
  });

  // Capture response
  const originalSend = res.send;
  res.send = function(data: any) {
    res.send = originalSend;
    const result = res.send(data);
    
    // Calculate duration
    const duration = performance.now() - (req.startTime || 0);
    
    // Log response
    logger.http(`← ${req.method} ${req.path} ${res.statusCode} ${duration.toFixed(2)}ms`, {
      statusCode: res.statusCode,
      duration: duration.toFixed(2),
      requestId: req.id
    });

    return result;
  };

  next();
}

/**
 * Sanitize request body for logging
 */
function sanitizeBody(body: any): any {
  if (!body) return body;

  const sanitized = { ...body };
  const sensitiveFields = ['password', 'token', 'secret', 'apiKey', 'creditCard'];

  for (const field of sensitiveFields) {
    if (sanitized[field]) {
      sanitized[field] = '***REDACTED***';
    }
  }

  return sanitized;
}