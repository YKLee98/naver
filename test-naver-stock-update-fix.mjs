import axios from 'axios';
import bcrypt from 'bcryptjs';

async function getNaverToken() {
  const clientId = '42g71Rui1jMS5KKHDyDhIO';
  const clientSecret = '$2a$04$dqVRQvyZ./Bu0m4BDZh6eu';
  
  const timestamp = Date.now();
  const password = `${clientId}_${timestamp}`;
  const hashedPassword = bcrypt.hashSync(password, clientSecret);
  const signature = Buffer.from(hashedPassword).toString('base64');
  
  const params = new URLSearchParams({
    client_id: clientId,
    timestamp: timestamp.toString(),
    client_secret_sign: signature,
    grant_type: 'client_credentials',
    type: 'SELF'
  });
  
  const tokenResponse = await axios.post(
    'https://api.commerce.naver.com/external/v1/oauth2/token',
    params.toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      }
    }
  );
  
  return tokenResponse.data.access_token;
}

async function testUpdateStock() {
  try {
    console.log('=== 네이버 재고 업데이트 수정 테스트 ===\n');
    
    const accessToken = await getNaverToken();
    console.log('✅ 토큰 획득 성공\n');
    
    // 하드코딩된 originProductNo 사용 (실제 값)
    const originProductNo = '12150233672'; // EPR 테스트용 상품 A
    const newQuantity = 50;
    
    console.log(`📦 상품 정보:`);
    console.log(`- originProductNo: ${originProductNo}`);
    console.log(`- 목표 재고: ${newQuantity}\n`);
    
    // 1. 먼저 현재 상품 정보 조회
    console.log('📋 현재 상품 정보 조회 중...');
    const currentResponse = await axios.get(
      `https://api.commerce.naver.com/external/v2/products/origin-products/${originProductNo}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const currentProduct = currentResponse.data.originProduct;
    console.log(`✅ 현재 재고: ${currentProduct.stockQuantity}`);
    console.log(`✅ 현재 상태: ${currentProduct.statusType}\n`);
    
    // 2. 다양한 statusType 값 테스트
    const statusTypes = ['SALE', 'ON_SALE', 'ONSALE'];
    
    for (const statusType of statusTypes) {
      console.log(`\n🔄 statusType "${statusType}"로 시도...`);
      
      const updateData = {
        originProduct: {
          stockQuantity: newQuantity,
          statusType: statusType
        }
      };
      
      try {
        const updateResponse = await axios.put(
          `https://api.commerce.naver.com/external/v2/products/origin-products/${originProductNo}`,
          updateData,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        console.log(`✅ 성공! statusType "${statusType}" 작동함`);
        console.log(`응답 상태: ${updateResponse.status}`);
        
        // 검증
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const verifyResponse = await axios.get(
          `https://api.commerce.naver.com/external/v2/products/origin-products/${originProductNo}`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        const updatedProduct = verifyResponse.data.originProduct;
        console.log(`📊 업데이트 결과:`);
        console.log(`- 새로운 재고: ${updatedProduct.stockQuantity}`);
        console.log(`- 새로운 상태: ${updatedProduct.statusType}`);
        
        if (updatedProduct.stockQuantity === newQuantity) {
          console.log(`\n🎉 재고가 성공적으로 ${newQuantity}개로 업데이트되었습니다!`);
          console.log(`✅ 올바른 statusType: "${statusType}"`);
          return;
        }
        
      } catch (error) {
        console.log(`❌ 실패: ${error.response?.data?.message || error.message}`);
        if (error.response?.data?.invalidInputs) {
          error.response.data.invalidInputs.forEach(input => {
            console.log(`   - ${input.name}: ${input.message}`);
          });
        }
      }
    }
    
    // 3. 전체 필드 포함 시도
    console.log('\n🔄 전체 필드를 포함하여 시도...');
    
    const fullUpdateData = {
      originProduct: {
        name: currentProduct.name,
        salePrice: currentProduct.salePrice,
        stockQuantity: newQuantity,
        statusType: currentProduct.statusType, // 기존 값 사용
        detailAttribute: currentProduct.detailAttribute
      }
    };
    
    try {
      const fullUpdateResponse = await axios.put(
        `https://api.commerce.naver.com/external/v2/products/origin-products/${originProductNo}`,
        fullUpdateData,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      console.log(`✅ 전체 필드 업데이트 성공!`);
      console.log(`응답 상태: ${fullUpdateResponse.status}`);
      
    } catch (error) {
      console.log(`❌ 전체 필드 업데이트 실패: ${error.response?.data?.message || error.message}`);
    }
    
  } catch (error) {
    console.error('테스트 실패:', error.message);
  }
}

testUpdateStock().catch(console.error);