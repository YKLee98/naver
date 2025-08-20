const axios = require('axios');

async function testOptionStockAPI() {
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
      
      // 재고 업데이트 테스트 - option-stock 엔드포인트
      console.log('\n🔄 Testing option-stock API with originProductNo:', product.originProductNo);
      
      const testFormats = [
        // 1. 단순 형식
        {
          name: 'Simple format',
          data: {
            stockQuantity: 150
          }
        },
        // 2. useStockManagement 포함
        {
          name: 'With useStockManagement',
          data: {
            stockQuantity: 150,
            useStockManagement: true
          }
        },
        // 3. displayStatus 포함
        {
          name: 'With displayStatus',
          data: {
            stockQuantity: 150,
            useStockManagement: true,
            displayStatus: 'ON_SALE'
          }
        },
        // 4. options 배열 형식
        {
          name: 'Options array format',
          data: {
            options: [
              {
                stockQuantity: 150
              }
            ]
          }
        },
        // 5. originProduct wrapper
        {
          name: 'With originProduct wrapper',
          data: {
            originProduct: {
              stockQuantity: 150
            }
          }
        },
        // 6. optionStock wrapper
        {
          name: 'With optionStock wrapper',
          data: {
            optionStock: {
              stockQuantity: 150
            }
          }
        },
        // 7. 복합 형식
        {
          name: 'Complex format',
          data: {
            stockQuantity: 150,
            useStockManagement: true,
            displayStatus: 'ON_SALE',
            statusType: 'SALE'
          }
        }
      ];
      
      for (const format of testFormats) {
        console.log(`\n📤 Testing: ${format.name}`);
        console.log('Data:', JSON.stringify(format.data, null, 2));
        
        try {
          const response = await axios.put(
            `${baseURL}/v1/products/origin-products/${product.originProductNo}/option-stock`,
            format.data,
            {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              }
            }
          );
          console.log(`✅ SUCCESS with ${format.name}! Status: ${response.status}`);
          
          // 재고 확인
          await new Promise(resolve => setTimeout(resolve, 1000));
          const checkResponse = await axios.post(
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
          
          if (checkResponse.data.contents && checkResponse.data.contents.length > 0) {
            const updatedProduct = checkResponse.data.contents[0];
            console.log(`📊 New stock quantity: ${updatedProduct.stockQuantity}`);
          }
          
          // 성공하면 종료
          console.log('\n🎉 Found working format!');
          break;
          
        } catch (error) {
          console.log(`❌ Failed with ${format.name}:`, {
            status: error.response?.status,
            code: error.response?.data?.code,
            message: error.response?.data?.message || error.message
          });
        }
      }
      
    } else {
      console.log('No products found');
    }
    
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

testOptionStockAPI();