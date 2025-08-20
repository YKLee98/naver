import axios from 'axios';
import crypto from 'crypto';

async function testDirectAPI() {
  try {
    // 네이버 API 설정 - 백엔드와 동일한 설정 사용
    const clientId = '42g71Rui1jMS5KKHDyDhIO';
    const clientSecret = '$2a$04$dqVeP9xVjJwstJ0Vn7BnBOh8Ft6qTlLdRRAhJJlQUeJFCUv0E8kCG';
    
    // 토큰 가져오기 - HMAC 서명 사용
    console.log('Getting token...');
    const timestamp = Date.now();
    const message = `${clientId}_${timestamp}`;
    const signature = crypto.createHmac('sha256', clientSecret)
      .update(message)
      .digest('base64');
    
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
      console.log('\n📦 Product found:', {
        originProductNo: product.originProductNo,
        channelProductNo: product.channelProductNo,
        stockQuantity: product.stockQuantity,
        name: product.name
      });
      
      // 먼저 옵션 정보 확인
      console.log('\n🔍 Checking product options...');
      try {
        const optionsResponse = await axios.get(
          `https://api.commerce.naver.com/external/v1/products/origin-products/${product.originProductNo}/options`,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        if (optionsResponse.data?.options && optionsResponse.data.options.length > 0) {
          console.log('✅ Product has options:', optionsResponse.data.options);
          
          // 옵션이 있는 경우 - 옵션별로 재고 업데이트
          const optionUpdateData = {
            optionInfo: optionsResponse.data.options.map(opt => ({
              optionManageCode: opt.optionManageCode || opt.manageCode,
              stockQuantity: 150
            }))
          };
          
          console.log('\n📤 Updating option stock:', JSON.stringify(optionUpdateData, null, 2));
          
          const updateResponse = await axios.put(
            `https://api.commerce.naver.com/external/v1/products/origin-products/${product.originProductNo}/option-stock`,
            optionUpdateData,
            {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              }
            }
          );
          
          console.log('✅ Option stock update response:', updateResponse.status);
          
        } else {
          console.log('❌ Product has no options or options API failed');
          
          // 단일 상품으로 처리
          console.log('\n📤 Trying single product update...');
          const updateResponse = await axios.put(
            `https://api.commerce.naver.com/external/v2/products/origin-products/${product.originProductNo}`,
            {
              originProduct: {
                stockQuantity: 150
              }
            },
            {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              }
            }
          );
          
          console.log('✅ Single product update response:', updateResponse.status);
        }
        
      } catch (optionError) {
        console.log('❌ Option check/update failed:', {
          status: optionError.response?.status,
          message: optionError.response?.data?.message || optionError.message,
          data: optionError.response?.data
        });
      }
      
      // 재고 확인
      console.log('\n🔍 Verifying stock update...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const verifyResponse = await axios.post(
        'https://api.commerce.naver.com/external/v1/products/search',
        {
          searchKeyword: '2025080501',
          searchType: 'SELLER_MANAGEMENT_CODE'
        },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      if (verifyResponse.data.contents?.length > 0) {
        const updatedProduct = verifyResponse.data.contents[0];
        console.log('\n📦 Updated product stock:', {
          sku: updatedProduct.sellerManagementCode,
          stockQuantity: updatedProduct.stockQuantity,
          name: updatedProduct.name
        });
        
        if (updatedProduct.stockQuantity === 150) {
          console.log('✅ SUCCESS! Stock was updated to 150');
        } else {
          console.log(`⚠️ Stock is still ${updatedProduct.stockQuantity}, not 150`);
        }
      }
      
      for (const testCase of testCases) {
        console.log(`\n📤 Testing: ${testCase.name}`);
        console.log('Request data:', JSON.stringify(testCase.data, null, 2));
        
        try {
          const response = await axios.put(
            `https://api.commerce.naver.com/external/v1/products/origin-products/${product.originProductNo}/option-stock`,
            testCase.data,
            {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              }
            }
          );
          
          console.log(`✅ SUCCESS with ${testCase.name}!`);
          console.log('Response status:', response.status);
          
          // 재고 확인
          await new Promise(resolve => setTimeout(resolve, 1000));
          const checkResponse = await axios.post(
            'https://api.commerce.naver.com/external/v1/products/search',
            {
              searchKeyword: '2025080501',
              searchType: 'SELLER_MANAGEMENT_CODE'
            },
            {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              }
            }
          );
          
          if (checkResponse.data.contents?.length > 0) {
            console.log('New stock:', checkResponse.data.contents[0].stockQuantity);
          }
          
          break; // 성공하면 종료
          
        } catch (error) {
          console.log(`❌ Failed with ${testCase.name}:`, {
            status: error.response?.status,
            message: error.response?.data?.message,
            invalidInputs: error.response?.data?.invalidInputs
          });
        }
      }
    }
    
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

testDirectAPI();