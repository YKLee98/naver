// packages/backend/src/middlewares/rateLimiter.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { logger } from '../utils/logger';

const rateLimiter = new RateLimiterMemory({
  points: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  duration: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10) / 1000, // Convert to seconds
  blockDuration: 60, // Block for 1 minute
});

export const rateLimiterMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const key = req.ip || 'unknown';
    await rateLimiter.consume(key);
    next();
  } catch (error) {
    logger.warn('Rate limit exceeded', {
      ip: req.ip,
      path: req.path,
    });
    
    res.status(429).json({
      success: false,
      message: 'Too many requests',
    });
  }
};

