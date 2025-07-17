// packages/backend/src/controllers/ProductController.ts
import { Request, Response, NextFunction } from 'express';
import { ProductMapping } from '../models';
import { NaverProductService } from '../services/naver';
import { ShopifyGraphQLService } from '../services/shopify';
import { AppError } from '../middlewares/error.middleware';
import { logger } from '../utils/logger';

export class ProductController {
  private naverProductService: NaverProductService;
  private shopifyGraphQLService: ShopifyGraphQLService;

  constructor(
    naverProductService: NaverProductService,
    shopifyGraphQLService: ShopifyGraphQLService
  ) {
    this.naverProductService = naverProductService;
    this.shopifyGraphQLService = shopifyGraphQLService;
  }

  /**
   * 상품 목록 조회
   */
  getMappedProducts = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const {
        page = 1,
        limit = 20,
        vendor = 'album',
        isActive,
        syncStatus,
        search,
      } = req.query;

      const query: any = { vendor };
      
      if (isActive !== undefined) {
        query.isActive = isActive === 'true';
      }
      
      if (syncStatus) {
        query.syncStatus = syncStatus;
      }
      
      if (search) {
        query.$or = [
          { sku: { $regex: search, $options: 'i' } },
          { productName: { $regex: search, $options: 'i' } },
        ];
      }

      const skip = (Number(page) - 1) * Number(limit);

      const [products, total] = await Promise.all([
        ProductMapping.find(query)
          .sort({ updatedAt: -1 })
          .skip(skip)
          .limit(Number(limit))
          .lean(),
        ProductMapping.countDocuments(query),
      ]);

      res.json({
        success: true,
        data: {
          products,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            pages: Math.ceil(total / Number(limit)),
          },
        },
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * 상품 상세 조회
   */
  getProductBySku = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { sku } = req.params;

      const mapping = await ProductMapping.findOne({ sku }).lean();
      
      if (!mapping) {
        throw new AppError('Product mapping not found', 404);
      }

      // 실시간 정보 조회
      const [naverProduct, shopifyVariant] = await Promise.all([
        this.naverProductService.getProduct(mapping.naverProductId),
        this.shopifyGraphQLService.findVariantBySku(sku),
      ]);

      res.json({
        success: true,
        data: {
          mapping,
          naverProduct,
          shopifyVariant,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * 네이버 상품 검색
   */
  searchNaverProducts = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { keyword, page = 1, size = 20 } = req.query;

      const result = await this.naverProductService.getProducts({
        searchKeyword: keyword as string,
        page: Number(page),
        size: Number(size),
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Shopify 상품 검색
   */
  searchShopifyProducts = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { vendor = 'album' } = req.query;

      const products = await this.shopifyGraphQLService.getProductsByVendor(
        vendor as string
      );

      res.json({
        success: true,
        data: products,
      });
    } catch (error) {
      next(error);
    }
  };
}

