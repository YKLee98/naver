import 'dotenv/config';
import { connectDatabase, disconnectDatabase } from '@/config/database';
import { connectRedis, disconnectRedis } from '@/config/redis';
import { ProductMapping, ExchangeRate } from '@/models';
import { NaverAuthService, NaverProductService } from '@/services/naver';
import { ShopifyGraphQLService } from '@/services/shopify';
import { logger } from '..//utils/logger';
import { chunk } from 'lodash';

interface SeedOptions {
  clearExisting?: boolean;
  vendor?: string;
  dryRun?: boolean;
}

class DataSeeder {
  private naverProductService: NaverProductService;
  private shopifyGraphQLService: ShopifyGraphQLService;
  private options: SeedOptions;

  constructor(options: SeedOptions = {}) {
    this.options = {
      clearExisting: false,
      vendor: 'album',
      dryRun: false,
      ...options,
    };

    const redis = connectRedis();
    const naverAuthService = new NaverAuthService(redis);
    this.naverProductService = new NaverProductService(naverAuthService);
    this.shopifyGraphQLService = new ShopifyGraphQLService();
  }

  async seed(): Promise<void> {
    try {
      logger.info('Starting data seeding process', this.options);

      // 1. 기존 데이터 정리 (옵션)
      if (this.options.clearExisting && !this.options.dryRun) {
        await this.clearExistingData();
      }

      // 2. 초기 환율 설정
      await this.seedExchangeRate();

      // 3. 상품 매핑 데이터 시딩
      await this.seedProductMappings();

      logger.info('Data seeding completed successfully');
    } catch (error) {
      logger.error('Data seeding failed:', error);
      throw error;
    }
  }

  private async clearExistingData(): Promise<void> {
    logger.warn('Clearing existing data...');

    const result = await ProductMapping.deleteMany({});
    logger.info(`Deleted ${result.deletedCount} product mappings`);
  }

  private async seedExchangeRate(): Promise<void> {
    logger.info('Seeding initial exchange rate...');

    const existingRate = await ExchangeRate.findOne({
      baseCurrency: 'KRW',
      targetCurrency: 'USD',
      validUntil: { $gte: new Date() },
    });

    if (existingRate) {
      logger.info('Valid exchange rate already exists, skipping');
      return;
    }

    if (!this.options.dryRun) {
      const defaultRate = 0.00075; // 1 KRW = 0.00075 USD (approximate)

      await ExchangeRate.create({
        baseCurrency: 'KRW',
        targetCurrency: 'USD',
        rate: defaultRate,
        source: 'manual',
        isManual: true,
        validFrom: new Date(),
        validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7일
        metadata: {
          manualReason: 'Initial seed data',
        },
      });

      logger.info(`Created default exchange rate: 1 KRW = ${defaultRate} USD`);
    }
  }

  private async seedProductMappings(): Promise<void> {
    logger.info('Fetching product data from both platforms...');

    // Shopify 데이터 수집
    const shopifyProducts = await this.fetchShopifyProducts();
    logger.info(`Fetched ${shopifyProducts.size} products from Shopify`);

    // Naver 데이터 수집
    const naverProducts = await this.fetchNaverProducts();
    logger.info(`Fetched ${naverProducts.size} products from Naver`);

    // 매핑 생성
    const mappings = this.createMappings(shopifyProducts, naverProducts);
    logger.info(`Created ${mappings.length} product mappings`);

    // 매핑 저장
    if (!this.options.dryRun) {
      await this.saveMappings(mappings);
    } else {
      logger.info('Dry run mode - mappings not saved');
      // 샘플 출력
      mappings.slice(0, 5).forEach((mapping) => {
        logger.info('Sample mapping:', mapping);
      });
    }

    // 매칭되지 않은 상품 리포트
    this.reportUnmatchedProducts(shopifyProducts, naverProducts, mappings);
  }

  private async fetchShopifyProducts(): Promise<Map<string, any>> {
    const products = await this.shopifyGraphQLService.getProductsByVendor(
      this.options.vendor!
    );

    const productMap = new Map<string, any>();

    products.forEach((product) => {
      product.variants.edges.forEach((edge: any) => {
        const variant = edge.node;
        if (variant.sku) {
          productMap.set(variant.sku.toUpperCase(), {
            productId: product.id,
            productTitle: product.title,
            variantId: variant.id,
            sku: variant.sku,
            price: variant.price,
            inventoryItemId: variant.inventoryItem.id,
            locationId:
              variant.inventoryItem.inventoryLevels.edges[0]?.node.location.id,
            available:
              variant.inventoryItem.inventoryLevels.edges[0]?.node.available ||
              0,
          });
        }
      });
    });

    return productMap;
  }

