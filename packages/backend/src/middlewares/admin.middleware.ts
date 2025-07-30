// packages/backend/src/middlewares/admin.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

/**
 * 관리자 권한 확인 미들웨어
 * authMiddleware 이후에 사용되어야 함
 */
export const adminMiddleware = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // 사용자 정보 확인
    if (!req.user) {
      logger.warn('Admin access attempted without authentication');
      res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
      return;
    }

    // 관리자 권한 확인
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      logger.warn(`Admin access denied for user: ${req.user.email}`);
      res.status(403).json({
        success: false,
        error: 'Admin access required',
      });
      return;
    }

    logger.debug(`Admin access granted for user: ${req.user.email}`);
    next();
  } catch (error) {
    logger.error('Admin middleware error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};