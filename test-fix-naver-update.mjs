import axios from 'axios';

async function testNaverInventoryFix() {
  const baseUrl = 'http://localhost:3000/api/v1';
  const token = 'test-token';
  
  try {
    console.log('=== 네이버 재고 업데이트 수정 테스트 ===\n');
    
    // 1. 먼저 매핑 정보 확인
    console.log('1. 매핑 정보 확인...');
    const mappingRes = await axios.get(`${baseUrl}/mappings`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    const mappings = mappingRes.data.data.mappings;
    const testMapping = mappings.find(m => m.sku === '2025080501');
    
    if (testMapping) {
      console.log(`  - SKU: ${testMapping.sku}`);
      console.log(`  - 네이버 ID: ${testMapping.naverProductId}`);
      console.log(`  - Shopify ID: ${testMapping.shopifyVariantId}`);
    }
    
    // 2. 네이버 상품 정보 조회 (SKU로)
    console.log('\n2. 네이버 상품 정보 조회...');
    const searchRes = await axios.get(
      `${baseUrl}/mappings/search-by-sku?sku=2025080501`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    
    const naverProducts = searchRes.data.data.naver.products;
    if (naverProducts && naverProducts.length > 0) {
      const product = naverProducts[0];
      console.log(`  - 상품명: ${product.name}`);
      console.log(`  - 재고: ${product.stockQuantity || product.stock}`);
      console.log(`  - ID: ${product.id}`);
      
      // originProductNo 찾기
      const originProductNo = product.originProductNo || 
                             product.productNo || 
                             product.channelProductNo ||
                             product.id;
      
      console.log(`  - originProductNo (추정): ${originProductNo}`);
    }
    
    // 3. 재고 조정 시도
    console.log('\n3. 재고 조정 시도...');
    const adjustRes = await axios.post(
      `${baseUrl}/inventory/2025080501/adjust`,
      {
        platform: 'naver',
        quantity: 75,
        adjustType: 'set',
        reason: 'Test fix'
      },
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
    );
    
    console.log('조정 결과:', JSON.stringify(adjustRes.data, null, 2));
    
    // 4. 결과 확인
    console.log('\n4. 최종 재고 확인...');
    const finalRes = await axios.get(
      `${baseUrl}/inventory/2025080501`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    
    console.log('최종 재고:', {
      naver: finalRes.data.data.naverQuantity,
      shopify: finalRes.data.data.shopifyQuantity
    });
    
  } catch (error) {
    console.error('테스트 실패:', error.response?.data || error.message);
  }
}

testNaverInventoryFix().catch(console.error);