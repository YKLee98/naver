const axios = require('axios');

async function testNaverAPI() {
  try {
    // 네이버 API 설정
    const baseURL = 'https://api.commerce.naver.com/external';
    const clientId = '42g71Rui1jMS5KKHDyDhIO';
    const clientSecret = '$2a$04$dqVeP9xVjJwstJ0Vn7BnBOh8Ft6qTlLdRRAhJJlQUeJFCUv0E8kCG';
    
    // 토큰 가져오기
    const tokenResponse = await axios.post(
      'https://api.commerce.naver.com/external/v1/oauth2/token',
      `grant_type=client_credentials&client_id=${clientId}&client_secret=${encodeURIComponent(clientSecret)}&type=SELF`,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    
    const token = tokenResponse.data.access_token;
    console.log('✅ Got token:', token.substring(0, 20) + '...');
    
    // SKU로 상품 검색
    const searchResponse = await axios.post(
      `${baseURL}/v1/products/search`,
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
    if (searchResponse.data.contents && searchResponse.data.contents.length > 0) {
      const product = searchResponse.data.contents[0];
      console.log('Product found:', {
        originProductNo: product.originProductNo,
        channelProductNo: product.channelProductNo,
        name: product.name,
        stockQuantity: product.stockQuantity,
        sellerManagementCode: product.sellerManagementCode,
        statusType: product.statusType
      });
      
      // 재고 업데이트 테스트
      console.log('\n🔄 Testing stock update...');
      
      // originProduct API 테스트
      try {
        const updateResponse = await axios.put(
          `${baseURL}/v2/products/origin-products/${product.originProductNo}`,
          {
            originProduct: {
              stockQuantity: 100,
              statusType: 'SALE'
            }
          },
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          }
        );
        console.log('✅ Update successful!', updateResponse.status);
      } catch (error) {
        console.log('❌ Update failed:', error.response?.data || error.message);
        
        // 다른 형식 시도
        console.log('\n🔄 Trying different format...');
        try {
          const updateResponse2 = await axios.put(
            `${baseURL}/v2/products/origin-products/${product.originProductNo}`,
            {
              stockQuantity: 100,
              statusType: 'SALE'
            },
            {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              }
            }
          );
          console.log('✅ Update successful with different format!', updateResponse2.status);
        } catch (error2) {
          console.log('❌ Alternative format also failed:', error2.response?.data || error2.message);
        }
      }
    } else {
      console.log('No products found');
    }
    
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

testNaverAPI();