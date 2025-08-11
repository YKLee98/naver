// ===== 7. packages/backend/src/controllers/interfaces.ts =====
import { Request, Response, NextFunction } from 'express';

export interface IController {
  // Basic CRUD operations that most controllers should have
}

export interface IAuthController {
  login(req: Request, res: Response, next: NextFunction): Promise<void>;
  register(req: Request, res: Response, next: NextFunction): Promise<void>;
  logout(req: Request, res: Response, next: NextFunction): Promise<void>;
  refresh(req: Request, res: Response, next: NextFunction): Promise<void>;
  me(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export interface IProductController {
  getMappedProducts(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void>;
  getProductBySku(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void>;
  searchNaverProducts(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void>;
  searchShopifyProducts(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void>;
  syncProduct(req: Request, res: Response, next: NextFunction): Promise<void>;
  bulkSyncProducts(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void>;
}
