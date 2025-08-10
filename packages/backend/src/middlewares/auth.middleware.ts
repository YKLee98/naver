// packages/backend/src/middlewares/auth.middleware.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

// Extend Express Request interface
declare global {
  namespace Express {
    interface Request {
      user?: any;
      userId?: string;
      token?: string;
    }
  }
}

/**
 * Main authentication middleware
 */
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Development mode: Skip authentication if SKIP_AUTH is true
    if (config.isDevelopment && process.env.SKIP_AUTH === 'true') {
      req.user = {
        id: 'dev-user-123',
        email: 'dev@example.com',
        role: 'admin',
        name: 'Development User'
      };
      req.userId = 'dev-user-123';
      logger.debug('Skipping auth in development mode');
      return next();
    }

    // Development mode: Allow without token with warning
    if (config.isDevelopment && !extractToken(req)) {
      req.user = {
        id: 'anonymous-dev',
        email: 'anonymous@dev.local',
        role: 'admin',
        name: 'Anonymous Developer'
      };
      req.userId = 'anonymous-dev';
      logger.warn('No token provided in development, using anonymous user');
      return next();
    }

    // Extract token
    const token = extractToken(req);
    
    if (!token) {
      res.status(401).json({
        success: false,
        error: 'No authentication token provided'
      });
      return;
    }

    // Verify token
    try {
      const decoded = jwt.verify(token, config.jwt.secret) as any;
      req.user = decoded;
      req.userId = decoded.id || decoded.userId || decoded.sub;
      req.token = token;
      next();
    } catch (jwtError: any) {
      if (jwtError.name === 'TokenExpiredError') {
        res.status(401).json({
          success: false,
          error: 'Token has expired',
          code: 'TOKEN_EXPIRED'
        });
        return;
      }
      
      if (jwtError.name === 'JsonWebTokenError') {
        res.status(401).json({
          success: false,
          error: 'Invalid token',
          code: 'INVALID_TOKEN'
        });
        return;
      }
      
      throw jwtError;
    }
  } catch (error) {
    logger.error('Auth middleware error:', error);
    res.status(500).json({
      success: false,
      error: 'Authentication error'
    });
  }
};

/**
 * Optional authentication middleware
 */
export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = extractToken(req);
    
    if (token) {
      try {
        const decoded = jwt.verify(token, config.jwt.secret) as any;
        req.user = decoded;
        req.userId = decoded.id || decoded.userId || decoded.sub;
        req.token = token;
      } catch (error) {
        // Invalid token, but continue without auth
        logger.debug('Invalid token in optional auth, continuing without auth');
      }
    }
    
    next();
  } catch (error) {
    logger.error('Optional auth error:', error);
    next();
  }
};

/**
 * Role-based authorization middleware
 */
export const authorize = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
      return;
    }
    
    const userRole = req.user.role || 'user';
    
    if (!roles.includes(userRole)) {
      res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
        required: roles,
        current: userRole
      });
      return;
    }
    
    next();
  };
};

/**
 * Extract token from request
 */
function extractToken(req: Request): string | null {
  // 1. Authorization header (Bearer token)
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const parts = authHeader.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') {
      return parts[1];
    }
  }
  
  // 2. Query parameter (for development/testing)
  if (req.query.token && typeof req.query.token === 'string') {
    return req.query.token;
  }
  
  // 3. Cookie
  if (req.cookies && req.cookies.token) {
    return req.cookies.token;
  }
  
  // 4. Custom header
  const customToken = req.headers['x-auth-token'];
  if (customToken && typeof customToken === 'string') {
    return customToken;
  }
  
  return null;
}

// Aliases for compatibility
export const authMiddleware = authenticate;
export const requireAuth = authenticate;
export const requireRole = authorize;

export default {
  authenticate,
  optionalAuth,
  authorize,
  authMiddleware,
  requireAuth,
  requireRole
};