import axios from 'axios';
import bcrypt from 'bcryptjs';

async function testDirectNaverAPI() {
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
      const originProductNo = product.originProductNo;
      
      console.log('\n📦 Product info:');
      console.log('- SKU:', product.sellerManagementCode);
      console.log('- Name:', product.name);
      console.log('- originProductNo:', originProductNo);
      console.log('- channelProductNo:', product.channelProductNo);
      console.log('- stockQuantity:', product.stockQuantity);
      console.log('- statusType:', product.statusType);
      
      // v2 API로 전체 상품 정보 가져오기
      console.log('\n🔍 Getting full product info from v2 API...');
      const fullProductResponse = await axios.get(
        `https://api.commerce.naver.com/external/v2/products/origin-products/${originProductNo}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      const fullProduct = fullProductResponse.data?.originProduct;
      
      if (fullProduct) {
        console.log('\n📋 Full product data:');
        console.log('- Current stockQuantity:', fullProduct.stockQuantity);
        console.log('- statusType:', fullProduct.statusType);
        console.log('- salePrice:', fullProduct.salePrice);
        console.log('- hasDetailAttribute:', !!fullProduct.detailAttribute);
        
        // 기존 detailAttribute 확인
        const detailAttribute = fullProduct.detailAttribute || {};
        console.log('\n📝 Existing detailAttribute fields:');
        console.log('- afterServiceInfo:', !!detailAttribute.afterServiceInfo);
        console.log('- originAreaInfo:', !!detailAttribute.originAreaInfo);
        console.log('- minorPurchasable:', detailAttribute.minorPurchasable);
        console.log('- smartstoreChannelProduct:', !!detailAttribute.smartstoreChannelProduct);
        console.log('- naverShoppingRegistration:', detailAttribute.naverShoppingRegistration);
        console.log('- channelNo:', detailAttribute.channelNo);
        
        // 업데이트 데이터 준비
        const updateData = {
          originProduct: {
            // 필수 필드들
            name: fullProduct.name,
            salePrice: fullProduct.salePrice,
            images: fullProduct.images || [],
            
            // 재고 업데이트
            stockQuantity: 150,
            statusType: 'SALE',
            
            // detailAttribute는 기존 값 유지하면서 필수 필드만 보장
            detailAttribute: {
              ...detailAttribute,
              afterServiceInfo: detailAttribute.afterServiceInfo || {
                afterServiceTelephoneNumber: '02-1234-5678',
                afterServiceGuideContent: '고객센터로 문의 바랍니다.'
              },
              originAreaInfo: detailAttribute.originAreaInfo || {
                originAreaCode: '00',
                content: '상세페이지 참조',
                plural: false
              },
              minorPurchasable: detailAttribute.minorPurchasable !== undefined 
                ? detailAttribute.minorPurchasable 
                : true,
              smartstoreChannelProduct: detailAttribute.smartstoreChannelProduct || {
                channelProductDisplayStatusType: 'ON'
              },
              naverShoppingRegistration: detailAttribute.naverShoppingRegistration !== undefined
                ? detailAttribute.naverShoppingRegistration
                : true,
              channelNo: detailAttribute.channelNo || 1
            }
          }
        };
        
        console.log('\n📤 Sending update request...');
        console.log('Update data:', JSON.stringify(updateData, null, 2));
        
        try {
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
          
          console.log('\n✅ Update response:');
          console.log('- Status:', updateResponse.status);
          console.log('- StatusText:', updateResponse.statusText);
          console.log('- Response data:', JSON.stringify(updateResponse.data, null, 2));
          
          // 잠시 대기 후 재고 확인
          console.log('\n⏳ Waiting 5 seconds before verification...');
          await new Promise(resolve => setTimeout(resolve, 5000));
          
          // 재고 재확인
          const verifyResponse = await axios.get(
            `https://api.commerce.naver.com/external/v2/products/origin-products/${originProductNo}`,
            {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              }
            }
          );
          
          const verifiedStock = verifyResponse.data?.originProduct?.stockQuantity;
          console.log('\n🔍 Verification result:');
          console.log('- Updated stockQuantity:', verifiedStock);
          console.log('- Expected:', 150);
          console.log('- Success:', verifiedStock === 150 ? '✅ YES' : '❌ NO');
          
        } catch (updateError) {
          console.error('\n❌ Update error:', updateError.response?.status, updateError.response?.data);
        }
      }
    }
    
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

testDirectNaverAPI();