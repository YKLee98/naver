// packages/backend/src/controllers/InventoryController.ts
import { Request, Response, NextFunction } from 'express';
import { InventorySyncService } from '../services/sync/index.js';
import { logger } from '../utils/logger.js';
import { ProductMapping, InventoryTransaction, Activity } from '../models/index.js';
import { AppError } from '../utils/errors.js';

export class InventoryController {
  private inventorySyncService: InventorySyncService;

  constructor(inventorySyncService: InventorySyncService) {
    this.inventorySyncService = inventorySyncService;
  }

  /**
   * Get all inventory status
   * GET /api/v1/inventory/status
   */
  async getAllInventoryStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { 
        page = 1, 
        limit = 20, 
        search,
        status,
        stockLevel,
        sortBy = 'sku',
        order = 'asc'
      } = req.query;
      
      // Build query
      const query: any = {};
      
      if (search) {
        query.$or = [
          { sku: { $regex: search, $options: 'i' } },
          { productName: { $regex: search, $options: 'i' } }
        ];
      }
      
      if (status) {
        query.syncStatus = status;
      }
      
      // Get mappings with inventory data
      const skip = (Number(page) - 1) * Number(limit);
      
      const [mappings, total] = await Promise.all([
        ProductMapping.find(query)
          .sort({ [sortBy as string]: order === 'asc' ? 1 : -1 })
          .skip(skip)
          .limit(Number(limit))
          .lean(),
        ProductMapping.countDocuments(query)
      ]);
      
      // Format inventory items
      const inventoryItems = mappings.map(mapping => {
        const naverStock = mapping.inventory?.naver?.available || 0;
        const shopifyStock = mapping.inventory?.shopify?.available || 0;
        const difference = Math.abs(naverStock - shopifyStock);
        
        let itemStatus = 'synced';
        if (difference > 0) itemStatus = 'mismatch';
        if (naverStock === 0 || shopifyStock === 0) itemStatus = 'warning';
        if (naverStock === 0 && shopifyStock === 0) itemStatus = 'out_of_stock';
        
        return {
          _id: mapping._id,
          id: mapping._id,
          sku: mapping.sku,
          productName: mapping.productName,
          naverStock,
          shopifyStock,
          difference,
          status: itemStatus,
          syncStatus: mapping.syncStatus,
          lastSyncedAt: mapping.lastSyncedAt,
          isActive: mapping.isActive
        };
      });
      
      // Apply stock level filter if provided
      let filteredItems = inventoryItems;
      if (stockLevel) {
        switch (stockLevel) {
          case 'low':
            filteredItems = inventoryItems.filter(item => 
              item.naverStock < 10 || item.shopifyStock < 10
            );
            break;
          case 'out':
            filteredItems = inventoryItems.filter(item => 
              item.naverStock === 0 || item.shopifyStock === 0
            );
            break;
          case 'normal':
            filteredItems = inventoryItems.filter(item => 
              item.naverStock >= 10 && item.shopifyStock >= 10
            );
            break;
        }
      }

