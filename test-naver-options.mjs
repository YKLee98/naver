import axios from 'axios';

async function testNaverOptionsAPI() {
  try {
    // 네이버 API 설정
    const baseURL = 'https://api.commerce.naver.com/external';
    const clientId = '42g71Rui1jMS5KKHDyDhIO';
    const clientSecret = '$2a$04$dqVeP9xVjJwstJ0Vn7BnBOh8Ft6qTlLdRRAhJJlQUeJFCUv0E8kCG';
    
    // 토큰 가져오기
    const tokenResponse = await axios.post(
      'https://api.commerce.naver.com/external/v1/oauth2/token',
      new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        type: 'SELF'
      }),
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
        stockQuantity: product.stockQuantity
      });
      
      // 1. 옵션 정보 조회 시도
      console.log('\n🔍 Trying to get options for originProductNo:', product.originProductNo);
      
      try {
        const optionResponse = await axios.get(
          `${baseURL}/v1/products/origin-products/${product.originProductNo}/options`,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          }
        );
        console.log('✅ Options retrieved:', optionResponse.data);
      } catch (optionError) {
        console.log('❌ Failed to get options:', {
          status: optionError.response?.status,
          message: optionError.response?.data?.message || optionError.message
        });
      }
      
      // 2. 상품 상세 정보 조회로 옵션 확인
      console.log('\n🔍 Getting product details for originProductNo:', product.originProductNo);
      
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
        console.log('✅ Product details:', {
          hasOptions: detailResponse.data.optionInfo ? true : false,
          options: detailResponse.data.optionInfo || detailResponse.data.options
        });
        
        // 3. 옵션 정보를 사용하여 재고 업데이트 시도
        if (detailResponse.data.optionInfo || detailResponse.data.options) {
          const options = detailResponse.data.optionInfo || detailResponse.data.options;
          console.log('\n📤 Trying to update stock with option info...');
          
          const updateData = {
            optionInfo: Array.isArray(options) ? 
              options.map(opt => ({
                optionManageCode: opt.optionManageCode || opt.manageCode || opt.id,
                stockQuantity: 150
              })) : 
              [{
                optionManageCode: options.optionManageCode || options.manageCode || options.id,
                stockQuantity: 150
              }]
          };
          
          console.log('Update data:', JSON.stringify(updateData, null, 2));
          
          const updateResponse = await axios.put(
            `${baseURL}/v1/products/origin-products/${product.originProductNo}/option-stock`,
            updateData,
            {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              }
            }
          );
          
          console.log('✅ Stock updated successfully!', updateResponse.status);
        } else {
          // 옵션이 없는 경우
          console.log('\n📤 No options found, trying simple update...');
          
          const simpleUpdateData = {
            stockQuantity: 150
          };
          
          const updateResponse = await axios.put(
            `${baseURL}/v1/products/origin-products/${product.originProductNo}/stock`,
            simpleUpdateData,
            {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              }
            }
          );
          
          console.log('✅ Stock updated successfully!', updateResponse.status);
        }
        
      } catch (detailError) {
        console.log('❌ Failed:', {
          status: detailError.response?.status,
          data: detailError.response?.data,
          message: detailError.message
        });
      }
      
    } else {
      console.log('No products found');
    }
    
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

testNaverOptionsAPI();