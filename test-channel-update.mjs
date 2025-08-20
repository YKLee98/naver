import axios from 'axios';
import bcrypt from 'bcryptjs';

async function testChannelUpdate() {
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
    console.log('✅ Got token');
    
    // SKU로 상품 검색
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
      const channelProductNo = product.channelProductNo;
      const originProductNo = product.originProductNo;
      
      console.log('\n📦 Product info:');
      console.log('- SKU:', product.sellerManagementCode);
      console.log('- Name:', product.name);
      console.log('- originProductNo:', originProductNo);
      console.log('- channelProductNo:', channelProductNo);
      console.log('- Current stockQuantity:', product.stockQuantity);
      console.log('- statusType:', product.statusType);
      
      // 채널 상품 업데이트 시도
      console.log('\n📤 Trying channel product update...');
      
      try {
        // v1 채널 상품 재고 업데이트
        const channelUpdateData = {
          stockQuantity: 150
        };
        
        console.log('Update data:', channelUpdateData);
        
        const channelResponse = await axios.patch(
          `https://api.commerce.naver.com/external/v1/products/channel-products/${channelProductNo}`,
          channelUpdateData,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        console.log('\n✅ Channel update response:');
        console.log('- Status:', channelResponse.status);
        console.log('- Data:', JSON.stringify(channelResponse.data, null, 2));
        
      } catch (channelError) {
        console.error('❌ Channel update error:', channelError.response?.status, channelError.response?.data);
        
        // v2 채널 상품 시도
        console.log('\n📤 Trying v2 channel product update...');
        try {
          const v2ChannelResponse = await axios.put(
            `https://api.commerce.naver.com/external/v2/products/channel-products/${channelProductNo}`,
            {
              channelProduct: {
                stockQuantity: 150,
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
          
          console.log('\n✅ V2 Channel update response:');
          console.log('- Status:', v2ChannelResponse.status);
          console.log('- Data:', JSON.stringify(v2ChannelResponse.data, null, 2));
        } catch (v2Error) {
          console.error('❌ V2 Channel update error:', v2Error.response?.status, v2Error.response?.data);
        }
      }
      
      // 잠시 대기 후 재고 확인
      console.log('\n⏳ Waiting 5 seconds before verification...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // 재고 재확인
      const verifyResponse = await axios.post(
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
      
      if (verifyResponse.data.contents && verifyResponse.data.contents.length > 0) {
        const verifiedProduct = verifyResponse.data.contents[0];
        console.log('\n🔍 Verification result:');
        console.log('- Updated stockQuantity:', verifiedProduct.stockQuantity);
        console.log('- Expected:', 150);
        console.log('- Success:', verifiedProduct.stockQuantity === 150 ? '✅ YES' : '❌ NO');
      }
    }
    
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

testChannelUpdate();