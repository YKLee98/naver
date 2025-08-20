import axios from 'axios';

async function checkNaverStock() {
  try {
    const baseURL = 'https://api.commerce.naver.com/external';
    
    // 백엔드에서 사용하는 것과 동일한 토큰 가져오기
    const tokenResponse = await axios.post(
      'http://localhost:3000/api/v1/auth/token',
      {},
      { headers: { 'Content-Type': 'application/json' } }
    ).catch(() => null);
    
    let token;
    if (tokenResponse && tokenResponse.data.token) {
      token = tokenResponse.data.token;
    } else {
      // 직접 토큰 발급
      const authResponse = await axios.post(
        `${baseURL}/v1/oauth2/token`,
        new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: '42g71Rui1jMS5KKHDyDhIO',
          client_secret: '$2a$04$dqVeP9xVjJwstJ0Vn7BnBOh8Ft6qTlLdRRAhJJlQUeJFCUv0E8kCG',
          type: 'SELF'
        }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );
      token = authResponse.data.access_token;
    }
    
    console.log('✅ Got token');
    
    // SKU로 상품 검색
    const searchResponse = await axios.post(
      `${baseURL}/v1/products/search`,
      {
        searchKeyword: '2025080502',
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
    
    if (searchResponse.data.contents && searchResponse.data.contents.length > 0) {
      const product = searchResponse.data.contents[0];
      console.log('\n📦 Current Naver Product Status:');
      console.log('- originProductNo:', product.originProductNo);
      console.log('- channelProductNo:', product.channelProductNo);
      console.log('- SKU:', product.sellerManagementCode);
      console.log('- Current Stock:', product.stockQuantity);
      console.log('- Status:', product.statusType);
      console.log('- Name:', product.name);
      
      // 상세 정보 조회
      try {
        const detailResponse = await axios.get(
          `${baseURL}/v2/products/origin-products/${product.originProductNo}`,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        console.log('\n📋 Product Detail:');
        console.log('- Has Options:', detailResponse.data.optionInfo ? 'Yes' : 'No');
        if (detailResponse.data.optionInfo) {
          console.log('- Option Info:', JSON.stringify(detailResponse.data.optionInfo, null, 2));
        }
        console.log('- Stock Quantity from Detail:', detailResponse.data.stockQuantity);
      } catch (err) {
        console.log('Could not get product detail:', err.response?.status);
      }
    } else {
      console.log('No products found for SKU 2025080502');
    }
    
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

checkNaverStock();