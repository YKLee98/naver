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

      logger.info('Searching Naver products', {
        keyword,
        page,
        size,
      });

      // 키워드 검증
      if (!keyword || typeof keyword !== 'string') {
        throw new AppError('Keyword is required', 400);
      }

      const result = await this.naverProductService.getProducts({
        searchKeyword: keyword as string,
        page: Number(page),
        size: Number(size),
      });

      // 키워드로 필터링 (선택적)
      let filteredProducts = result.contents || [];
      if (keyword) {
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

      logger.info('Searching Shopify products', {
        vendor,
        limit,
        includeInactive,
      });

      // 입력 값 검증
      if (typeof vendor !== 'string') {
        throw new AppError('Invalid vendor parameter', 400);
      }

      const numLimit = Number(limit);
      if (isNaN(numLimit) || numLimit < 1 || numLimit > 1000) {
        throw new AppError('Invalid limit parameter. Must be between 1 and 1000', 400);
      }

      // Shopify GraphQL API를 사용하여 vendor별 상품 조회
      const products = await this.shopifyGraphQLService.getProductsByVendor(
        vendor as string,
        {
          limit: numLimit,
          includeInactive: includeInactive === 'true',
        }
      );

      // 응답 형식 통일
      const formattedProducts = products.map(product => ({
        id: product.id,
        title: product.title,
        vendor: product.vendor,
        status: product.status,
        sku: product.variants?.edges?.[0]?.node?.sku || '',
        price: product.variants?.edges?.[0]?.node?.price || '0',
        variants: product.variants?.edges?.map(edge => edge.node) || [],
      }));

      res.json({
        success: true,
        data: formattedProducts,
      });

      logger.info(`Found ${formattedProducts.length} Shopify products for vendor: ${vendor}`);
    } catch (error) {
      logger.error('Error in searchShopifyProducts:', {
        error: error.message,
        stack: error.stack,
        query: req.query,
      });
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

      if (typeof isActive !== 'boolean') {
        throw new AppError('isActive must be a boolean value', 400);
      }

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

      const validStatuses = ['pending', 'syncing', 'synced', 'error'];
      if (!validStatuses.includes(syncStatus)) {
        throw new AppError(`Invalid sync status. Must be one of: ${validStatuses.join(', ')}`, 400);
      }

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

      if (products.length > 100) {
        throw new AppError('Cannot update more than 100 products at once', 400);
      }

      const results = await Promise.allSettled(
        products.map(async (product) => {
          if (!product.sku) {
            throw new Error('SKU is required for batch update');
          }

          const mapping = await ProductMapping.findOne({ sku: product.sku });
          if (!mapping) {
            throw new Error(`Mapping not found for SKU: ${product.sku}`);
          }

          // 업데이트할 필드만 선택적으로 적용
          const allowedFields = ['productName', 'priceMargin', 'isActive', 'syncStatus'];
          const updates: any = {};
          
          allowedFields.forEach(field => {
            if (product[field] !== undefined) {
              updates[field] = product[field];
            }
          });

          Object.assign(mapping, {
            ...updates,
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

  /**
   * 상품 매핑 통계 조회
   */
  getMappingStatistics = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { vendor = 'album' } = req.query;

      const [
        totalMappings,
        activeMappings,
        syncedMappings,
        errorMappings,
        lastSyncInfo
      ] = await Promise.all([
        ProductMapping.countDocuments({ vendor }),
        ProductMapping.countDocuments({ vendor, isActive: true }),
        ProductMapping.countDocuments({ vendor, syncStatus: 'synced' }),
        ProductMapping.countDocuments({ vendor, syncStatus: 'error' }),
        ProductMapping.findOne({ vendor })
          .sort({ lastSyncedAt: -1 })
          .select('lastSyncedAt')
          .lean()
      ]);

      res.json({
        success: true,
        data: {
          total: totalMappings,
          active: activeMappings,
          synced: syncedMappings,
          error: errorMappings,
          inactive: totalMappings - activeMappings,
          lastSyncedAt: lastSyncInfo?.lastSyncedAt || null,
        },
      });
    } catch (error) {
      logger.error('Error in getMappingStatistics:', error);
      next(error);
    }
  };

  /**
   * 상품 동기화 (단일 SKU)
   */
  syncProduct = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { sku } = req.params;
      const { syncInventory = true, syncPrice = true } = req.body;

      const mapping = await ProductMapping.findOne({ sku });
      
      if (!mapping) {
        throw new AppError('Product mapping not found', 404);
      }

      if (!mapping.isActive) {
        throw new AppError('Cannot sync inactive product mapping', 400);
      }

      // 동기화 상태를 'syncing'으로 업데이트
      mapping.syncStatus = 'syncing';
      mapping.syncError = null;
      await mapping.save();

      // TODO: 실제 동기화 로직 구현 (SyncService 호출)
      // 여기서는 예시로 성공 응답만 반환
      logger.info(`Product sync initiated for SKU: ${sku}`);

      res.json({
        success: true,
        data: {
          sku,
          syncInventory,
          syncPrice,
          status: 'sync_initiated',
          message: 'Product sync has been initiated',
        },
      });
    } catch (error) {
      logger.error('Error in syncProduct:', error);
      next(error);
    }
  };

  /**
   * 상품 상태 업데이트
   */
  updateProductStatus = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { sku } = req.params;
      const { status } = req.body;

      const validStatuses = ['ACTIVE', 'INACTIVE', 'PENDING', 'ERROR'];
      if (!validStatuses.includes(status)) {
        throw new AppError(`Invalid status. Must be one of: ${validStatuses.join(', ')}`, 400);
      }

      const mapping = await ProductMapping.findOne({ sku });
      
      if (!mapping) {
        throw new AppError('Product mapping not found', 404);
      }

      mapping.status = status;
      mapping.updatedAt = new Date();
      await mapping.save();

      logger.info(`Product status updated for ${sku}: ${status}`);

      res.json({
        success: true,
        data: mapping,
      });
    } catch (error) {
      logger.error('Error in updateProductStatus:', error);
      next(error);
    }
  };
}