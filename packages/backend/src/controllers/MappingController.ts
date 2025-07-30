// packages/backend/src/controllers/MappingController.ts
import { Request, Response, NextFunction } from 'express';
import { ProductMapping } from '../models';
import { MappingService } from '../services/sync';
import { AppError } from '../middlewares/error.middleware';
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

      await ProductMapping.findByIdAndDelete(id);

      logger.info(`Mapping deleted: ${mapping.sku}`, { id });

      res.json({
        success: true,
        message: 'Mapping deleted successfully',
        data: {
          sku: mapping.sku,
          deletedAt: new Date(),
        },
      });
    } catch (error) {
      logger.error('Error in deleteMapping:', error);
      next(error);
    }
  };

  /**
   * 자동 매핑 검색
   */
  autoDiscoverMappings = async (
    _req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      logger.info('Starting auto-discovery of mappings');

      const suggestions = await this.mappingService.autoDiscoverMappings();

      logger.info(`Auto-discovery completed: ${suggestions.length} suggestions found`);

      res.json({
        success: true,
        data: {
          suggestions,
          summary: {
            total: suggestions.length,
            highConfidence: suggestions.filter(s => s.confidence > 0.8).length,
            mediumConfidence: suggestions.filter(s => s.confidence > 0.5 && s.confidence <= 0.8).length,
            lowConfidence: suggestions.filter(s => s.confidence <= 0.5).length,
          },
        },
        message: `Found ${suggestions.length} potential mappings`,
      });
    } catch (error) {
      logger.error('Error in autoDiscoverMappings:', error);
      next(error);
    }
  };

  /**
   * 매핑 검증
   */
  validateMapping = async (
    req: Request<{ id: string }>,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { id } = req.params;

      if (!id) {
        throw new AppError('Mapping ID is required', 400);
      }

      const validation = await this.mappingService.validateMapping(id);

      const validationResult: MappingValidationResult = {
        ...validation,
        warnings: [],
        suggestions: [],
      };

      // 추가 검증 로직
      const mapping = await ProductMapping.findById(id);
      if (mapping) {
        // 가격 마진 경고
        if (mapping.priceMargin < 1.1) {
          validationResult.warnings!.push('Price margin is less than 10%');
        }
        if (mapping.priceMargin > 2) {
          validationResult.warnings!.push('Price margin is more than 100%');
        }

        // 동기화 상태 확인
        if (mapping.syncStatus === 'error') {
          validationResult.warnings!.push('Mapping has sync errors');
        }

        // 개선 제안
        if (!mapping.metadata?.naverCategory) {
          validationResult.suggestions!.push('Consider adding Naver category for better organization');
        }
      }

      logger.info(`Mapping validation completed for ID: ${id}`, {
        isValid: validationResult.isValid,
        errorCount: validationResult.errors.length,
        warningCount: validationResult.warnings?.length || 0,
      });

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
   * 벌크 매핑 업로드
   */
  bulkUploadMappings = async (
    req: Request<{}, {}, BulkMappingBody>,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { mappings } = req.body;

      if (!Array.isArray(mappings)) {
        throw new AppError('Mappings must be an array', 400);
      }

      if (mappings.length === 0) {
        throw new AppError('No mappings provided', 400);
      }

      if (mappings.length > 1000) {
        throw new AppError('Maximum 1000 mappings can be uploaded at once', 400);
      }

      logger.info(`Starting bulk upload of ${mappings.length} mappings`);

      const results = {
        success: 0,
        failed: 0,
        skipped: 0,
        errors: [] as Array<{
          sku: string;
          error: string;
          index: number;
        }>,
        created: [] as Array<{
          sku: string;
          id: string;
        }>,
      };

      // 배치 처리
      for (let i = 0; i < mappings.length; i++) {
        const mappingData = mappings[i];
        
        if (!mappingData) {
          results.failed++;
          results.errors.push({
            sku: `index_${i}`,
            error: 'Invalid mapping data',
            index: i,
          });
          continue;
        }
        
        try {
          // SKU 유효성 검사
          if (!mappingData.sku) {
            throw new Error('SKU is required');
          }

          // 중복 검사
          const existing = await ProductMapping.findOne({ sku: mappingData.sku });
          if (existing) {
            results.skipped++;
            results.errors.push({
              sku: mappingData.sku,
              error: 'Mapping already exists',
              index: i,
            });
            continue;
          }

          // 매핑 생성
          const created = await this.mappingService.createMapping(mappingData);
          results.success++;
          results.created.push({
            sku: created.sku,
            id: created._id.toString(),
          });
        } catch (error) {
          results.failed++;
          results.errors.push({
            sku: mappingData.sku || `index_${i}`,
            error: error instanceof Error ? error.message : 'Unknown error',
            index: i,
          });
        }

        // 진행 상황 로깅 (100개마다)
        if ((i + 1) % 100 === 0) {
          logger.info(`Bulk upload progress: ${i + 1}/${mappings.length}`);
        }
      }

      logger.info('Bulk upload completed', {
        total: mappings.length,
        success: results.success,
        failed: results.failed,
        skipped: results.skipped,
      });

      res.json({
        success: true,
        data: results,
        message: `Processed ${mappings.length} mappings: ${results.success} created, ${results.failed} failed, ${results.skipped} skipped`,
      });
    } catch (error) {
      logger.error('Error in bulkUploadMappings:', error);
      next(error);
    }
  };

  /**
   * 매핑 목록 조회
   */
  getMappings = async (
    req: Request<{}, {}, {}, {
      page?: string;
      limit?: string;
      search?: string;
      vendor?: string;
      isActive?: string;
      syncStatus?: string;
    }>,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const {
        page = '1',
        limit = '20',
        search,
        vendor,
        isActive,
        syncStatus,
      } = req.query;

      const query: any = {};

      if (vendor) {
        query.vendor = vendor;
      }

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
          { naverProductId: { $regex: search, $options: 'i' } },
        ];
      }

      const skip = (Number(page) - 1) * Number(limit);

      const [mappings, total] = await Promise.all([
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
          mappings,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            pages: Math.ceil(total / Number(limit)),
          },
          filters: {
            vendor,
            isActive,
            syncStatus,
            search,
          },
        },
      });
    } catch (error) {
      logger.error('Error in getMappings:', error);
      next(error);
    }
  };
}