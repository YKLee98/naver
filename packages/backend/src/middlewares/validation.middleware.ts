// packages/backend/src/middlewares/validation.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { validationResult, ValidationError } from 'express-validator';
import { logger } from '../utils/logger';

/**
 * Express-validator 검증 결과 처리 미들웨어
 */
export const validateRequest = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const extractedErrors: Record<string, string[]> = {};

    errors.array().forEach((err: ValidationError) => {
      if (err.type === 'field') {
        const field = err.path;
        if (!extractedErrors[field]) {
          extractedErrors[field] = [];
        }
        extractedErrors[field].push(err.msg);
      }
    });

    logger.warn('Validation failed', { 
      path: req.path, 
      errors: extractedErrors 
    });

    res.status(400).json({
      success: false,
      error: 'Validation failed',
      errors: extractedErrors,
    });
    return;
  }

  next();
};