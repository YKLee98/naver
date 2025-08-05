// packages/backend/src/controllers/MappingController.ts
import { Request, Response, NextFunction } from 'express';
import { MappingService } from '../services/sync';
import { ProductMapping } from '../models';
import { AppError } from '../middlewares/error.middleware';
import { logger } from '../utils/logger';
import * as XLSX from 'xlsx';
import { validateSKU } from '../utils/validators';

export class MappingController {
  private mappingService: MappingService;

  constructor(mappingService: MappingService) {
    this.mappingService = mappingService;
  }

  /**
   * 엑셀 템플릿 다운로드
   * GET /api/v1/mappings/template
   */
  downloadTemplate = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const template = [
        {
          'SKU': 'ALBUM-001',
          '네이버상품ID': '12345678',
          'Shopify상품ID': '7890123456',
          '활성화': 'Y',
          '마진율': '15'
        }
      ];

      const ws = XLSX.utils.json_to_sheet(template);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'SKU매핑');

      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="sku-mapping-template.xlsx"');
      res.send(buffer);
    } catch (error) {
      next(error);
    }
  };

  /**
   * SKU 매핑 목록 조회
   * GET /api/v1/mappings
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
        sortBy = 'updatedAt',
        order = 'desc'
      } = req.query;

      const query: any = {};
      
      // 검색어 처리
      if (search) {
        query.$or = [
          { sku: { $regex: search, $options: 'i' } },
          { productName: { $regex: search, $options: 'i' } },
          { naverProductId: { $regex: search, $options: 'i' } },
          { shopifyProductId: { $regex: search, $options: 'i' } }
        ];
      }
      
      // 상태 필터
      if (status) {
        query.status = status;
      }
      
      // 활성화 여부 필터
      if (isActive !== undefined) {
        query.isActive = isActive === 'true';
      }

      const skip = (Number(page) - 1) * Number(limit);
      const sort: any = { [String(sortBy)]: order === 'asc' ? 1 : -1 };

      const [mappings, total] = await Promise.all([
        ProductMapping.find(query)
          .sort(sort)
          .skip(skip)
          .limit(Number(limit))
          .lean(),
        ProductMapping.countDocuments(query)
      ]);

      // 각 매핑의 동기화 상태 확인
      const mappingsWithStatus = await Promise.all(
        mappings.map(async (mapping) => {
          const syncStatus = await this.mappingService.checkMappingStatus(mapping.sku);
          return {
            ...mapping,
            syncStatus
          };
        })
      );

      res.json({
        success: true,
        data: {
          mappings: mappingsWithStatus,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            pages: Math.ceil(total / Number(limit))
          }
        }
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * 새 매핑 생성
   * POST /api/v1/mappings
   */
  createMapping = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const {
        sku,
        naverProductId,
        shopifyProductId,
        shopifyVariantId,
        priceMargin,
        isActive = true
      } = req.body;

      // SKU 유효성 검사
      if (!validateSKU(sku)) {
        throw new AppError('Invalid SKU format', 400);
      }

      // 중복 확인
      const existingMapping = await ProductMapping.findOne({ sku });
      if (existingMapping) {
        throw new AppError('SKU already exists', 409);
      }

      // 매핑 생성 및 검증
      const mapping = await this.mappingService.createMapping({
        sku,
        naverProductId,
        shopifyProductId,
        shopifyVariantId,
        priceMargin: priceMargin || 15,
        isActive
      });

      // 검증 실행
      const validation = await this.mappingService.validateMapping(sku);
      
      res.status(201).json({
        success: true,
        data: {
          mapping,
          validation
        }
      });

      logger.info(`New mapping created: ${sku}`);
    } catch (error) {
      next(error);
    }
  };

  /**
   * 매핑 수정
   * PUT /api/v1/mappings/:id
   */
  updateMapping = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const updateData = req.body;

      const mapping = await ProductMapping.findById(id);
      if (!mapping) {
        throw new AppError('Mapping not found', 404);
      }

      // SKU 변경 시 유효성 검사
      if (updateData.sku && updateData.sku !== mapping.sku) {
        if (!validateSKU(updateData.sku)) {
          throw new AppError('Invalid SKU format', 400);
        }
        
        // 중복 확인
        const existing = await ProductMapping.findOne({ sku: updateData.sku });
        if (existing) {
          throw new AppError('SKU already exists', 409);
        }
      }

      // 업데이트
      const updatedMapping = await this.mappingService.updateMapping(id, updateData);

      // 검증 실행
      const validation = await this.mappingService.validateMapping(updatedMapping.sku);

      res.json({
        success: true,
        data: {
          mapping: updatedMapping,
          validation
        }
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * 매핑 삭제
   * DELETE /api/v1/mappings/:id
   */
  deleteMapping = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { id } = req.params;

      const mapping = await ProductMapping.findById(id);
      if (!mapping) {
        throw new AppError('Mapping not found', 404);
      }

      await this.mappingService.deleteMapping(id);

      res.json({
        success: true,
        message: 'Mapping deleted successfully'
      });

      logger.info(`Mapping deleted: ${mapping.sku}`);
    } catch (error) {
      next(error);
    }
  };

  /**
   * 자동 매핑 탐색
   * POST /api/v1/mappings/auto-discover
   */
  autoDiscoverMappings = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const {
        matchBySku = true,
        matchByName = false,
        nameSimilarity = 80,
        priceDifference = 20
      } = req.body;

      const options = {
        matchBySku,
        matchByName,
        nameSimilarity,
        priceDifference
      };

      logger.info('Starting auto-discovery with options:', options);

      const discoveries = await this.mappingService.autoDiscoverMappings(options);

      res.json({
        success: true,
        data: {
          found: discoveries.length,
          mappings: discoveries
        }
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * 매핑 검증
   * POST /api/v1/mappings/:id/validate
   */
  validateMapping = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { id } = req.params;

      const mapping = await ProductMapping.findById(id);
      if (!mapping) {
        throw new AppError('Mapping not found', 404);
      }

      const validation = await this.mappingService.validateMapping(mapping.sku);

      // 상태 업데이트
      mapping.status = validation.isValid ? 'ACTIVE' : 'ERROR';
      await mapping.save();

      res.json({
        success: true,
        data: validation
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * 엑셀 대량 업로드
   * POST /api/v1/mappings/bulk
   */
  bulkUploadMappings = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.file) {
        throw new AppError('No file uploaded', 400);
      }

      const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(sheet);

      if (!data.length) {
        throw new AppError('Empty file', 400);
      }

      const results = {
        success: [],
        errors: [],
        skipped: []
      };

      for (const [index, row] of data.entries()) {
        try {
          const mappingData: any = {
            sku: row['SKU'] || row['sku'],
            naverProductId: String(row['네이버상품ID'] || row['naverProductId'] || ''),
            shopifyProductId: String(row['Shopify상품ID'] || row['shopifyProductId'] || ''),
            isActive: row['활성화'] === 'Y' || row['isActive'] === true,
            priceMargin: Number(row['마진율'] || row['priceMargin'] || 15)
          };

          // SKU 유효성 검사
          if (!validateSKU(mappingData.sku)) {
            results.errors.push({
              row: index + 2,
              sku: mappingData.sku,
              error: 'Invalid SKU format'
            });
            continue;
          }

          // 중복 확인
          const existing = await ProductMapping.findOne({ sku: mappingData.sku });
          if (existing) {
            results.skipped.push({
              row: index + 2,
              sku: mappingData.sku,
              reason: 'Already exists'
            });
            continue;
          }

          // 매핑 생성
          const mapping = await this.mappingService.createMapping(mappingData);
          results.success.push({
            row: index + 2,
            sku: mapping.sku
          });
        } catch (error: any) {
          results.errors.push({
            row: index + 2,
            sku: row['SKU'] || row['sku'],
            error: error.message
          });
        }
      }

      res.json({
        success: true,
        data: {
          total: data.length,
          ...results
        }
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * 엑셀 템플릿 다운로드
   * GET /api/v1/mappings/template
   */
  downloadTemplate = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const template = [
        {
          'SKU': 'ALBUM-001',
          '네이버상품ID': '12345678',
          'Shopify상품ID': '7890123456',
          '활성화': 'Y',
          '마진율': '15'
        }
      ];

      const ws = XLSX.utils.json_to_sheet(template);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'SKU매핑');

      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="sku-mapping-template.xlsx"');
      res.send(buffer);
    } catch (error) {
      next(error);
    }
  };
}