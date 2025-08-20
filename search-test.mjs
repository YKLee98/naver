import axios from 'axios';
import crypto from 'crypto';

async function searchNaverProducts() {
  try {
    const clientId = '42g71Rui1jMS5KKHDyDhIO';
    const clientSecret = '$2a$04$dqVeP9xVjJwstJ0Vn7BnBOh8Ft6qTlLdRRAhJJlQUeJFCUv0E8kCG';
    
    // HMAC 서명 생성
    const timestamp = Date.now();
    const message = `${clientId}_${timestamp}`;
    const signature = crypto.createHmac('sha256', clientSecret)
      .update(message)
      .digest('base64');
    
    // 토큰 가져오기
    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      timestamp: timestamp.toString(),
      client_secret_sign: signature,
      type: 'SELF'
    });
    
    const tokenResponse = await axios.post(
      'https://api.commerce.naver.com/external/v1/oauth2/token',
      params.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    
    const token = tokenResponse.data.access_token;
    console.log('✅ Got token');
    
    // 2025080501로 검색
    console.log('\n🔍 Searching for SKU 2025080501...');
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
    
    console.log('Total found:', searchResponse.data.totalElements);
    
    if (searchResponse.data.contents && searchResponse.data.contents.length > 0) {
      const product = searchResponse.data.contents[0];
      console.log('\n✅ Product found!');
      console.log('- Name:', product.name);
      console.log('- SKU:', product.sellerManagementCode);
      console.log('- channelProductNo:', product.channelProductNo);
      console.log('- originProductNo:', product.originProductNo);
      console.log('- Stock:', product.stockQuantity);
    } else {
      console.log('❌ No products found with SKU 2025080501');
      
      // 전체 상품 조회
      console.log('\n📦 Fetching all products...');
      const allResponse = await axios.post(
        'https://api.commerce.naver.com/external/v1/products/search',
        {
          page: 1,
          size: 100
        },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      console.log('Total products:', allResponse.data.totalElements);
      
      if (allResponse.data.contents) {
        console.log('\nProducts with SKU:');
        allResponse.data.contents.forEach(p => {
          if (p.sellerManagementCode) {
            console.log(`- SKU: ${p.sellerManagementCode}, Name: ${p.name}`);
          }
        });
        
        // Test Product A 찾기
        const testProduct = allResponse.data.contents.find(p => 
          p.name && p.name.includes('Test Product A')
        );
        
        if (testProduct) {
          console.log('\n📌 Found Test Product A:');
          console.log('- Name:', testProduct.name);
          console.log('- SKU:', testProduct.sellerManagementCode);
          console.log('- channelProductNo:', testProduct.channelProductNo);
          console.log('- originProductNo:', testProduct.originProductNo);
        }
      }
    }
    
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

searchNaverProducts();