      res.json({
        success: true,
        data: filteredItems,
        pagination: {
          total: filteredItems.length,
          page: Number(page),
          limit: Number(limit),
          totalPages: Math.ceil(filteredItems.length / Number(limit))
        },
        summary: {
          totalSku: total,
          normalCount: inventoryItems.filter(i => i.status === 'synced').length,
          warningCount: inventoryItems.filter(i => i.status === 'warning').length,
          errorCount: inventoryItems.filter(i => i.status === 'mismatch').length,
          outOfStockCount: inventoryItems.filter(i => i.status === 'out_of_stock').length
        }
      });
    } catch (error) {
      logger.error('Get all inventory status error:', error);
      next(error);
    }
  }

  /**
   * Get inventory status for a specific SKU
   * GET /api/v1/inventory/:sku/status
   */
  async getInventoryStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { sku } = req.params;
      
      // Find mapping
      const mapping = await ProductMapping.findOne({ 
        sku: sku.toUpperCase() 
      }).lean();
      
      if (!mapping) {
        res.status(404).json({
          success: false,
          error: 'Product not found',
          message: `No product mapping found for SKU: ${sku}`
        });
        return;
      }

      // Get current inventory status
      const naverStock = mapping.inventory?.naver?.available || 0;
      const shopifyStock = mapping.inventory?.shopify?.available || 0;
      const difference = Math.abs(naverStock - shopifyStock);
      
      let syncStatus = 'synced';
      if (difference > 0) syncStatus = 'out_of_sync';
      if (mapping.syncStatus === 'error') syncStatus = 'error';
      
      const status = {
        sku: mapping.sku,
        productName: mapping.productName,
        naverStock,
        shopifyStock,
        difference,
        syncStatus,
        status: difference === 0 ? 'in_sync' : difference > 5 ? 'critical' : 'out_of_sync',
        lastSyncedAt: mapping.lastSyncedAt,
        isActive: mapping.isActive,
        vendor: mapping.vendor,
        metadata: {
          naverProductId: mapping.naverProductId,
          shopifyProductId: mapping.shopifyProductId,
          shopifyVariantId: mapping.shopifyVariantId
        }
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
   * GET /api/v1/inventory/:sku/history
   */
  async getInventoryHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { sku } = req.params;
      const { 
        startDate, 
        endDate, 
        type,
        platform,
        limit = 50,
        page = 1
      } = req.query;

      // Build query
      const filter: any = { sku: sku.toUpperCase() };
      
      if (startDate || endDate) {
        filter.createdAt = {};
        if (startDate) filter.createdAt.$gte = new Date(startDate as string);
        if (endDate) filter.createdAt.$lte = new Date(endDate as string);
      }
      
      if (type) {
        filter.transactionType = type;
      }
      
      if (platform) {
        filter.platform = platform;
      }

      // Get history with pagination
      const skip = (Number(page) - 1) * Number(limit);
      
      const [history, total] = await Promise.all([
        InventoryTransaction.find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(Number(limit))
          .lean(),
        InventoryTransaction.countDocuments(filter)
      ]);

      res.json({
        success: true,
        data: {
          history: history.map(transaction => ({
            _id: transaction._id,
            sku: transaction.sku,
            timestamp: transaction.createdAt,
            type: transaction.transactionType,
            platform: transaction.platform,
            previousStock: transaction.previousQuantity,
            change: transaction.quantity,
            newStock: transaction.newQuantity,
            reason: transaction.reason,
            performedBy: transaction.performedBy,
            syncStatus: transaction.syncStatus,
            orderId: transaction.orderId,
            metadata: transaction.metadata
          })),
          total,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            pages: Math.ceil(total / Number(limit))
          }
        }
      });
    } catch (error) {
      logger.error('Get inventory history error:', error);
      next(error);
    }
  }

  /**
   * Adjust inventory
   * POST /api/v1/inventory/:sku/adjust
   */
  async adjustInventory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { sku } = req.params;
      const { 
        platform,
        adjustType,
        naverQuantity,
        shopifyQuantity,
        reason,
        notes
      } = req.body;

      // Validation
      if (!platform || !adjustType || !reason) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields',
          message: 'Platform, adjustType, and reason are required'
        });
        return;
      }

      if (platform === 'naver' && naverQuantity === undefined) {
        res.status(400).json({
          success: false,
          error: 'Missing naverQuantity',
          message: 'naverQuantity is required when adjusting Naver inventory'
        });
        return;
      }

      if (platform === 'shopify' && shopifyQuantity === undefined) {
        res.status(400).json({
          success: false,
          error: 'Missing shopifyQuantity',
          message: 'shopifyQuantity is required when adjusting Shopify inventory'
        });
        return;
      }

      // Find mapping
      const mapping = await ProductMapping.findOne({ 
        sku: sku.toUpperCase() 
      });
      
      if (!mapping) {
        res.status(404).json({
          success: false,
          error: 'Product not found'
        });
        return;
      }

      // Get current quantities
      const currentNaverStock = mapping.inventory?.naver?.available || 0;
      const currentShopifyStock = mapping.inventory?.shopify?.available || 0;

      // Calculate new quantities based on adjust type
      let newNaverQuantity = currentNaverStock;
      let newShopifyQuantity = currentShopifyStock;

      if (platform === 'naver' || platform === 'both') {
        switch (adjustType) {
          case 'set':
            newNaverQuantity = naverQuantity;
            break;
          case 'add':
            newNaverQuantity = currentNaverStock + naverQuantity;
            break;
          case 'subtract':
            newNaverQuantity = Math.max(0, currentNaverStock - naverQuantity);
            break;
        }
      }

      if (platform === 'shopify' || platform === 'both') {
        switch (adjustType) {
          case 'set':
            newShopifyQuantity = shopifyQuantity;
            break;
          case 'add':
            newShopifyQuantity = currentShopifyStock + shopifyQuantity;
            break;
          case 'subtract':
            newShopifyQuantity = Math.max(0, currentShopifyStock - shopifyQuantity);
            break;
        }
      }

      // Update mapping inventory
      if (!mapping.inventory) {
        mapping.inventory = { naver: {}, shopify: {} };
      }
      
      if (platform === 'naver' || platform === 'both') {
        mapping.inventory.naver.available = newNaverQuantity;
      }
      
      if (platform === 'shopify' || platform === 'both') {
        mapping.inventory.shopify.available = newShopifyQuantity;
      }
      
      await mapping.save();

      // Create transaction records
      const transactions = [];
      
      if (platform === 'naver' || platform === 'both') {
        transactions.push(new InventoryTransaction({
          sku: sku.toUpperCase(),
          platform: 'naver',
          transactionType: 'adjustment',
          quantity: newNaverQuantity - currentNaverStock,
          previousQuantity: currentNaverStock,
          newQuantity: newNaverQuantity,
          reason: reason,
          performedBy: 'manual',
          syncStatus: 'completed',
          metadata: { notes, adjustType, userId: (req as any).user?.id }
        }));
      }
      
      if (platform === 'shopify' || platform === 'both') {
        transactions.push(new InventoryTransaction({
          sku: sku.toUpperCase(),
          platform: 'shopify',
          transactionType: 'adjustment',
          quantity: newShopifyQuantity - currentShopifyStock,
          previousQuantity: currentShopifyStock,
          newQuantity: newShopifyQuantity,
          reason: reason,
          performedBy: 'manual',
          syncStatus: 'completed',
          metadata: { notes, adjustType, userId: (req as any).user?.id }
        }));
      }
      
      await InventoryTransaction.insertMany(transactions);

      // Log activity
      await Activity.create({
        type: 'inventory_update',
        action: 'Manual inventory adjustment',
        details: `Adjusted ${platform} inventory for SKU ${sku}: ${reason}`,
        metadata: {
          sku,
          platform,
          adjustType,
          previousNaverStock: currentNaverStock,
          newNaverStock: newNaverQuantity,
          previousShopifyStock: currentShopifyStock,
          newShopifyStock: newShopifyQuantity
        },
        userId: (req as any).user?.id
      });

      res.json({
        success: true,
        message: 'Inventory adjusted successfully',
        data: {
          sku: mapping.sku,
          productName: mapping.productName,
          naverStock: mapping.inventory.naver.available,
          shopifyStock: mapping.inventory.shopify.available,
          adjustmentDetails: {
            platform,
            adjustType,
            previousNaverStock: currentNaverStock,
            newNaverStock: newNaverQuantity,
            previousShopifyStock: currentShopifyStock,
            newShopifyStock: newShopifyQuantity
          }
        }
      });
    } catch (error) {
      logger.error('Adjust inventory error:', error);
      next(error);
    }
  }

  /**
   * Sync inventory for a specific SKU
   * POST /api/v1/inventory/:sku/sync
   */
  async syncInventory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { sku } = req.params;
      
      logger.info(`Starting inventory sync for SKU: ${sku}`);
      
      // Find mapping
      const mapping = await ProductMapping.findOne({ 
        sku: sku.toUpperCase() 
      });
      
      if (!mapping) {
        res.status(404).json({
          success: false,
          error: 'Product not found'
        });
        return;
      }

      // Perform sync
      const result = await this.inventorySyncService.syncSingleSku(sku);

      // Log activity
      await Activity.create({
        type: 'sync',
        action: 'Manual inventory sync',
        details: `Synced inventory for SKU ${sku}`,
        metadata: result,
        userId: (req as any).user?.id
      });

      res.json({
        success: true,
        message: 'Inventory sync completed',
        data: result
      });
    } catch (error) {
      logger.error('Sync inventory error:', error);
      next(error);
    }
  }

  /**
   * Sync all inventory
   * POST /api/v1/inventory/sync-all
   */
  async syncAllInventory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      logger.info('Starting full inventory sync');
      
      const result = await this.inventorySyncService.syncAllInventory();

      // Log activity
      await Activity.create({
        type: 'sync',
        action: 'Full inventory sync',
        details: `Synced all inventory: ${result.success} successful, ${result.failed} failed`,
        metadata: result,
        userId: (req as any).user?.id
      });

      res.json({
        success: true,
        message: 'Full inventory sync completed',
        data: result
      });
    } catch (error) {
      logger.error('Sync all inventory error:', error);
      next(error);
    }
  }

  /**
   * Get low stock products
   * GET /api/v1/inventory/low-stock
   */
  async getLowStockProducts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { threshold = 10, category } = req.query;
      
      const query: any = { isActive: true };
      
      if (category) {
        query['metadata.naverCategory'] = category;
      }

      const mappings = await ProductMapping.find(query).lean();
      
      const lowStockProducts = mappings.filter(mapping => {
        const naverStock = mapping.inventory?.naver?.available || 0;
        const shopifyStock = mapping.inventory?.shopify?.available || 0;
        return naverStock < Number(threshold) || shopifyStock < Number(threshold);
      }).map(mapping => ({
        sku: mapping.sku,
        productName: mapping.productName,
        naverStock: mapping.inventory?.naver?.available || 0,
        shopifyStock: mapping.inventory?.shopify?.available || 0,
        threshold: Number(threshold),
        category: mapping.metadata?.naverCategory || 'Unknown',
        vendor: mapping.vendor
      }));

      res.json({
        success: true,
        data: lowStockProducts,
        summary: {
          total: lowStockProducts.length,
          threshold: Number(threshold)
        }
      });
    } catch (error) {
      logger.error('Get low stock products error:', error);
      next(error);
    }
  }

  /**
   * Get inventory discrepancies
   * GET /api/v1/inventory/discrepancies
   */
  async getInventoryDiscrepancies(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { minDifference = 1 } = req.query;
      
      const mappings = await ProductMapping.find({ isActive: true }).lean();
      
      const discrepancies = mappings.filter(mapping => {
        const naverStock = mapping.inventory?.naver?.available || 0;
        const shopifyStock = mapping.inventory?.shopify?.available || 0;
        const difference = Math.abs(naverStock - shopifyStock);
        return difference >= Number(minDifference);
      }).map(mapping => {
        const naverStock = mapping.inventory?.naver?.available || 0;
        const shopifyStock = mapping.inventory?.shopify?.available || 0;
        const difference = naverStock - shopifyStock;
        
        return {
          sku: mapping.sku,
          productName: mapping.productName,
          naverStock,
          shopifyStock,
          difference,
          percentageDiff: shopifyStock > 0 
            ? Math.round((difference / shopifyStock) * 100) 
            : 100,
          lastSyncedAt: mapping.lastSyncedAt,
          severity: Math.abs(difference) > 10 ? 'high' : 
                   Math.abs(difference) > 5 ? 'medium' : 'low'
        };
      });

      res.json({
        success: true,
        data: discrepancies,
        summary: {
          total: discrepancies.length,
          high: discrepancies.filter(d => d.severity === 'high').length,
          medium: discrepancies.filter(d => d.severity === 'medium').length,
          low: discrepancies.filter(d => d.severity === 'low').length
        }
      });
    } catch (error) {
      logger.error('Get inventory discrepancies error:', error);
      next(error);
    }
  }

  /**
   * Get inventory metrics
   * GET /api/v1/inventory/metrics
   */
  async getInventoryMetrics(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const mappings = await ProductMapping.find({ isActive: true }).lean();
      
      let totalNaverStock = 0;
      let totalShopifyStock = 0;
      let inStockCount = 0;
      let outOfStockCount = 0;
      let lowStockCount = 0;
      let syncedCount = 0;
      let mismatchCount = 0;
      
      for (const mapping of mappings) {
        const naverStock = mapping.inventory?.naver?.available || 0;
        const shopifyStock = mapping.inventory?.shopify?.available || 0;
        
        totalNaverStock += naverStock;
        totalShopifyStock += shopifyStock;
        
        if (naverStock > 10 && shopifyStock > 10) {
          inStockCount++;
        } else if (naverStock === 0 || shopifyStock === 0) {
          outOfStockCount++;
        } else {
          lowStockCount++;
        }
        
        if (naverStock === shopifyStock) {
          syncedCount++;
        } else {
          mismatchCount++;
        }
      }
      
      const metrics = {
        totalSkus: mappings.length,
        totalNaverStock,
        totalShopifyStock,
        stockLevels: {
          inStock: inStockCount,
          lowStock: lowStockCount,
          outOfStock: outOfStockCount
        },
        syncStatus: {
          synced: syncedCount,
          mismatched: mismatchCount,
          syncRate: mappings.length > 0 
            ? Math.round((syncedCount / mappings.length) * 100) 
            : 0
        },
        averageStock: {
          naver: mappings.length > 0 
            ? Math.round(totalNaverStock / mappings.length) 
            : 0,
          shopify: mappings.length > 0 
            ? Math.round(totalShopifyStock / mappings.length) 
            : 0
        }
      };

      res.json({
        success: true,
        data: metrics
      });
    } catch (error) {
      logger.error('Get inventory metrics error:', error);
      next(error);
    }
  }
}