// packages/backend/src/controllers/ProductController.ts
import { Request, Response, NextFunction } from 'express';
import { ProductMapping, SyncHistory, SystemLog, Activity } from '../models/index.js';
import { NaverProductService } from '../services/naver/index.js';
import { ShopifyGraphQLService } from '../services/shopify/index.js';
import { PriceSyncService } from '../services/sync/PriceSyncService.js';
import { InventorySyncService } from '../services/sync/InventorySyncService.js';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { getRedisClient } from '../config/redis.js';
import * as XLSX from 'xlsx';
import { Parser } from 'json2csv';

interface SyncOptions {
  syncPrice?: boolean;
  syncInventory?: boolean;
  syncImages?: boolean;
  syncDescription?: boolean;
  forceUpdate?: boolean;
}

interface SyncResult {
  success: boolean;
  sku: string;
  syncedFields: string[];
  changes: {
    price?: { old: number; new: number };
    inventory?: { old: number; new: number };
    images?: { added: number; removed: number };
    description?: boolean;
  };
  errors: string[];
  timestamp: Date;
}

export class ProductController {
  private naverProductService: NaverProductService;
  private shopifyGraphQLService: ShopifyGraphQLService;
  private priceSyncService: PriceSyncService;
  private inventorySyncService: InventorySyncService;
  private redis: any;

  constructor(
    naverProductService: NaverProductService,
    shopifyGraphQLService: ShopifyGraphQLService
  ) {
    this.naverProductService = naverProductService;
    this.shopifyGraphQLService = shopifyGraphQLService;
    this.redis = getRedisClient();

    // 동기화 서비스 초기화
    this.priceSyncService = new PriceSyncService(
      this.redis,
      naverProductService,
      shopifyGraphQLService
    );

    this.inventorySyncService = new InventorySyncService(
      naverProductService,
      shopifyGraphQLService
    );
  }

