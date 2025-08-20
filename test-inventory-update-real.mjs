import axios from 'axios';
import bcrypt from 'bcryptjs';

async function getNaverToken() {
  const clientId = '42g71Rui1jMS5KKHDyDhIO';
  const clientSecret = '$2a$04$dqVRQvyZ./Bu0m4BDZh6eu';
  
  const timestamp = Date.now();
  const password = `${clientId}_${timestamp}`;
  const hashedPassword = bcrypt.hashSync(password, clientSecret);
  const signature = Buffer.from(hashedPassword).toString('base64');
  
  try {
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
  } catch (error) {
    console.error('Token 획득 실패:', error.response?.data || error.message);
    throw error;
  }
}

async function searchAndUpdateStock() {
  try {
    console.log('=== 네이버 재고 업데이트 실제 테스트 ===\n');
    
    const accessToken = await getNaverToken();
    console.log('✅ 토큰 획득 성공\n');
    
    // 1. 먼저 모든 상품 검색하여 구조 파악
    console.log('📦 전체 상품 검색 중...');
    const searchResponse = await axios.post(
      'https://api.commerce.naver.com/external/v1/products/search',
      {
        searchKeyword: '',
        page: 1,
        size: 100
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log(`검색 결과: ${searchResponse.data.contents?.length || 0}개 상품\n`);
    
    // 2. EPR 테스트 상품 찾기
    let targetProduct = null;
    let targetOriginProductNo = null;
    
    for (const product of searchResponse.data.contents || []) {
      // channelProducts 배열 확인
      if (product.channelProducts && Array.isArray(product.channelProducts)) {
        for (const cp of product.channelProducts) {
          if (String(cp.channelProductNo) === '12205978733' || 
              String(cp.id) === '12205978733') {
            targetProduct = product;
            targetOriginProductNo = product.originProductNo;
            console.log('✅ EPR 테스트용 상품 A 발견!');
            console.log(`- originProductNo: ${product.originProductNo}`);
            console.log(`- channelProductNo: ${cp.channelProductNo}`);
            console.log(`- 현재 재고: ${product.stockQuantity}`);
            break;
          }
        }
      }
      
      // 직접 ID 확인
      if (!targetProduct && 
          (String(product.id) === '12205978733' || 
           String(product.channelProductNo) === '12205978733')) {
        targetProduct = product;
        targetOriginProductNo = product.originProductNo;
        console.log('✅ EPR 테스트용 상품 A 발견 (직접 매칭)!');
        console.log(`- originProductNo: ${product.originProductNo}`);
        console.log(`- 현재 재고: ${product.stockQuantity}`);
      }
      
      if (targetProduct) break;
    }
    
    if (!targetOriginProductNo) {
      console.error('❌ EPR 테스트 상품을 찾을 수 없습니다.');
      return;
    }
    
    // 3. 상품 상세 정보 조회 (v2 API)
    console.log(`\n📋 상품 상세 조회 중... (originProductNo: ${targetOriginProductNo})`);
    
    const detailResponse = await axios.get(
      `https://api.commerce.naver.com/external/v2/products/origin-products/${targetOriginProductNo}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const productDetail = detailResponse.data.originProduct;
    console.log('✅ 상품 상세 정보 획득');
    console.log(`- 상품명: ${productDetail.name}`);
    console.log(`- 현재 재고: ${productDetail.stockQuantity}`);
    console.log(`- 상태: ${productDetail.statusType}`);
    console.log(`- 옵션 사용: ${productDetail.optionInfo?.optionUsable || false}`);
    
    // 4. 재고 업데이트 시도
    const newQuantity = 50;
    console.log(`\n📤 재고 업데이트 시도: ${productDetail.stockQuantity} → ${newQuantity}`);
    
    // 최소한의 필드만 포함하여 업데이트
    const updateData = {
      originProduct: {
        stockQuantity: newQuantity
      }
    };
    
    console.log('업데이트 요청 데이터:', JSON.stringify(updateData, null, 2));
    
    try {
      const updateResponse = await axios.put(
        `https://api.commerce.naver.com/external/v2/products/origin-products/${targetOriginProductNo}`,
        updateData,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      console.log('✅ 재고 업데이트 성공!');
      console.log(`응답 상태: ${updateResponse.status}`);
      
      // 5. 업데이트 확인
      console.log('\n⏳ 3초 후 업데이트 확인...');
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const verifyResponse = await axios.get(
        `https://api.commerce.naver.com/external/v2/products/origin-products/${targetOriginProductNo}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      const updatedProduct = verifyResponse.data.originProduct;
      console.log(`\n📊 업데이트 결과:`);
      console.log(`- 새로운 재고: ${updatedProduct.stockQuantity}`);
      console.log(`- 예상 재고: ${newQuantity}`);
      
      if (updatedProduct.stockQuantity === newQuantity) {
        console.log('✅ 재고가 성공적으로 업데이트되었습니다!');
      } else {
        console.log('⚠️ 재고가 예상과 다릅니다.');
      }
      
    } catch (updateError) {
      console.error('\n❌ 재고 업데이트 실패:');
      console.error('상태 코드:', updateError.response?.status);
      console.error('에러 메시지:', updateError.response?.data?.message || updateError.message);
      
      if (updateError.response?.data?.invalidInputs) {
        console.error('유효하지 않은 입력:');
        updateError.response.data.invalidInputs.forEach(input => {
          console.error(`  - ${input.name}: ${input.message}`);
        });
      }
      
      // 필수 필드 추가하여 재시도
      if (updateError.response?.status === 400) {
        console.log('\n🔄 필수 필드를 포함하여 재시도...');
        
        const fullUpdateData = {
          originProduct: {
            name: productDetail.name,
            salePrice: productDetail.salePrice,
            stockQuantity: newQuantity,
            statusType: newQuantity > 0 ? 'SALE' : 'OUTOFSTOCK',
            detailAttribute: productDetail.detailAttribute || {}
          }
        };
        
        try {
          const retryResponse = await axios.put(
            `https://api.commerce.naver.com/external/v2/products/origin-products/${targetOriginProductNo}`,
            fullUpdateData,
            {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              }
            }
          );
          
          console.log('✅ 재시도 성공!');
          console.log(`응답 상태: ${retryResponse.status}`);
        } catch (retryError) {
          console.error('❌ 재시도도 실패:', retryError.response?.data?.message || retryError.message);
        }
      }
    }
    
  } catch (error) {
    console.error('테스트 실패:', error.message);
    if (error.response?.data) {
      console.error('에러 상세:', error.response.data);
    }
  }
}

// 실행
searchAndUpdateStock().catch(console.error);