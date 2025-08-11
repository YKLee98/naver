import 'dotenv/config';
import { connectDatabase, disconnectDatabase } from '@/config/database';
import { connectRedis, disconnectRedis } from '@/config/redis';
import {
  ProductMapping,
  InventoryTransaction,
  PriceHistory,
  OrderSyncStatus,
} from '@/models';
import { NaverAuthService, NaverProductService } from '@/services/naver';
import { ShopifyGraphQLService } from '@/services/shopify';
import { logger } from '@/utils/logger';
import { Table } from 'console-table-printer';

interface SyncCheckResult {
  sku: string;
  productName: string;
  status: 'OK' | 'MISMATCH' | 'ERROR';
  naverQuantity?: number;
  shopifyQuantity?: number;
  quantityDiff?: number;
  naverPrice?: number;
  shopifyPrice?: number;
  priceDiff?: number;
  lastSync?: Date;
  error?: string;
}

class SyncChecker {
  private naverProductService: NaverProductService;
  private shopifyGraphQLService: ShopifyGraphQLService;

  constructor() {
    const redis = connectRedis();
    const naverAuthService = new NaverAuthService(redis);
    this.naverProductService = new NaverProductService(naverAuthService);
    this.shopifyGraphQLService = new ShopifyGraphQLService();
  }

  async checkAll(): Promise<SyncCheckResult[]> {
    logger.info('Starting sync check for all active products...');

    const mappings = await ProductMapping.find({ isActive: true }).lean();
    logger.info(`Found ${mappings.length} active product mappings`);

    const results: SyncCheckResult[] = [];
    let processed = 0;

    for (const mapping of mappings) {
      try {
        const result = await this.checkSingleProduct(mapping);
        results.push(result);

        processed++;
        if (processed % 10 === 0) {
          logger.info(`Processed ${processed}/${mappings.length} products`);
        }

        // Rate limit 준수
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error: any) {
        results.push({
          sku: mapping.sku,
          productName: mapping.productName,
          status: 'ERROR',
          error: error.message,
        });
      }
    }

    return results;
  }

  async checkSingleProduct(mapping: any): Promise<SyncCheckResult> {
    const result: SyncCheckResult = {
      sku: mapping.sku,
      productName: mapping.productName,
      status: 'OK',
      lastSync: mapping.lastSyncedAt,
    };

    try {
      // Naver 상품 정보 조회
      const naverProduct = await this.naverProductService.getProduct(
        mapping.naverProductId
      );

      if (!naverProduct) {
        throw new Error('Naver product not found');
      }

      result.naverQuantity = naverProduct.stockQuantity;
      result.naverPrice = naverProduct.salePrice;

      // Shopify 상품 정보 조회
      const shopifyVariant = await this.shopifyGraphQLService.findVariantBySku(
        mapping.sku
      );

      if (!shopifyVariant) {
        throw new Error('Shopify variant not found');
      }

      const inventoryLevel =
        shopifyVariant.inventoryItem.inventoryLevels.edges[0];
      result.shopifyQuantity = inventoryLevel?.node.available || 0;
      result.shopifyPrice = parseFloat(shopifyVariant.price);

      // 차이 계산
      result.quantityDiff = result.naverQuantity - result.shopifyQuantity;
      result.priceDiff = Math.abs(result.shopifyPrice - result.naverPrice);

      // 상태 판단
      if (result.quantityDiff !== 0) {
        result.status = 'MISMATCH';
      }

      // 가격 차이가 크면 경고
      const priceDiffPercentage = (result.priceDiff / result.naverPrice) * 100;
      if (priceDiffPercentage > 10) {
        result.status = 'MISMATCH';
      }
    } catch (error: any) {
      result.status = 'ERROR';
      result.error = error.message;
    }

    return result;
  }

