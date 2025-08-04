// ===== 2. packages/backend/src/controllers/MappingController.ts =====
// getMappings 메서드 추가
import { Request, Response, NextFunction } from 'express';
import { ProductMapping } from '../models';
import { MappingService } from '../services/sync';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';

interface CreateMappingBody {
  sku: string;
  naverProductId: string;
  shopifyProductId: string;
  shopifyVariantId: string;
  vendor?: string;
  priceMargin?: number;
  isActive?: boolean;
}

interface UpdateMappingBody {
  isActive?: boolean;
  priceMargin?: number;
  syncStatus?: 'synced' | 'pending' | 'error';
  syncError?: string;
  metadata?: {
    naverCategory?: string;
    shopifyTags?: string[];
    customFields?: Record<string, any>;
  };
}

interface BulkMappingBody {
  mappings: CreateMappingBody[];
}

interface MappingValidationResult {
  isValid: boolean;
  errors: string[];
  warnings?: string[];
  suggestions?: string[];
}

export class MappingController {
  private mappingService: MappingService;

  constructor(mappingService: MappingService) {
    this.mappingService = mappingService;
  }

  /**
   * 매핑 목록 조회
   */
  getMappings = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const {
        page = 1,
        limit = 20,
        search,
        status,
        isActive,
      } = req.query;

      const query: any = {};

      if (search) {
        query.$or = [
          { sku: { $regex: search, $options: 'i' } },
          { productName: { $regex: search, $options: 'i' } },
        ];
      }

      if (status) {
        query.syncStatus = status;
      }

      if (isActive !== undefined) {
        query.isActive = isActive === 'true';
      }

      const skip = (Number(page) - 1) * Number(limit);

      const [mappings, total] = await Promise.all([
        ProductMapping.find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(Number(limit))
          .lean(),
        ProductMapping.countDocuments(query),
      ]);

      res.json({
        success: true,
        data: mappings,
        total,
        page: Number(page),
        totalPages: Math.ceil(total / Number(limit)),
      });
    } catch (error) {
      logger.error('Error in getMappings:', error);
      next(error);
    }
  };

  /**
   * 매핑 생성
   */
  createMapping = async (
    req: Request<{}, {}, CreateMappingBody>,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const mappingData = req.body;

      // 유효성 검사
      if (!mappingData.sku) {
        throw new AppError('SKU is required', 400);
      }
      if (!mappingData.naverProductId) {
        throw new AppError('Naver product ID is required', 400);
      }
      if (!mappingData.shopifyProductId) {
        throw new AppError('Shopify product ID is required', 400);
      }
      if (!mappingData.shopifyVariantId) {
        throw new AppError('Shopify variant ID is required', 400);
      }

      // 중복 검사
      const existingMapping = await ProductMapping.findOne({ sku: mappingData.sku });
      if (existingMapping) {
        throw new AppError(`Mapping already exists for SKU: ${mappingData.sku}`, 409);
      }

      const mapping = await this.mappingService.createMapping(mappingData);

      logger.info(`Mapping created for SKU: ${mapping.sku}`, {
        sku: mapping.sku,
        naverProductId: mapping.naverProductId,
        shopifyVariantId: mapping.shopifyVariantId,
      });

      res.status(201).json({
        success: true,
        data: mapping,
        message: 'Mapping created successfully',
      });
    } catch (error) {
      logger.error('Error in createMapping:', error);
      next(error);
    }
  };

  /**
   * 매핑 수정
   */
  updateMapping = async (
    req: Request<{ id: string }, {}, UpdateMappingBody>,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const updates = req.body;

      if (!id) {
        throw new AppError('Mapping ID is required', 400);
      }

      // 업데이트 가능한 필드만 필터링
      const allowedUpdates = ['isActive', 'priceMargin', 'syncStatus', 'syncError', 'metadata'];
      const filteredUpdates = Object.keys(updates)
        .filter(key => allowedUpdates.includes(key))
        .reduce((obj, key) => {
          obj[key] = updates[key as keyof UpdateMappingBody];
          return obj;
        }, {} as any);

      filteredUpdates.updatedAt = new Date();

      const mapping = await ProductMapping.findByIdAndUpdate(
        id,
        filteredUpdates,
        { new: true, runValidators: true }
      );

      if (!mapping) {
        throw new AppError('Mapping not found', 404);
      }

      logger.info(`Mapping updated: ${mapping.sku}`, {
        id,
        updates: Object.keys(filteredUpdates),
      });

      res.json({
        success: true,
        data: mapping,
        message: 'Mapping updated successfully',
      });
    } catch (error) {
      logger.error('Error in updateMapping:', error);
      next(error);
    }
  };

  /**
   * 매핑 삭제
   */
  deleteMapping = async (
    req: Request<{ id: string }>,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { id } = req.params;

      if (!id) {
        throw new AppError('Mapping ID is required', 400);
      }

      const mapping = await ProductMapping.findById(id);
      
      if (!mapping) {
        throw new AppError('Mapping not found', 404);
      }

      // 활성 매핑 삭제 방지 옵션
      if (mapping.isActive) {
        throw new AppError('Cannot delete active mapping. Please deactivate it first.', 400);
      }

      await mapping.deleteOne();

      logger.info(`Mapping deleted: ${mapping.sku}`, { id });

      res.json({
        success: true,
        message: 'Mapping deleted successfully',
      });
    } catch (error) {
      logger.error('Error in deleteMapping:', error);
      next(error);
    }
  };

  /**
   * 자동 매핑 탐색
   */
  autoDiscoverMappings = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { vendor = 'album' } = req.query;

      const suggestions = await this.mappingService.autoDiscoverMappings(vendor as string);

      res.json({
        success: true,
        data: suggestions,
        message: `Found ${suggestions.length} potential mappings`,
      });
    } catch (error) {
      logger.error('Error in autoDiscoverMappings:', error);
      next(error);
    }
  };

  /**
   * 매핑 유효성 검증
   */
  validateMapping = async (
    req: Request<{ id: string }>,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { id } = req.params;

      const mapping = await ProductMapping.findById(id);
      if (!mapping) {
        throw new AppError('Mapping not found', 404);
      }

      const validationResult = await this.mappingService.validateMapping(mapping);

      res.json({
        success: true,
        data: validationResult,
      });
    } catch (error) {
      logger.error('Error in validateMapping:', error);
      next(error);
    }
  };

  /**
   * 대량 매핑 업로드
   */
  bulkUploadMappings = async (
    req: Request<{}, {}, BulkMappingBody>,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { mappings } = req.body;

      if (!mappings || !Array.isArray(mappings)) {
        throw new AppError('Mappings array is required', 400);
      }

      const results = await this.mappingService.bulkCreateMappings(mappings);

      res.json({
        success: true,
        data: results,
        message: `Successfully processed ${results.successful.length} mappings`,
      });
    } catch (error) {
      logger.error('Error in bulkUploadMappings:', error);
      next(error);
    }
  };
}