import axios from 'axios';

async function testNaverPriceSearch() {
  const baseUrl = 'http://localhost:3000/api/v1';
  const token = 'test-token';
  
  try {
    console.log('=== 네이버 가격 검색 테스트 ===\n');
    
    // 1. 매핑 정보 가져오기
    console.log('1. 매핑 정보 확인...');
    const mappingRes = await axios.get(`${baseUrl}/mappings`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    const mappings = mappingRes.data.data.mappings;
    console.log(`총 ${mappings.length}개 매핑 찾음\n`);
    
    for (const mapping of mappings) {
      console.log(`\n=== ${mapping.sku} ===`);
      console.log(`네이버 ID: ${mapping.naverProductId}`);
      console.log(`Shopify ID: ${mapping.shopifyVariantId}`);
      
      // 2. 네이버 상품 직접 조회 (매핑된 ID로)
      if (mapping.naverProductId && mapping.naverProductId !== 'PENDING') {
        try {
          // 내부 API 호출 시도
          const naverRes = await axios.post(
            'http://localhost:3000/internal/naver/product/' + mapping.naverProductId,
            {},
            {
              headers: { Authorization: `Bearer ${token}` }
            }
          ).catch(() => null);
          
          if (naverRes) {
            console.log('네이버 상품 정보:', naverRes.data);
          }
        } catch (err) {
          console.log('직접 조회 실패');
        }
      }
      
      // 3. SKU로 검색
      console.log(`\nSKU로 검색: ${mapping.sku}`);
      const searchRes = await axios.get(
        `${baseUrl}/mappings/search-by-sku?sku=${mapping.sku}`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      
      if (searchRes.data?.data?.naver?.products?.length > 0) {
        const products = searchRes.data.data.naver.products;
        console.log(`찾은 상품 수: ${products.length}`);
        
        // 정확한 매칭 찾기
        const exactMatch = products.find(p => 
          p.id === mapping.naverProductId || 
          p.sellerManagementCode === mapping.sku
        );
        
        if (exactMatch) {
          console.log('정확한 매칭:');
          console.log(`  - 이름: ${exactMatch.name}`);
          console.log(`  - 가격: ${exactMatch.price || exactMatch.salePrice}`);
          console.log(`  - 재고: ${exactMatch.stockQuantity || exactMatch.stock}`);
        } else {
          console.log('정확한 매칭 없음, 첫 번째 결과:');
          const first = products[0];
          console.log(`  - 이름: ${first.name}`);
          console.log(`  - 가격: ${first.price || first.salePrice}`);
          console.log(`  - 재고: ${first.stockQuantity || first.stock}`);
        }
      }
    }
    
    // 4. 가격 API 테스트
    console.log('\n\n=== 가격 API 테스트 ===');
    const priceRes = await axios.get(`${baseUrl}/prices?realtime=true`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (priceRes.data?.data) {
      priceRes.data.data.forEach(item => {
        console.log(`\n${item.sku}:`);
        console.log(`  - 네이버: ${item.naverPrice}원`);
        console.log(`  - Shopify: $${item.shopifyPrice}`);
      });
    }
    
  } catch (error) {
    console.error('테스트 실패:', error.response?.data || error.message);
  }
}

testNaverPriceSearch().catch(console.error);