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
      logger.error('Error in getMappedProducts:', error);
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

      // SKU가 undefined가 아님을 보장
      const skuValue = mapping.sku;
      
      // 실시간 정보 조회
      const [naverProduct, shopifyVariant] = await Promise.all([
        this.naverProductService.getProduct(mapping.naverProductId),
        this.shopifyGraphQLService.findVariantBySku(skuValue),
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
      logger.error('Error in getProductBySku:', error);
      next(error);
    }
  };

  /**
   * 네이버 상품 검색
   * 키워드 기반 검색이 필요한 경우 getProducts의 검색 파라미터를 활용
   */
  searchNaverProducts = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { keyword, page = 1, size = 20, productStatusType = 'SALE' } = req.query;

      // 네이버 API는 기본적으로 전체 상품 목록을 반환하므로
      // 클라이언트 측에서 필터링하거나, 특정 상품 ID 목록으로 조회
      const result = await this.naverProductService.getProducts({
        page: Number(page),
        size: Number(size),
        productStatusType: productStatusType as string,
      });

      // 키워드가 있는 경우 클라이언트 측 필터링
      let filteredProducts = result.contents;
      if (keyword && typeof keyword === 'string') {
        const searchKeyword = keyword.toLowerCase();
        filteredProducts = result.contents.filter((product) => 
          product.name.toLowerCase().includes(searchKeyword) ||
          product.productId.toLowerCase().includes(searchKeyword)
        );
      }

      res.json({
        success: true,
        data: {
          contents: filteredProducts,
          total: filteredProducts.length,
          page: result.page,
          size: result.size,
          keyword: keyword || null,
        },
      });
    } catch (error) {
      logger.error('Error in searchNaverProducts:', error);
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
      const { vendor = 'album', limit = 100, includeInactive = false } = req.query;

      // Shopify GraphQL API를 사용하여 vendor별 상품 조회
      const products = await this.shopifyGraphQLService.getProductsByVendor(
        vendor as string,
        {
          limit: Number(limit),
          includeInactive: includeInactive === 'true',
        }
      );

      res.json({
        success: true,
        data: products,
      });
    } catch (error) {
      logger.error('Error in searchShopifyProducts:', error);
      next(error);
    }
  };

  /**
   * 상품 매핑 활성화/비활성화
   */
  toggleProductMapping = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { sku } = req.params;
      const { isActive } = req.body;

      const mapping = await ProductMapping.findOne({ sku });
      
      if (!mapping) {
        throw new AppError('Product mapping not found', 404);
      }

      mapping.isActive = isActive;
      mapping.updatedAt = new Date();
      await mapping.save();

      logger.info(`Product mapping ${sku} ${isActive ? 'activated' : 'deactivated'}`);

      res.json({
        success: true,
        data: mapping,
      });
    } catch (error) {
      logger.error('Error in toggleProductMapping:', error);
      next(error);
    }
  };

  /**
   * 상품 동기화 상태 업데이트
   */
  updateSyncStatus = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { sku } = req.params;
      const { syncStatus, lastSyncError } = req.body;

      const mapping = await ProductMapping.findOne({ sku });
      
      if (!mapping) {
        throw new AppError('Product mapping not found', 404);
      }

      mapping.syncStatus = syncStatus;
      if (lastSyncError) {
        mapping.syncError = lastSyncError;
      }
      mapping.lastSyncedAt = new Date();
      mapping.updatedAt = new Date();
      await mapping.save();

      logger.info(`Product sync status updated for ${sku}: ${syncStatus}`);

      res.json({
        success: true,
        data: mapping,
      });
    } catch (error) {
      logger.error('Error in updateSyncStatus:', error);
      next(error);
    }
  };

  /**
   * 배치 상품 정보 업데이트
   */
  batchUpdateProducts = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { products } = req.body;

      if (!Array.isArray(products) || products.length === 0) {
        throw new AppError('Invalid products array', 400);
      }

      const results = await Promise.allSettled(
        products.map(async (product) => {
          const mapping = await ProductMapping.findOne({ sku: product.sku });
          if (!mapping) {
            throw new Error(`Mapping not found for SKU: ${product.sku}`);
          }

          // 업데이트할 필드만 선택적으로 적용
          Object.assign(mapping, {
            ...product,
            updatedAt: new Date(),
          });

          return mapping.save();
        })
      );

      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected');

      logger.info(`Batch update completed: ${successful} successful, ${failed.length} failed`);

      res.json({
        success: true,
        data: {
          total: products.length,
          successful,
          failed: failed.map((r, i) => ({
            sku: products[i].sku,
            error: (r as PromiseRejectedResult).reason.message,
          })),
        },
      });
    } catch (error) {
      logger.error('Error in batchUpdateProducts:', error);
      next(error);
    }
  };
}