  /**
   * 상품 목록 조회 (alias)
   */
  getProducts = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    return this.getMappedProducts(req, res, next);
  };

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
        this.naverProductService.getProductById(mapping.naverProductId),
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
   * 상품 생성
   */
  createProduct = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const productData = req.body;

      // Validate required fields
      if (!productData.sku || !productData.naverProductId) {
        throw new AppError('SKU and Naver Product ID are required', 400);
      }

      // Check if SKU already exists
      const existing = await ProductMapping.findOne({ sku: productData.sku });
      if (existing) {
        throw new AppError('Product with this SKU already exists', 409);
      }

      // Create new product mapping
      const product = new ProductMapping({
        ...productData,
        syncStatus: 'pending',
        isActive: true,
      });

      await product.save();

      // Log activity
      await Activity.create({
        type: 'product_create',
        entity: 'ProductMapping',
        entityId: product._id,
        userId: (req as any).user?.id,
        metadata: {
          sku: product.sku,
          productName: product.productName,
        },
        status: 'completed',
      });

      res.status(201).json({
        success: true,
        data: product,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * 상품 업데이트
   */
  updateProduct = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { sku } = req.params;
      const updateData = req.body;

      const product = await ProductMapping.findOneAndUpdate(
        { sku },
        { ...updateData, updatedAt: new Date() },
        { new: true, runValidators: true }
      );

      if (!product) {
        throw new AppError('Product not found', 404);
      }

      // Log activity
      await Activity.create({
        type: 'product_update',
        entity: 'ProductMapping',
        entityId: product._id,
        userId: (req as any).user?.id,
        metadata: {
          sku: product.sku,
          changes: updateData,
        },
        status: 'completed',
      });

      res.json({
        success: true,
        data: product,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * 상품 삭제
   */
  deleteProduct = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { sku } = req.params;

      const product = await ProductMapping.findOneAndDelete({ sku });

      if (!product) {
        throw new AppError('Product not found', 404);
      }

      // Log activity
      await Activity.create({
        type: 'product_delete',
        entity: 'ProductMapping',
        entityId: product._id,
        userId: (req as any).user?.id,
        metadata: {
          sku: product.sku,
          productName: product.productName,
        },
        status: 'completed',
      });

      res.json({
        success: true,
        message: 'Product deleted successfully',
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
      const { keyword, page = 1, limit = 20 } = req.query;

      if (!keyword) {
        throw new AppError('Search keyword is required', 400);
      }

      // 네이버 API에서 상품 검색
      const searchResult = await this.naverProductService.searchProducts(
        String(keyword),
        {
          page: Number(page),
          limit: Number(limit),
        }
      );

      res.json({
        success: true,
        data: searchResult,
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
      const { sku, title, vendor = 'album' } = req.query;

      const searchParams: any = { vendor };

      if (sku) {
        searchParams.sku = String(sku);
      }

      if (title) {
        searchParams.title = String(title);
      }

      // Shopify GraphQL로 상품 검색
      const products = await this.shopifyGraphQLService.searchProducts(
        searchParams
      );

      res.json({
        success: true,
        data: products,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * 대량 상품 업데이트
   */
  bulkUpdateProducts = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { updates } = req.body;

      if (!Array.isArray(updates) || updates.length === 0) {
        throw new AppError('Updates array is required', 400);
      }

      const results = [];

      for (const update of updates) {
        try {
          const { sku, ...updateData } = update;
          
          const product = await ProductMapping.findOneAndUpdate(
            { sku },
            { ...updateData, updatedAt: new Date() },
            { new: true, runValidators: true }
          );

          results.push({
            sku,
            success: !!product,
            error: product ? null : 'Product not found',
          });
        } catch (error: any) {
          results.push({
            sku: update.sku,
            success: false,
            error: error.message,
          });
        }
      }

      // Log activity
      await Activity.create({
        type: 'product_bulk_update',
        entity: 'ProductMapping',
        userId: (req as any).user?.id,
        metadata: {
          totalCount: updates.length,
          successCount: results.filter(r => r.success).length,
          failedCount: results.filter(r => !r.success).length,
        },
        status: 'completed',
      });

      res.json({
        success: true,
        data: {
          results,
          summary: {
            total: results.length,
            success: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * 상품 내보내기 (CSV)
   */
  exportProducts = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { format = 'csv', vendor = 'album' } = req.query;

      const products = await ProductMapping.find({ vendor })
        .lean()
        .exec();

      if (format === 'csv') {
        const fields = [
          'sku',
          'productName',
          'naverProductId',
          'shopifyProductId',
          'shopifyVariantId',
          'vendor',
          'isActive',
          'syncStatus',
          'lastSyncedAt',
          'priceMargin',
          'createdAt',
          'updatedAt',
        ];

        const json2csvParser = new Parser({ fields });
        const csv = json2csvParser.parse(products);

        res.header('Content-Type', 'text/csv');
        res.attachment(`products_${vendor}_${Date.now()}.csv`);
        res.send(csv);
      } else if (format === 'excel') {
        const worksheet = XLSX.utils.json_to_sheet(products);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Products');

        const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        res.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.attachment(`products_${vendor}_${Date.now()}.xlsx`);
        res.send(buffer);
      } else {
        res.json({
          success: true,
          data: products,
        });
      }
    } catch (error) {
      next(error);
    }
  };

  /**
   * 상품 동기화
   */
  syncProduct = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { sku } = req.params;
      const options: SyncOptions = req.body;

      const mapping = await ProductMapping.findOne({ sku });

      if (!mapping) {
        throw new AppError('Product mapping not found', 404);
      }

      const syncResult: SyncResult = {
        success: false,
        sku,
        syncedFields: [],
        changes: {},
        errors: [],
        timestamp: new Date(),
      };

      // 가격 동기화
      if (options.syncPrice) {
        try {
          const priceResult = await this.priceSyncService.syncSinglePrice(sku);
          if (priceResult.success) {
            syncResult.syncedFields.push('price');
            syncResult.changes.price = priceResult.changes?.price;
          }
        } catch (error: any) {
          syncResult.errors.push(`Price sync failed: ${error.message}`);
        }
      }

      // 재고 동기화
      if (options.syncInventory) {
        try {
          const inventoryResult = await this.inventorySyncService.syncSingleInventory(sku);
          if (inventoryResult.success) {
            syncResult.syncedFields.push('inventory');
            syncResult.changes.inventory = inventoryResult.changes?.inventory;
          }
        } catch (error: any) {
          syncResult.errors.push(`Inventory sync failed: ${error.message}`);
        }
      }

      syncResult.success = syncResult.errors.length === 0;

      // 동기화 이력 저장
      await SyncHistory.create({
        type: 'manual',
        status: syncResult.success ? 'completed' : 'failed',
        source: 'api',
        target: 'both',
        totalItems: 1,
        successItems: syncResult.success ? 1 : 0,
        failedItems: syncResult.success ? 0 : 1,
        details: syncResult,
      });

      res.json({
        success: true,
        data: syncResult,
      });
    } catch (error) {
      next(error);
    }
  };
}