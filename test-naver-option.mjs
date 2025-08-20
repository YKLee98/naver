import axios from 'axios';
import bcrypt from 'bcryptjs';

async function testNaverOption() {
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
    
    if (searchResponse.data.contents && searchResponse.data.contents.length > 0) {
      const product = searchResponse.data.contents[0];
      const originProductNo = product.originProductNo;
      
      console.log('\n📦 Product info:');
      console.log('- SKU:', product.sellerManagementCode);
      console.log('- Name:', product.name);
      console.log('- originProductNo:', originProductNo);
      console.log('- channelProductNo:', product.channelProductNo);
      console.log('- stockQuantity:', product.stockQuantity);
      console.log('- optionUsable:', product.optionUsable);
      console.log('- stockManageable:', product.stockManageable);
      
      // 옵션 정보 조회
      console.log('\n🔍 Checking options...');
      try {
        const optionsResponse = await axios.get(
          `https://api.commerce.naver.com/external/v1/products/origin-products/${originProductNo}/options`,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        console.log('Options response:', JSON.stringify(optionsResponse.data, null, 2));
        
        if (optionsResponse.data?.options && optionsResponse.data.options.length > 0) {
          console.log('\n✅ Product has options!');
          
          // 옵션 재고 업데이트 테스트
          const options = optionsResponse.data.options;
          const updateData = {
            optionInfo: options.map(opt => ({
              optionManageCode: opt.optionManageCode || opt.manageCode || opt.id,
              stockQuantity: 100
            }))
          };
          
          console.log('\n📤 Updating option stock:', JSON.stringify(updateData, null, 2));
          
          const updateResponse = await axios.put(
            `https://api.commerce.naver.com/external/v1/products/origin-products/${originProductNo}/option-stock`,
            updateData,
            {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              }
            }
          );
          
          console.log('\n✅ Update response:', updateResponse.status, updateResponse.data);
        } else {
          console.log('\n❌ No options found');
          
          // 단일 상품으로 재고 업데이트 시도
          console.log('\n📤 Trying single product stock update...');
          
          const updateData = {
            originProduct: {
              stockQuantity: 100
            }
          };
          
          const updateResponse = await axios.put(
            `https://api.commerce.naver.com/external/v2/products/origin-products/${originProductNo}`,
            updateData,
            {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              }
            }
          );
          
          console.log('✅ Update response:', updateResponse.status, updateResponse.data);
        }
      } catch (error) {
        console.error('Options API error:', error.response?.status, error.response?.data);
      }
    }
    
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

testNaverOption();