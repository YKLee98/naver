// packages/backend/src/controllers/InventoryAdjustController.ts
import { Request, Response, NextFunction } from 'express';
import { NaverProductService } from '../services/naver/NaverProductService';
import { ShopifyInventoryService } from '../services/shopify/ShopifyInventoryService';
import { NaverAuthService } from '../services/naver/NaverAuthService';
import { InventoryTransaction } from '../models/InventoryTransaction';
import { ProductMapping } from '../models/ProductMapping';
import { Redis } from 'ioredis';
import { logger } from '../utils/logger';

interface AdjustInventoryRequest {
  sku: string;
  platform: 'naver' | 'shopify' | 'both';
  adjustType: 'set' | 'add' | 'subtract';
  naverQuantity?: number;
  shopifyQuantity?: number;
  reason: string;
}

export class InventoryAdjustController {
  private naverProductService: NaverProductService;
  private shopifyInventoryService: ShopifyInventoryService;

  constructor(redis: Redis) {
    const naverAuthService = new NaverAuthService(redis);
    this.naverProductService = new NaverProductService(naverAuthService);
    this.shopifyInventoryService = new ShopifyInventoryService();
  }

  /**
   * 재고 조정
   */
  async adjustInventory(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const adjustData = req.body as AdjustInventoryRequest;
      const userId = (req as any).user?.id;

      logger.info(`Adjusting inventory for SKU: ${adjustData.sku}`, adjustData);

      // SKU로 매핑 정보 조회
      const mapping = await ProductMapping.findOne({ sku: adjustData.sku });
      if (!mapping) {
        res.status(404).json({
          success: false,
          error: '해당 SKU의 매핑 정보를 찾을 수 없습니다.',
        });
        return;
      }

      const results: any = {
        naver: null,
        shopify: null,
      };

      // 네이버 재고 조정
      if (
        (adjustData.platform === 'naver' || adjustData.platform === 'both') &&
        adjustData.naverQuantity !== undefined
      ) {
        try {
          const currentStock = await this.naverProductService.getProductStock(
            mapping.naverProductId
          );
          const newQuantity = this.calculateNewQuantity(
            currentStock,
            adjustData.naverQuantity,
            adjustData.adjustType
          );

          await this.naverProductService.updateProductStock(
            mapping.naverProductId,
            newQuantity
          );

          // 트랜잭션 기록
          await InventoryTransaction.create({
            sku: adjustData.sku,
            platform: 'naver',
            type: adjustData.adjustType,
            previousQuantity: currentStock,
            newQuantity,
            adjustmentQuantity: adjustData.naverQuantity,
            reason: adjustData.reason,
            userId,
            productId: mapping.naverProductId,
          });

          results.naver = {
            success: true,
            previousQuantity: currentStock,
            newQuantity,
            adjustmentQuantity: adjustData.naverQuantity,
          };

          logger.info(
            `Naver inventory adjusted for SKU ${adjustData.sku}: ${currentStock} -> ${newQuantity}`
          );
        } catch (error) {
          logger.error(
            `Failed to adjust Naver inventory for SKU ${adjustData.sku}:`,
            error
          );
          results.naver = {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      }

      // Shopify 재고 조정
      if (
        (adjustData.platform === 'shopify' || adjustData.platform === 'both') &&
        adjustData.shopifyQuantity !== undefined
      ) {
        try {
          // 현재 재고 조회
          const currentInventory =
            await this.shopifyInventoryService.getInventoryLevel(
              mapping.shopifyInventoryItemId,
              mapping.shopifyLocationId
            );

          const newQuantity = this.calculateNewQuantity(
            currentInventory.available,
            adjustData.shopifyQuantity,
            adjustData.adjustType
          );

          // 재고 조정
          await this.shopifyInventoryService.adjustInventoryLevel(
            mapping.shopifyInventoryItemId,
            mapping.shopifyLocationId,
            newQuantity - currentInventory.available
          );

          // 트랜잭션 기록
          await InventoryTransaction.create({
            sku: adjustData.sku,
            platform: 'shopify',
            type: adjustData.adjustType,
            previousQuantity: currentInventory.available,
            newQuantity,
            adjustmentQuantity: adjustData.shopifyQuantity,
            reason: adjustData.reason,
            userId,
            productId: mapping.shopifyProductId,
          });

          results.shopify = {
            success: true,
            previousQuantity: currentInventory.available,
            newQuantity,
            adjustmentQuantity: adjustData.shopifyQuantity,
          };

          logger.info(
            `Shopify inventory adjusted for SKU ${adjustData.sku}: ${currentInventory.available} -> ${newQuantity}`
          );
        } catch (error) {
          logger.error(
            `Failed to adjust Shopify inventory for SKU ${adjustData.sku}:`,
            error
          );
          results.shopify = {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      }

      // 응답 처리
      const allSuccess =
        (!results.naver || results.naver.success) &&
        (!results.shopify || results.shopify.success);

      res.status(allSuccess ? 200 : 207).json({
        success: allSuccess,
        message: allSuccess
          ? '재고 조정이 완료되었습니다.'
          : '일부 플랫폼에서 오류가 발생했습니다.',
        data: results,
      });
    } catch (error) {
      logger.error('Failed to adjust inventory:', error);
      next(error);
    }
  }

  /**
   * 재고 조정 이력 조회
   */
  async getAdjustmentHistory(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { sku } = req.params;
      const { page = 1, limit = 20 } = req.query;

      const transactions = await InventoryTransaction.find({ sku })
        .sort({ createdAt: -1 })
        .limit(Number(limit))
        .skip((Number(page) - 1) * Number(limit))
        .populate('userId', 'name email');

      const total = await InventoryTransaction.countDocuments({ sku });

      res.json({
        success: true,
        data: {
          transactions,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            totalPages: Math.ceil(total / Number(limit)),
          },
        },
      });
    } catch (error) {
      logger.error('Failed to get adjustment history:', error);
      next(error);
    }
  }

  /**
   * 새 수량 계산
   */
  private calculateNewQuantity(
    current: number,
    adjustment: number,
    type: string
  ): number {
    switch (type) {
      case 'set':
        return adjustment;
      case 'add':
        return current + adjustment;
      case 'subtract':
        return Math.max(0, current - adjustment);
      default:
        return current;
    }
  }
}
