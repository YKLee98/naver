import { z } from 'zod';

// 공통 스키마
export const skuSchema = z.string().min(1).max(100).regex(/^[A-Za-z0-9\-_]+$/);
export const mongoIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/);
export const positiveNumberSchema = z.number().positive();
export const priceSchema = z.number().positive().finite();
export const quantitySchema = z.number().int().min(0);

// 상품 관련 스키마
export const productMappingSchema = z.object({
  sku: skuSchema,
  naverProductId: z.string(),
  shopifyProductId: z.string(),
  shopifyVariantId: z.string(),
  productName: z.string().optional(),
  priceMargin: z.number().min(1).max(5).default(1.15),
});

export const inventoryAdjustmentSchema = z.object({
  adjustment: z.number().int(),
  reason: z.string().min(1).max(500),
  platform: z.enum(['naver', 'shopify']).default('naver'),
});

// 동기화 설정 스키마
export const syncSettingsSchema = z.object({
  syncInterval: z.number().int().min(5).max(1440).optional(),
  autoSync: z.boolean().optional(),
  priceMargin: z.number().min(1).max(5).optional(),
});

// 페이지네이션 스키마
export const paginationSchema = z.object({
  page: z.string().regex(/^\d+$/).transform(Number).default(1),
  limit: z.string().regex(/^\d+$/).transform(Number).default(20),
});

// 날짜 범위 스키마
export const dateRangeSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

// SKU 유효성 검사
export function isValidSku(sku: string): boolean {
  try {
    skuSchema.parse(sku);
    return true;
  } catch {
    return false;
  }
}

// MongoDB ObjectId 유효성 검사
export function isValidMongoId(id: string): boolean {
  try {
    mongoIdSchema.parse(id);
    return true;
  } catch {
    return false;
  }
}

// 가격 유효성 검사
export function isValidPrice(price: number): boolean {
  try {
    priceSchema.parse(price);
    return true;
  } catch {
    return false;
  }
}

// 재고 수량 유효성 검사
export function isValidQuantity(quantity: number): boolean {
  try {
    quantitySchema.parse(quantity);
    return true;
  } catch {
    return false;
  }
}

// 요청 본문 검증 미들웨어 생성
export function validateBody(schema: z.ZodSchema) {
  return (req: any, res: any, next: any) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          message: 'Validation error',
          errors: error.issues,
        });
      } else {
        next(error);
      }
    }
  };
}

// 쿼리 파라미터 검증 미들웨어 생성
export function validateQuery(schema: z.ZodSchema) {
  return (req: any, res: any, next: any) => {
    try {
      req.query = schema.parse(req.query);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          message: 'Invalid query parameters',
          errors: error.issues,
        });
      } else {
        next(error);
      }
    }
  };
}