  async generateReport(results: SyncCheckResult[]): Promise<void> {
    logger.info('\n=== SYNC CHECK REPORT ===\n');

    // 요약 통계
    const stats = {
      total: results.length,
      ok: results.filter((r) => r.status === 'OK').length,
      mismatch: results.filter((r) => r.status === 'MISMATCH').length,
      error: results.filter((r) => r.status === 'ERROR').length,
    };

    logger.info('Summary:');
    logger.info(`  Total Products: ${stats.total}`);
    logger.info(
      `  ✓ Synced: ${stats.ok} (${((stats.ok / stats.total) * 100).toFixed(1)}%)`
    );
    logger.info(
      `  ⚠ Mismatch: ${stats.mismatch} (${((stats.mismatch / stats.total) * 100).toFixed(1)}%)`
    );
    logger.info(
      `  ✗ Error: ${stats.error} (${((stats.error / stats.total) * 100).toFixed(1)}%)`
    );

    // 문제가 있는 상품 테이블
    if (stats.mismatch > 0 || stats.error > 0) {
      logger.info('\nProducts with issues:');

      const table = new Table({
        columns: [
          { name: 'SKU', alignment: 'left' },
          { name: 'Product', alignment: 'left' },
          { name: 'Status', alignment: 'center' },
          { name: 'Naver Qty', alignment: 'right' },
          { name: 'Shopify Qty', alignment: 'right' },
          { name: 'Diff', alignment: 'right' },
          { name: 'Error', alignment: 'left' },
        ],
      });

      results
        .filter((r) => r.status !== 'OK')
        .forEach((r) => {
          table.addRow({
            SKU: r.sku,
            Product: r.productName.substring(0, 30),
            Status: r.status,
            'Naver Qty': r.naverQuantity?.toString() || '-',
            'Shopify Qty': r.shopifyQuantity?.toString() || '-',
            Diff: r.quantityDiff?.toString() || '-',
            Error: r.error?.substring(0, 30) || '-',
          });
        });

      table.printTable();
    }

    // 최근 동기화 통계
    await this.printRecentSyncStats();
  }

  private async printRecentSyncStats(): Promise<void> {
    logger.info('\nRecent Sync Activity:');

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [recentTransactions, recentPriceUpdates, recentOrders] =
      await Promise.all([
        InventoryTransaction.countDocuments({ createdAt: { $gte: oneDayAgo } }),
        PriceHistory.countDocuments({ createdAt: { $gte: oneDayAgo } }),
        OrderSyncStatus.countDocuments({ createdAt: { $gte: oneDayAgo } }),
      ]);

    logger.info(`  Inventory Transactions (24h): ${recentTransactions}`);
    logger.info(`  Price Updates (24h): ${recentPriceUpdates}`);
    logger.info(`  Orders Synced (24h): ${recentOrders}`);
  }

  async fixMismatches(
    results: SyncCheckResult[],
    dryRun: boolean = true
  ): Promise<void> {
    const mismatches = results.filter((r) => r.status === 'MISMATCH');

    if (mismatches.length === 0) {
      logger.info('No mismatches to fix');
      return;
    }

    logger.info(`\nFound ${mismatches.length} mismatches to fix`);

    if (dryRun) {
      logger.info('DRY RUN MODE - No changes will be made');
    }

    for (const mismatch of mismatches) {
      logger.info(`\nFixing ${mismatch.sku}:`);
      logger.info(
        `  Naver: ${mismatch.naverQuantity}, Shopify: ${mismatch.shopifyQuantity}`
      );

      if (!dryRun) {
        try {
          // TODO: 실제 동기화 로직 구현
          logger.info('  [Would sync to Shopify]');
        } catch (error) {
          logger.error(`  Failed to fix ${mismatch.sku}:`, error);
        }
      } else {
        logger.info('  [DRY RUN] Would sync Naver quantity to Shopify');
      }
    }
  }
}

// CLI 실행
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'check';
  const options = {
    fix: args.includes('--fix'),
    dryRun: !args.includes('--no-dry-run'),
    sku: args.find((arg, index) => args[index - 1] === '--sku'),
  };

  try {
    await connectDatabase();

    const checker = new SyncChecker();
    let results: SyncCheckResult[];

    if (options.sku) {
      // 단일 SKU 체크
      const mapping = await ProductMapping.findOne({ sku: options.sku });
      if (!mapping) {
        throw new Error(`Mapping not found for SKU: ${options.sku}`);
      }
      results = [await checker.checkSingleProduct(mapping)];
    } else {
      // 전체 체크
      results = await checker.checkAll();
    }

    // 리포트 생성
    await checker.generateReport(results);

    // 불일치 수정 (옵션)
    if (options.fix) {
      await checker.fixMismatches(results, options.dryRun);
    }
  } catch (error) {
    logger.error('Sync check failed:', error);
    process.exit(1);
  } finally {
    await disconnectDatabase();
    await disconnectRedis();
    process.exit(0);
  }
}

// 사용법 출력
if (process.argv.includes('--help')) {
  console.log(`
Usage: npm run sync-check [command] [options]

Commands:
  check     Check sync status (default)

Options:
  --fix           Fix mismatches
  --no-dry-run    Actually perform fixes (use with --fix)
  --sku [SKU]     Check specific SKU only
  --help          Show this help message

Examples:
  npm run sync-check
  npm run sync-check --sku ALBUM-001
  npm run sync-check --fix
  npm run sync-check --fix --no-dry-run
  `);
  process.exit(0);
}

main();
