// ===== 3. packages/backend/src/middlewares/logger.middleware.ts =====
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

interface LoggedRequest extends Request {
  requestTime?: number;
}

/**
 * 요청 로깅 미들웨어
 */
export const requestLogger = (
  req: LoggedRequest,
  res: Response,
  next: NextFunction
): void => {
  req.requestTime = Date.now();

  // 요청 로깅
  logger.info(`${req.method} ${req.originalUrl}`, {
    ip: req.ip,
    userAgent: req.get('user-agent'),
    body: req.body,
    query: req.query,
    params: req.params,
  });

  // 응답 로깅
  const originalSend = res.send;
  res.send = function (data) {
    const responseTime = Date.now() - (req.requestTime || Date.now());

    logger.info(`Response sent`, {
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      responseTime: `${responseTime}ms`,
    });

    return originalSend.call(this, data);
  };

  next();
};

/**
 * 성능 모니터링 미들웨어
 */
export const performanceLogger = (
  req: LoggedRequest,
  res: Response,
  next: NextFunction
): void => {
  const start = process.hrtime();

  res.on('finish', () => {
    const [seconds, nanoseconds] = process.hrtime(start);
    const responseTime = seconds * 1000 + nanoseconds / 1000000;

    if (responseTime > 1000) {
      logger.warn(`Slow request detected`, {
        method: req.method,
        url: req.originalUrl,
        responseTime: `${responseTime.toFixed(2)}ms`,
      });
    }
  });

  next();
};
