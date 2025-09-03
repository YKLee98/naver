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
      const { keyword, sku, page = 1, limit = 20 } = req.query;

      if (!keyword && !sku) {
        throw new AppError('Search keyword or SKU is required', 400);
      }

      let searchResult;
      
      // If searching by SKU, first find the product in Shopify to get artist/vendor info
      if (sku) {
        console.log('🔍 Controller: Searching for SKU:', sku);
        
        // Step 1: Find product in Shopify by SKU
        const shopifySearchQuery = `sku:${String(sku)}`;
        console.log('🔍 Searching Shopify for SKU:', shopifySearchQuery);
        
        const shopifyProducts = await this.shopifyGraphQLService.searchProducts(shopifySearchQuery);
        
        if (shopifyProducts?.edges?.length > 0) {
          const shopifyProduct = shopifyProducts.edges[0].node;
          const vendor = shopifyProduct.vendor;
          const title = shopifyProduct.title;
          
          console.log(`📦 Found Shopify product: "${title}" by vendor: "${vendor}"`);
          
          // Step 2: Search Naver by vendor/artist name or product title
          let naverSearchKeyword = vendor && vendor !== 'album' ? vendor : title;
          
          // Extract artist name from title if possible (e.g., "IVE 아이브 미니 4집" -> "IVE" or "아이브")
          const artistMatch = title.match(/^([A-Za-z]+)|^([가-힣]+)/);
          if (artistMatch) {
            naverSearchKeyword = artistMatch[0];
          }
          
          console.log(`🔍 Searching Naver with keyword: "${naverSearchKeyword}"`);
          
          // Search Naver with the extracted keyword
          const naverResult = await this.naverProductService.searchProducts({
            searchKeyword: naverSearchKeyword,
            searchType: 'PRODUCT_NAME',
            page: 1,
            size: Number(limit) || 20, // Use limit parameter from request
          });
          
          if (naverResult && naverResult.contents) {
            searchResult = naverResult.contents;
            console.log(`📦 Found ${searchResult.length} Naver products for keyword: "${naverSearchKeyword}"`);
          } else {
            searchResult = [];
          }
        } else {
          // If not found in Shopify, fall back to direct SKU search in Naver
          console.log('⚠️ Product not found in Shopify, trying direct Naver SKU search');
          const products = await this.naverProductService.searchProductsBySellerManagementCode(String(sku));
          console.log('📦 Controller: Found products:', products.length);
          searchResult = products;
        }
      } else {
        // Otherwise use general search
        const result = await this.naverProductService.searchProducts({
          searchKeyword: String(keyword),
          searchType: 'SELLER_MANAGEMENT_CODE',
          page: Number(page),
          size: Number(limit),
        });
        
        // Transform the result to match expected format
        if (result && result.contents) {
          searchResult = result.contents;
        } else {
          searchResult = [];
        }
      }

      res.json({
        success: true,
        data: searchResult,
        pagination: {
          total: searchResult.length,
          page: Number(page),
          limit: Number(limit),
        },
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Shopify 상품 검색 (SKU 기반)
   */
  searchShopifyProducts = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { sku, title, vendor = 'album' } = req.query;

      let searchQuery = '';
      
      // Build search query string for GraphQL
      if (sku) {
        searchQuery = `sku:${String(sku)}`;
      } else if (title) {
        searchQuery = `title:*${String(title)}*`;
      } else if (vendor) {
        searchQuery = `vendor:${String(vendor)}`;
      }

      console.log('🔍 Shopify search query:', searchQuery);

      // Shopify GraphQL로 상품 검색
      const products = await this.shopifyGraphQLService.searchProducts(
        searchQuery
      );

      // Transform products to match frontend expectations
      const transformedProducts = products?.edges?.map((edge: any) => ({
        ...edge.node,
        variants: edge.node.variants?.edges?.map((v: any) => v.node) || []
      })) || [];

      console.log('📦 Shopify products found:', transformedProducts.length);

      res.json({
        success: true,
        data: transformedProducts,
        pagination: {
          total: transformedProducts.length,
          page: 1,
          limit: 20
        }
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Shopify SKU로 검색 후 제품명 반환
   */
  searchShopifyBySku = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { sku } = req.query;

      if (!sku) {
        throw new AppError('SKU is required', 400);
      }

      console.log('🔍 Searching Shopify by SKU:', sku);

      // SKU로 Shopify 상품 검색
      const searchResult = await this.shopifySearchService?.searchBySKU(String(sku));

      if (!searchResult || !searchResult.found || searchResult.products.length === 0) {
        return res.json({
          success: true,
          data: null,
          message: 'No product found with this SKU'
        });
      }

      // 첫 번째 매칭 상품 반환
      const product = searchResult.products[0];
      
      res.json({
        success: true,
        data: {
          id: product.id,
          title: product.title,
          sku: product.variant.sku,
          variantId: product.variant.id,
          price: product.variant.price,
          inventoryQuantity: product.variant.inventoryQuantity
        }
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * 네이버 상품 검색 (상품명 기반 - 제목 유사도로 50개 검색)
   */
  searchNaverByName = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { name, limit = 50 } = req.query;
      const searchKeyword = name ? String(name).toLowerCase() : '';

      console.log('🔍 Searching Naver by product name (title similarity):', name);

      // 네이버 API가 searchKeyword를 무시하는 것 같으므로, 
      // 모든 상품을 가져온 후 클라이언트 측에서 필터링
      // 여러 페이지를 순차적으로 가져와서 2000개까지 수집
      const allProducts: any[] = [];
      let currentPage = 1;
      const pageSize = 200; // 페이지당 최대 200개
      const targetTotal = 2000;
      
      while (allProducts.length < targetTotal) {
        const searchOptions = {
          size: pageSize,
          page: currentPage
        };

        console.log(`📋 Fetching Naver products page ${currentPage} to filter by keyword:`, searchKeyword);

        const searchResult = await this.naverProductService.searchProducts(searchOptions);
        
        if (!searchResult?.contents || searchResult.contents.length === 0) {
          break; // 더 이상 상품이 없으면 중단
        }

        // 검색 결과 변환 - 각 채널 상품을 개별 항목으로 펼침
        searchResult.contents.forEach((product: any) => {
        if (product.channelProducts && product.channelProducts.length > 0) {
          // 각 채널 상품을 개별 항목으로 추가
          product.channelProducts.forEach((channelProduct: any) => {
            allProducts.push({
              originProductNo: product.originProductNo,
              channelProductNo: channelProduct.channelProductNo,
              name: channelProduct.name,
              sellerManagementCode: channelProduct.sellerManagementCode,
              stockQuantity: channelProduct.stockQuantity,
              salePrice: channelProduct.salePrice,
              discountedPrice: channelProduct.discountedPrice,
              deliveryFee: channelProduct.deliveryFee,
              deliveryAttributeType: channelProduct.deliveryAttributeType,
              statusType: channelProduct.statusType,
              imageUrl: channelProduct.representativeImage?.url || product.representativeImage?.url,
              // 제목 유사도를 위한 원본 제목 포함
              originalName: product.name || channelProduct.name
            });
          });
        } else {
          // channelProducts가 없으면 원본 상품 정보 사용
          allProducts.push({
            originProductNo: product.originProductNo,
            name: product.name,
            sellerManagementCode: product.sellerManagementCode,
            stockQuantity: product.stockQuantity,
            salePrice: product.salePrice,
            deliveryFee: product.deliveryFee,
            imageUrl: product.representativeImage?.url,
            originalName: product.name
          });
        }
        });
        
        currentPage++;
        
        // 최대 10페이지까지만 요청 (2000개)
        if (currentPage > 10) break;
      }

      console.log(`📦 Total Naver products fetched: ${allProducts.length}`);

      // 키워드로 필터링 (제목에 키워드가 포함된 상품만)
      let filteredProducts = allProducts;
      if (searchKeyword) {
        filteredProducts = allProducts.filter((product) => {
          const productName = (product.name || '').toLowerCase();
          const originalName = (product.originalName || '').toLowerCase();
          return productName.includes(searchKeyword) || originalName.includes(searchKeyword);
        });

        // 정확한 매칭을 우선순위로 정렬
        filteredProducts.sort((a, b) => {
          const aName = (a.name || '').toLowerCase();
          const bName = (b.name || '').toLowerCase();
          
          // 정확히 일치하는 경우 우선
          if (aName === searchKeyword) return -1;
          if (bName === searchKeyword) return 1;
          
          // 시작 위치가 더 앞인 것 우선
          const aIndex = aName.indexOf(searchKeyword);
          const bIndex = bName.indexOf(searchKeyword);
          
          if (aIndex !== -1 && bIndex !== -1) {
            if (aIndex !== bIndex) return aIndex - bIndex;
          }
          
          // 길이가 더 짧은 것 우선
          return aName.length - bName.length;
        });
      }

      // 최대 50개로 제한
      const limitedProducts = filteredProducts.slice(0, 50);

      console.log(`📦 Naver products filtered by "${searchKeyword}": ${limitedProducts.length}/50 (from ${allProducts.length} total)`);

      res.json({
        success: true,
        data: limitedProducts,
        total: limitedProducts.length
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