

// packages/backend/src/controllers/MappingController.ts
import { Request, Response, NextFunction } from 'express';
import { ProductMapping } from '../models';
import { MappingService } from '../services/sync';
import { AppError } from '../middlewares/error.middleware';

export class MappingController {
  private mappingService: MappingService;

  constructor(mappingService: MappingService) {
    this.mappingService = mappingService;
  }

  /**
   * 매핑 생성
   */
  createMapping = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const mappingData = req.body;

      const mapping = await this.mappingService.createMapping(mappingData);

      res.status(201).json({
        success: true,
        data: mapping,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * 매핑 수정
   */
  updateMapping = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const updates = req.body;

      const mapping = await ProductMapping.findByIdAndUpdate(
        id,
        updates,
        { new: true }
      );

      if (!mapping) {
        throw new AppError('Mapping not found', 404);
      }

      res.json({
        success: true,
        data: mapping,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * 매핑 삭제
   */
  deleteMapping = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { id } = req.params;

      const mapping = await ProductMapping.findByIdAndDelete(id);

      if (!mapping) {
        throw new AppError('Mapping not found', 404);
      }

      res.json({
        success: true,
        message: 'Mapping deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * 자동 매핑 검색
   */
  autoDiscoverMappings = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const suggestions = await this.mappingService.autoDiscoverMappings();

      res.json({
        success: true,
        data: suggestions,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * 매핑 검증
   */
  validateMapping = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { id } = req.params;

      const validation = await this.mappingService.validateMapping(id);

      res.json({
        success: true,
        data: validation,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * 벌크 매핑 업로드
   */
  bulkUploadMappings = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { mappings } = req.body;

      if (!Array.isArray(mappings)) {
        throw new AppError('Mappings must be an array', 400);
      }

      const results = {
        success: 0,
        failed: 0,
        errors: [] as any[],
      };

      for (const mappingData of mappings) {
        try {
          await this.mappingService.createMapping(mappingData);
          results.success++;
        } catch (error) {
          results.failed++;
          results.errors.push({
            sku: mappingData.sku,
            error: error.message,
          });
        }
      }

      res.json({
        success: true,
        data: results,
      });
    } catch (error) {
      next(error);
    }
  };
}
