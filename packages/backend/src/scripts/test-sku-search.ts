// packages/backend/src/scripts/test-sku-search.ts
import 'dotenv/config';
import { ShopifyProductSearchService } from '../services/shopify/ShopifyProductSearchService';

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message: string, color: string = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

async function testSKUSearch() {
  log('\n=== Shopify SKU 검색 테스트 ===', colors.cyan);

  try {
    const searchService = new ShopifyProductSearchService();

    // 테스트할 SKU 목록
    const testSKUs = [
      '2025080501',
      'BJ-342532522', // 실제 존재하는 SKU
      'TEST-SKU-001',
      'ALBUM-001',
    ];

    for (const sku of testSKUs) {
      log(`\n🔍 Searching for SKU: ${sku}`, colors.blue);

      const result = await searchService.searchBySKU(sku);

      if (result.found) {
        log(`✅ Found via ${result.method}!`, colors.green);
        log(`   Products found: ${result.products.length}`, colors.green);

        result.products.forEach((product: any, index: number) => {
          log(`\n   Product ${index + 1}:`, colors.cyan);
          log(`   - Product: ${product.product_title}`, colors.white);
          log(`   - Variant: ${product.variant_title}`, colors.white);
          log(`   - SKU: ${product.sku}`, colors.white);
          log(`   - Price: ${product.price}`, colors.white);
          log(`   - Inventory: ${product.inventory_quantity}`, colors.white);
          log(`   - Vendor: ${product.vendor}`, colors.white);
        });
      } else {
        log(`❌ Not found`, colors.red);
      }
    }

    // 벌크 검색 테스트
    log('\n\n📋 Bulk SKU Search Test', colors.cyan);
    const bulkResults = await searchService.searchMultipleSKUs(testSKUs);

    bulkResults.forEach((result, sku) => {
      if (result.found) {
        log(
          `✅ ${sku}: Found ${result.products.length} products`,
          colors.green
        );
      } else {
        log(`❌ ${sku}: Not found`, colors.red);
      }
    });
  } catch (error) {
    log(`\n❌ Error: ${error}`, colors.red);
  }

  log('\n=== 테스트 완료 ===', colors.cyan);
}

// 실행
testSKUSearch().catch(console.error);