  private async fetchNaverProducts(): Promise<Map<string, any>> {
    const productMap = new Map<string, any>();
    let totalFetched = 0;

    // 페이지네이션으로 모든 상품 조회
    for await (const batch of this.naverProductService.getAllProducts(100)) {
      for (const product of batch) {
        if (product.sellerManagementCode) {
          productMap.set(product.sellerManagementCode.toUpperCase(), {
            productId: product.productId,
            name: product.name,
            sku: product.sellerManagementCode,
            salePrice: product.salePrice,
            stockQuantity: product.stockQuantity,
            statusType: product.statusType,
            saleStatus: product.saleStatus,
          });
        }
      }

      totalFetched += batch.length;
      logger.info(`Fetched ${totalFetched} products from Naver...`);

      // Rate limit 준수
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    return productMap;
  }

  private createMappings(
    shopifyProducts: Map<string, any>,
    naverProducts: Map<string, any>
  ): any[] {
    const mappings: any[] = [];

    naverProducts.forEach((naverProduct, sku) => {
      const shopifyProduct = shopifyProducts.get(sku);

      if (shopifyProduct) {
        mappings.push({
          sku,
          naverProductId: naverProduct.productId,
          shopifyProductId: this.extractNumericId(shopifyProduct.productId),
          shopifyVariantId: this.extractNumericId(shopifyProduct.variantId),
          shopifyInventoryItemId: this.extractNumericId(
            shopifyProduct.inventoryItemId
          ),
          shopifyLocationId: this.extractNumericId(shopifyProduct.locationId),
          productName: naverProduct.name,
          vendor: this.options.vendor,
          isActive: naverProduct.saleStatus === 'SALE',
          status: 'ACTIVE',
          priceMargin: 1.15,
          metadata: {
            shopifyTitle: shopifyProduct.productTitle,
            naverStatus: naverProduct.statusType,
            initialPrices: {
              naver: naverProduct.salePrice,
              shopify: parseFloat(shopifyProduct.price),
            },
            initialQuantities: {
              naver: naverProduct.stockQuantity,
              shopify: shopifyProduct.available,
            },
          },
        });
      }
    });

    return mappings;
  }

  private async saveMappings(mappings: any[]): Promise<void> {
    logger.info('Saving mappings to database...');

    // 배치로 저장
    const batches = chunk(mappings, 100);
    let saved = 0;

    for (const batch of batches) {
      try {
        await ProductMapping.insertMany(batch, { ordered: false });
        saved += batch.length;
        logger.info(`Saved ${saved}/${mappings.length} mappings`);
      } catch (error: any) {
        if (error.code === 11000) {
          // 중복 키 에러 처리
          logger.warn('Some mappings already exist, updating...');

          for (const mapping of batch) {
            await ProductMapping.findOneAndUpdate(
              { sku: mapping.sku },
              mapping,
              { upsert: true, new: true }
            );
          }
        } else {
          throw error;
        }
      }
    }

    logger.info(`Successfully saved ${saved} product mappings`);
  }

  private reportUnmatchedProducts(
    shopifyProducts: Map<string, any>,
    naverProducts: Map<string, any>,
    mappings: any[]
  ): void {
    const mappedSkus = new Set(mappings.map((m) => m.sku));

    // Shopify에만 있는 상품
    const shopifyOnly: string[] = [];
    shopifyProducts.forEach((product, sku) => {
      if (!mappedSkus.has(sku)) {
        shopifyOnly.push(sku);
      }
    });

    // Naver에만 있는 상품
    const naverOnly: string[] = [];
    naverProducts.forEach((product, sku) => {
      if (!mappedSkus.has(sku)) {
        naverOnly.push(sku);
      }
    });

    if (shopifyOnly.length > 0) {
      logger.warn(`Found ${shopifyOnly.length} products only in Shopify:`);
      shopifyOnly.slice(0, 10).forEach((sku) => {
        logger.warn(`  - ${sku}: ${shopifyProducts.get(sku).productTitle}`);
      });
      if (shopifyOnly.length > 10) {
        logger.warn(`  ... and ${shopifyOnly.length - 10} more`);
      }
    }

    if (naverOnly.length > 0) {
      logger.warn(`Found ${naverOnly.length} products only in Naver:`);
      naverOnly.slice(0, 10).forEach((sku) => {
        logger.warn(`  - ${sku}: ${naverProducts.get(sku).name}`);
      });
      if (naverOnly.length > 10) {
        logger.warn(`  ... and ${naverOnly.length - 10} more`);
      }
    }
  }

  private extractNumericId(gid: string): string {
    const parts = gid.split('/');
    return parts[parts.length - 1];
  }
}

// CLI 실행
async function main() {
  const args = process.argv.slice(2);
  const options: SeedOptions = {
    clearExisting: args.includes('--clear'),
    dryRun: args.includes('--dry-run'),
    vendor: 'album',
  };

  // 벤더 파라미터 파싱
  const vendorIndex = args.indexOf('--vendor');
  if (vendorIndex !== -1 && args[vendorIndex + 1]) {
    options.vendor = args[vendorIndex + 1];
  }

  try {
    await connectDatabase();

    const seeder = new DataSeeder(options);
    await seeder.seed();

    logger.info('Seeding completed successfully');
  } catch (error) {
    logger.error('Seeding failed:', error);
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
Usage: npm run seed [options]

Options:
  --clear       Clear existing data before seeding
  --dry-run     Run without saving to database
  --vendor      Specify vendor (default: album)
  --help        Show this help message

Examples:
  npm run seed
  npm run seed --clear
  npm run seed --dry-run
  npm run seed --vendor album --clear
  `);
  process.exit(0);
}

main();
