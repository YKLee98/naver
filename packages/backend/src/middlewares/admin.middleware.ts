// ===== 10. packages/backend/src/middlewares/admin.middleware.ts =====
import { Request, Response, NextFunction } from 'express';
import { AuthorizationError } from '../utils/errors';

interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

export const adminMiddleware = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // 개발 환경에서는 모든 요청 허용
    if (process.env.NODE_ENV === 'development') {
      return next();
    }

    if (!req.user) {
      throw new AuthorizationError('User not authenticated');
    }

    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      throw new AuthorizationError('Admin access required');
    }

    next();
  } catch (error) {
    next(error);
  }
};