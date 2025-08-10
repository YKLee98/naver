// packages/backend/src/middlewares/notFoundHandler.ts
import { Request, Response } from 'express';

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    message: 'Resource not found',
    path: req.path,
  });
}
