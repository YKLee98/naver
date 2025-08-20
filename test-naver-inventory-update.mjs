import axios from 'axios';

async function testNaverInventoryUpdate() {
  const baseUrl = 'http://localhost:3000/api/v1';
  const token = 'test-token';
  
  try {
    console.log('=== 네이버 재고 업데이트 테스트 ===\n');
    
    // 1. 현재 재고 확인
    console.log('1. 현재 재고 상태...');
    const inventoryRes = await axios.get(`${baseUrl}/inventory`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    const products = inventoryRes.data.data;
    products.forEach(p => {
      console.log(`${p.sku}: Naver=${p.naverStock}, Shopify=${p.shopifyStock}`);
    });
    
    // 2. 네이버 상품 정보 확인
    console.log('\n2. 네이버 상품 정보 확인...');
    const sku = '2025080501';
    const searchRes = await axios.get(
      `${baseUrl}/mappings/search-by-sku?sku=${sku}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    
    const naverProducts = searchRes.data.data.naver.products;
    const targetProduct = naverProducts.find(p => p.id === 12205978733);
    
    if (targetProduct) {
      console.log('찾은 상품:');
      console.log(`  - 이름: ${targetProduct.name}`);
      console.log(`  - ID: ${targetProduct.id}`);
      console.log(`  - 현재 재고: ${targetProduct.stockQuantity || targetProduct.stock}`);
      console.log(`  - originProductNo: ${targetProduct.originProductNo}`);
      console.log(`  - channelProductNo: ${targetProduct.channelProductNo}`);
    }
    
    // 3. 재고 조정 시도
    console.log('\n3. 네이버 재고 조정 시도 (75개로)...');
    const adjustRes = await axios.post(
      `${baseUrl}/inventory/${sku}/adjust`,
      {
        platform: 'naver',
        quantity: 75,
        adjustType: 'set',
        reason: 'Test adjustment'
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('\n조정 결과:');
    console.log('- Success:', adjustRes.data.success);
    console.log('- Previous:', adjustRes.data.data.previous);
    console.log('- Current:', adjustRes.data.data.current);
    console.log('- Update Result:', adjustRes.data.data.updateResults.naver);
    
    // 4. 최종 재고 확인
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log('\n4. 최종 재고 확인...');
    const finalRes = await axios.get(`${baseUrl}/inventory/${sku}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    console.log(`최종 네이버 재고: ${finalRes.data.data.naverQuantity}`);
    
  } catch (error) {
    console.error('테스트 실패:', error.response?.data || error.message);
  }
}

testNaverInventoryUpdate().catch(console.error);