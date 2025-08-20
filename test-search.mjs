import axios from 'axios';

async function testNaverSearch() {
  try {
    // 백엔드 API를 통해 토큰 가져오기
    const tokenResponse = await axios.post(
      'http://localhost:3000/api/v1/auth/token',
      {},
      { headers: { 'Content-Type': 'application/json' } }
    );
    
    const token = tokenResponse.data.token;
    console.log('✅ Got token from backend');
    
    // 네이버 API로 직접 검색
    const searchResponse = await axios.post(
      'https://api.commerce.naver.com/external/v1/products/search',
      {
        searchKeyword: '2025080501',
        searchType: 'SELLER_MANAGEMENT_CODE',
        page: 1,
        size: 10
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('\n📦 Search results:');
    console.log('Total found:', searchResponse.data.totalElements);
    
    if (searchResponse.data.contents && searchResponse.data.contents.length > 0) {
      searchResponse.data.contents.forEach((product, index) => {
        console.log(`\n--- Product ${index + 1} ---`);
        console.log('Name:', product.name);
        console.log('SKU (sellerManagementCode):', product.sellerManagementCode);
        console.log('channelProductNo:', product.channelProductNo);
        console.log('originProductNo:', product.originProductNo);
        console.log('stockQuantity:', product.stockQuantity);
        console.log('statusType:', product.statusType);
      });
    } else {
      console.log('❌ No products found with SKU 2025080501');
      
      // 다른 검색 시도
      console.log('\n🔍 Trying broader search...');
      const allProductsResponse = await axios.post(
        'https://api.commerce.naver.com/external/v1/products/search',
        {
          page: 1,
          size: 50
        },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      console.log('Total products in store:', allProductsResponse.data.totalElements);
      
      if (allProductsResponse.data.contents) {
        console.log('\nAll SKUs in store:');
        allProductsResponse.data.contents.forEach(product => {
          if (product.sellerManagementCode) {
            console.log(`- ${product.sellerManagementCode}: ${product.name}`);
          }
        });
      }
    }
    
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

testNaverSearch();