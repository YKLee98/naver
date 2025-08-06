// ===== 2. packages/backend/src/middlewares/rateLimit.middleware.ts =====
import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

/**
 * 기본 Rate Limiter
 */
export const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15분
  max: 100, // 최대 100개 요청
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error: 'Too many requests',
      message: 'Too many requests from this IP, please try again later.',
      retryAfter: req.rateLimit?.resetTime,
    });
  },
});

/**
 * 인증 엔드포인트용 Rate Limiter
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15분
  max: 5, // 최대 5번 시도
  skipSuccessfulRequests: true,
  message: 'Too many login attempts, please try again later.',
});

/**
 * API 엔드포인트용 Rate Limiter
 */
export const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1분
  max: 60, // 분당 60개 요청
  message: 'API rate limit exceeded.',
});