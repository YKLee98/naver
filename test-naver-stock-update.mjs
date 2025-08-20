import axios from 'axios';

// 네이버 재고 업데이트 테스트
async function testNaverStockUpdate() {
  const token = 'test-token';
  const baseUrl = 'http://localhost:3000/api/v1';
  
  try {
    console.log('=== 네이버 재고 업데이트 테스트 ===\n');
    
    // 1. 현재 재고 확인
    console.log('1. 현재 재고 확인...');
    const inventoryRes = await axios.get(`${baseUrl}/inventory`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    const products = inventoryRes.data.data;
    console.log('현재 재고 상태:');
    products.forEach(p => {
      console.log(`  - ${p.sku}: Naver=${p.naverStock}, Shopify=${p.shopifyStock}`);
    });
    
    // 2. 재고 조정 시도 (2025080501 상품)
    const sku = '2025080501';
    const newQuantity = 50;
    
    console.log(`\n2. ${sku} 재고를 ${newQuantity}개로 조정 시도...`);
    
    const adjustRes = await axios.post(
      `${baseUrl}/inventory/${sku}/adjust`,
      {
        platform: 'naver',
        quantity: newQuantity,
        reason: 'Test adjustment'
      },
      {
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('재고 조정 응답:', adjustRes.data);
    
    // 3. 동기화 시도
    console.log('\n3. 재고 동기화 시도...');
    const syncRes = await axios.post(
      `${baseUrl}/inventory/sync/${sku}`,
      {},
      {
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('동기화 응답:', syncRes.data);
    
    // 4. 결과 확인
    console.log('\n4. 업데이트된 재고 확인...');
    const finalRes = await axios.get(`${baseUrl}/inventory/${sku}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    console.log('최종 재고:', finalRes.data);
    
  } catch (error) {
    console.error('테스트 실패:', error.response?.data || error.message);
  }
}

// 직접 네이버 API 호출 테스트
async function directNaverApiTest() {
  console.log('\n=== 직접 네이버 API 재고 업데이트 테스트 ===\n');
  
  try {
    // 매핑 검색으로 네이버 상품 정보 가져오기
    const searchRes = await axios.get(
      'http://localhost:3000/api/v1/mappings/search-by-sku?sku=2025080501',
      {
        headers: { Authorization: 'Bearer test-token' }
      }
    );
    
    const naverProducts = searchRes.data.data.naver.products;
    if (naverProducts && naverProducts.length > 0) {
      const product = naverProducts.find(p => p.id === 12205978733);
      console.log('네이버 상품 정보:');
      console.log(`  - ID: ${product.id}`);
      console.log(`  - 이름: ${product.name}`);
      console.log(`  - 현재 재고: ${product.stockQuantity}`);
      console.log(`  - 상태: ${product.status}`);
    }
    
  } catch (error) {
    console.error('직접 API 테스트 실패:', error.message);
  }
}

// 실행
async function main() {
  await testNaverStockUpdate();
  await directNaverApiTest();
}

main().catch(console.error);