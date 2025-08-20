import axios from 'axios';
import bcrypt from 'bcryptjs';

async function checkRealStock() {
  try {
    const clientId = '42g71Rui1jMS5KKHDyDhIO';
    const clientSecret = '$2a$04$dqVeP9xVjJwstJ0Vn7BnBOh8Ft6qTlLdRRAhJJlQUeJFCUv0E8kCG';
    
    // bcrypt 서명 생성
    const timestamp = Date.now();
    const password = `${clientId}_${timestamp}`;
    const hashed = bcrypt.hashSync(password, clientSecret);
    const signature = Buffer.from(hashed).toString('base64');
    
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
    console.log('✅ Got token\n');
    
    // Test Product B 검색
    console.log('🔍 Searching for Test Product B (SKU: 2025080502)');
    const searchResponse = await axios.post(
      'https://api.commerce.naver.com/external/v1/products/search',
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
      console.log('\n📦 Product found in search:');
      console.log('- Name:', product.name);
      console.log('- SKU:', product.sellerManagementCode);
      console.log('- Stock from search:', product.stockQuantity);
      console.log('- Origin Product No:', product.originProductNo);
      console.log('- Channel Product No:', product.channelProductNo);
      
      // v2 API로 원본 상품 조회
      console.log('\n📄 Getting origin product details from v2 API...');
      const originResponse = await axios.get(
        `https://api.commerce.naver.com/external/v2/products/origin-products/${product.originProductNo}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      if (originResponse.data?.originProduct) {
        const originProduct = originResponse.data.originProduct;
        console.log('\n📊 Origin Product Stock:', originProduct.stockQuantity);
        console.log('- Status:', originProduct.statusType);
        console.log('- Sale Price:', originProduct.salePrice);
        
        // 채널 상품 확인
        if (originProduct.channelProducts && originProduct.channelProducts.length > 0) {
          console.log('\n📦 Channel Products:');
          originProduct.channelProducts.forEach((ch, index) => {
            console.log(`  ${index + 1}. Channel ${ch.channelNo}:`);
            console.log('     - Stock:', ch.stockQuantity);
            console.log('     - Status:', ch.statusType);
          });
        }
      }
      
      // v1 API로 채널 상품 직접 조회
      console.log('\n📡 Getting channel product details from v1 API...');
      try {
        const channelResponse = await axios.get(
          `https://api.commerce.naver.com/external/v1/products/channel-products/${product.channelProductNo}`,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        if (channelResponse.data) {
          console.log('\n📊 Channel Product Stock:', channelResponse.data.stockQuantity);
          console.log('- Status:', channelResponse.data.statusType);
        }
      } catch (err) {
        console.log('Could not get channel product:', err.response?.status);
      }
      
      // 다른 SKU 검색해서 비교
      console.log('\n\n🔍 Comparing with Test Product A (SKU: 2025080501)');
      const searchA = await axios.post(
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
      
      if (searchA.data.contents && searchA.data.contents.length > 0) {
        const productA = searchA.data.contents[0];
        console.log('- Product A Stock from search:', productA.stockQuantity);
        
        const originA = await axios.get(
          `https://api.commerce.naver.com/external/v2/products/origin-products/${productA.originProductNo}`,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        if (originA.data?.originProduct) {
          console.log('- Product A Origin Stock:', originA.data.originProduct.stockQuantity);
        }
      }
      
    } else {
      console.log('❌ Product not found');
    }
    
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

checkRealStock();