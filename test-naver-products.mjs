import axios from 'axios';

async function testNaverProducts() {
  const baseUrl = 'http://localhost:3000/api/v1';
  const token = 'test-token';
  
  try {
    console.log('=== 네이버 상품 조회 테스트 ===\n');
    
    // SKU로 상품 검색
    const sku = '2025080501';
    console.log(`검색 중: ${sku}...\n`);
    
    const response = await axios.get(
      `${baseUrl}/mappings/search-by-sku?sku=${sku}`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );
    
    if (response.data?.data?.naver?.products?.length > 0) {
      const products = response.data.data.naver.products;
      console.log(`찾은 상품 수: ${products.length}\n`);
      
      products.forEach((product, index) => {
        console.log(`상품 ${index + 1}:`);
        console.log(`  - 이름: ${product.name}`);
        console.log(`  - SKU: ${product.sellerManagementCode}`);
        console.log(`  - 재고: ${product.stockQuantity}`);
        console.log(`  - channelProductNo: ${product.channelProductNo}`);
        console.log(`  - originProductNo: ${product.originProductNo}`);
        console.log(`  - productNo: ${product.productNo}`);
        console.log(`  - id: ${product.id}`);
        console.log(`  - channelProducts:`, product.channelProducts);
        console.log('');
      });
      
      // 정확히 일치하는 상품 찾기
      const exactMatch = products.find(p => p.sellerManagementCode === sku);
      if (exactMatch) {
        console.log('정확히 일치하는 상품:');
        console.log(`  - originProductNo: ${exactMatch.originProductNo}`);
        console.log(`  - channelProductNo: ${exactMatch.channelProductNo}`);
        console.log(`  - productNo: ${exactMatch.productNo}`);
        console.log(`  - 재고: ${exactMatch.stockQuantity}`);
      }
    } else {
      console.log('상품을 찾을 수 없습니다.');
    }
    
  } catch (error) {
    console.error('테스트 실패:', error.response?.data || error.message);
  }
}

testNaverProducts().catch(console.error);