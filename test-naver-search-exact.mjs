import dotenv from 'dotenv';
import { NaverAuthService } from './packages/backend/dist/services/naver/NaverAuthService.js';
import { NaverProductService } from './packages/backend/dist/services/naver/NaverProductService.js';

dotenv.config({ path: './packages/backend/.env' });

async function testSearch() {
  console.log('🔍 Testing Naver product search with exact SKU matching...\n');
  
  const authService = new NaverAuthService({
    clientId: process.env.NAVER_CLIENT_ID,
    clientSecret: process.env.NAVER_CLIENT_SECRET,
  });

  const productService = new NaverProductService(authService);
  
  const testSkus = ['2025080501', '2025080502'];
  
  for (const sku of testSkus) {
    console.log(`\n📦 Searching for SKU: ${sku}`);
    console.log('='.repeat(50));
    
    try {
      // 1. searchProducts로 직접 검색
      const searchResult = await productService.searchProducts({
        searchKeyword: sku,
        searchType: 'SELLER_MANAGEMENT_CODE',
        page: 1,
        size: 10
      });
      
      console.log(`\n✅ Search API Response:`);
      console.log(`- Total items: ${searchResult?.contents?.length || 0}`);
      
      if (searchResult?.contents && searchResult.contents.length > 0) {
        console.log('\n📋 All found products:');
        searchResult.contents.forEach((product, index) => {
          console.log(`  ${index + 1}. SKU: ${product.sellerManagementCode}, Name: ${product.name}`);
        });
        
        // 정확히 일치하는 것만 필터링
        const exactMatches = searchResult.contents.filter(p => 
          p.sellerManagementCode === sku
        );
        
        console.log(`\n🎯 Exact matches: ${exactMatches.length}`);
        if (exactMatches.length > 0) {
          exactMatches.forEach((product, index) => {
            console.log(`  ${index + 1}. SKU: ${product.sellerManagementCode}, Name: ${product.name}, Stock: ${product.stockQuantity}`);
          });
        } else {
          console.log('  ❌ No exact matches found');
        }
      } else {
        console.log('  ❌ No products found');
      }
      
      // 2. searchProductsBySellerManagementCode로 검색 (수정된 메서드)
      console.log('\n📦 Using searchProductsBySellerManagementCode method:');
      const directSearch = await productService.searchProductsBySellerManagementCode(sku);
      console.log(`- Found products: ${directSearch.length}`);
      if (directSearch.length > 0) {
        directSearch.forEach((product, index) => {
          console.log(`  ${index + 1}. SKU: ${product.sellerManagementCode}, Name: ${product.name}`);
        });
      }
      
    } catch (error) {
      console.error(`❌ Error searching for ${sku}:`, error.message);
    }
  }
  
  process.exit(0);
}

testSearch().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});