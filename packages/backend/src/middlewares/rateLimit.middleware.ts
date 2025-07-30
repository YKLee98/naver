// packages/backend/src/middlewares/rateLimit.middleware.ts
import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { logger } from '../utils/logger';

/**
 * 기본 Rate Limiter
 * 15분당 100개 요청으로 제한
 */
export const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: (req: Request, res: Response) => {
    logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      success: false,
      error: 'Too many requests',
      message: 'You have exceeded the rate limit. Please try again later.',
    });
  },
});

/**
 * 엄격한 Rate Limiter (인증 관련)
 * 15분당 5개 요청으로 제한
 */
export const strictRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  skipSuccessfulRequests: true, // Don't count successful requests
  message: 'Too many failed attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    logger.warn(`Strict rate limit exceeded for IP: ${req.ip} on path: ${req.path}`);
    res.status(429).json({
      success: false,
      error: 'Too many attempts',
      message: 'Too many failed attempts. Please try again later.',
    });
  },
});

/**
 * API 엔드포인트별 Rate Limiter
 * 1분당 20개 요청으로 제한
 */
export const apiRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 20, // Limit each IP to 20 requests per windowMs
  message: 'API rate limit exceeded',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    // IP와 사용자 ID를 조합하여 rate limit key 생성
    const userId = (req as any).user?.id || 'anonymous';
    return `${req.ip}-${userId}`;
  },
});

/**
 * Webhook Rate Limiter
 * 1초당 10개 요청으로 제한
 */
export const webhookRateLimiter = rateLimit({
  windowMs: 1000, // 1 second
  max: 10, // Limit to 10 requests per second
  message: 'Webhook rate limit exceeded',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req: Request) => {
    // Shopify webhook 검증이 완료된 요청은 rate limit 제외
    return req.headers['x-shopify-webhook-verified'] === 'true';
  },
});