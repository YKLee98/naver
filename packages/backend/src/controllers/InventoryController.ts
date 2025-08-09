// packages/backend/src/controllers/InventoryController.ts
import { Request, Response, NextFunction } from 'express';
import { InventorySyncService } from '../services/sync/index.js';
import { logger } from '../utils/logger.js';

export class InventoryController {
  private inventorySyncService: InventorySyncService;

  constructor(inventorySyncService: InventorySyncService) {
    this.inventorySyncService = inventorySyncService;
  }

  /**
   * Get all inventory status
   */
  async getAllInventoryStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const { page = 1, limit = 20, search } = req.query;
      
      // Mock data - 배열 형태로 반환
      const inventoryItems = [
        {
          id: '1',
          sku: 'TEST-001',
          naverStock: 10,
          shopifyStock: 10,
          lastSyncedAt: new Date(),
          status: 'synced'
        },
        {
          id: '2',
          sku: 'TEST-002',
          naverStock: 5,
          shopifyStock: 3,
          lastSyncedAt: new Date(),
          status: 'mismatch'
        }
      ];

      res.json({
        success: true,
        data: inventoryItems, // 배열을 직접 반환
        pagination: {
          total: inventoryItems.length,
          page: Number(page),
          limit: Number(limit),
          totalPages: Math.ceil(inventoryItems.length / Number(limit))
        }
      });
    } catch (error) {
      logger.error('Get all inventory status error:', error);
      next(error);
    }
  }

  /**
   * Get inventory status for a specific SKU
   */
  async getInventoryStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const { sku } = req.params;
      
      // Mock implementation
      const status = {
        sku,
        naverStock: 0,
        shopifyStock: 0,
        synced: false,
        lastSyncedAt: null
      };

      res.json({
        success: true,
        data: status
      });
    } catch (error) {
      logger.error('Get inventory status error:', error);
      next(error);
    }
  }

  /**
   * Get inventory history
   */
  async getInventoryHistory(req: Request, res: Response, next: NextFunction) {
    try {
      const { sku } = req.params;
      const { startDate, endDate, limit = 50 } = req.query;

      // Mock implementation
      const history = [];

      res.json({
        success: true,
        data: history
      });
    } catch (error) {
      logger.error('Get inventory history error:', error);
      next(error);
    }
  }

  /**
   * Adjust inventory
   */
  async adjustInventory(req: Request, res: Response, next: NextFunction) {
    try {
      const { sku } = req.params;
      const { quantity, reason, platform } = req.body;

      // Mock implementation
      logger.info(`Adjusting inventory for SKU ${sku}`, { quantity, reason, platform });

      res.json({
        success: true,
        message: '재고가 조정되었습니다.',
        data: {
          sku,
          quantity,
          platform
        }
      });
    } catch (error) {
      logger.error('Adjust inventory error:', error);
      next(error);
    }
  }

  /**
   * Get low stock products
   */
  async getLowStockProducts(req: Request, res: Response, next: NextFunction) {
    try {
      const { threshold = 10, page = 1, limit = 20 } = req.query;

      // Mock implementation
      const products = [];

      res.json({
        success: true,
        data: {
          products,
          total: 0,
          threshold: Number(threshold)
        }
      });
    } catch (error) {
      logger.error('Get low stock products error:', error);
      next(error);
    }
  }

  /**
   * Get out of stock products
   */
  async getOutOfStockProducts(req: Request, res: Response, next: NextFunction) {
    try {
      const { page = 1, limit = 20 } = req.query;

      // Mock implementation
      const products = [];

      res.json({
        success: true,
        data: {
          products,
          total: 0
        }
      });
    } catch (error) {
      logger.error('Get out of stock products error:', error);
      next(error);
    }
  }

  /**
   * Bulk adjust inventory
   */
  async bulkAdjustInventory(req: Request, res: Response, next: NextFunction) {
    try {
      const { adjustments } = req.body;

      if (!Array.isArray(adjustments)) {
        return res.status(400).json({
          success: false,
          error: { message: 'adjustments must be an array' }
        });
      }

      // Mock implementation
      logger.info(`Bulk adjusting inventory for ${adjustments.length} items`);

      res.json({
        success: true,
        message: `${adjustments.length}개 상품의 재고가 조정되었습니다.`,
        data: {
          processed: adjustments.length,
          success: adjustments.length,
          failed: 0
        }
      });
    } catch (error) {
      logger.error('Bulk adjust inventory error:', error);
      next(error);
    }
  }

  /**
   * Get inventory discrepancies
   */
  async getInventoryDiscrepancies(req: Request, res: Response, next: NextFunction) {
    try {
      const { threshold = 5, page = 1, limit = 20 } = req.query;

      // Mock implementation
      const discrepancies = [];

      res.json({
        success: true,
        data: {
          discrepancies,
          total: 0,
          threshold: Number(threshold)
        }
      });
    } catch (error) {
      logger.error('Get inventory discrepancies error:', error);
      next(error);
    }
  }
}
