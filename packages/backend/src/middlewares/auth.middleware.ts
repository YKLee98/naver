// packages/backend/src/middlewares/auth.middleware.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

/**
 * JWT 토큰 검증 미들웨어
 */
export const authMiddleware = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // 토큰 추출
    const token = extractToken(req);

    if (!token) {
      res.status(401).json({
        success: false,
        error: 'No token provided',
      });
      return;
    }

    // JWT 시크릿 확인
    const jwtSecret = process.env['JWT_SECRET'] || 'your-secret-key';
    
    // 토큰 검증
    const decoded = jwt.verify(token, jwtSecret) as any;

    // 사용자 정보를 요청 객체에 추가
    req.user = {
      id: decoded.userId || decoded.id,
      email: decoded.email,
      role: decoded.role || 'user',
    };

    logger.debug(`Authenticated user: ${req.user.email}`);
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        success: false,
        error: 'Token expired',
      });
      return;
    }

    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({
        success: false,
        error: 'Invalid token',
      });
      return;
    }

    logger.error('Auth middleware error:', error);
    res.status(500).json({
      success: false,
      error: 'Authentication error',
    });
  }
};

/**
 * 요청에서 토큰 추출
 */
function extractToken(req: Request): string | null {
  // Authorization 헤더에서 추출
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // 쿠키에서 추출
  if (req.cookies && req.cookies.token) {
    return req.cookies.token;
  }

  // 쿼리 파라미터에서 추출 (개발용)
  if (process.env['NODE_ENV'] === 'development' && req.query.token) {
    return req.query.token as string;
  }

  return null;
}

/**
 * 옵셔널 인증 미들웨어 (인증이 선택적인 경우)
 */
export const optionalAuthMiddleware = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = extractToken(req);

    if (token) {
      const jwtSecret = process.env['JWT_SECRET'] || 'your-secret-key';
      const decoded = jwt.verify(token, jwtSecret) as any;

      req.user = {
        id: decoded.userId || decoded.id,
        email: decoded.email,
        role: decoded.role || 'user',
      };
    }

    next();
  } catch (error) {
    // 토큰이 유효하지 않아도 계속 진행
    logger.debug('Optional auth: Invalid token, proceeding without auth');
    next();
  }
};