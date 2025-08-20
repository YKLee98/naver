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

async function updateNaverStock() {
  try {
    console.log('=== 네이버 재고 업데이트 최종 수정 ===\n');
    
    const accessToken = await getNaverToken();
    console.log('✅ 토큰 획득 성공\n');
    
    // EPR 테스트용 상품 A
    const originProductNo = '12150233672';
    const newQuantity = 50;
    
    // 1. 현재 상품 정보 조회 (전체 데이터 필요)
    console.log('📋 상품 정보 조회 중...');
    const productResponse = await axios.get(
      `https://api.commerce.naver.com/external/v2/products/origin-products/${originProductNo}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const currentProduct = productResponse.data.originProduct;
    console.log(`✅ 현재 재고: ${currentProduct.stockQuantity}`);
    console.log(`✅ 현재 상태: ${currentProduct.statusType}\n`);
    
    // 2. 재고 업데이트 - detailAttribute 포함
    console.log(`📤 재고 업데이트 시도: ${currentProduct.stockQuantity} → ${newQuantity}`);
    
    const updateData = {
      originProduct: {
        stockQuantity: newQuantity,
        statusType: newQuantity > 0 ? 'SALE' : 'OUTOFSTOCK',
        detailAttribute: currentProduct.detailAttribute // 기존 detailAttribute 그대로 사용
      }
    };
    
    console.log('업데이트 데이터:', {
      stockQuantity: updateData.originProduct.stockQuantity,
      statusType: updateData.originProduct.statusType,
      hasDetailAttribute: !!updateData.originProduct.detailAttribute
    });
    
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
    
    console.log(`\n✅ 재고 업데이트 성공!`);
    console.log(`응답 상태: ${updateResponse.status}`);
    
    // 3. 업데이트 확인
    console.log('\n⏳ 3초 후 업데이트 확인...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
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
    console.log(`\n📊 최종 결과:`);
    console.log(`- 재고: ${updatedProduct.stockQuantity}개`);
    console.log(`- 상태: ${updatedProduct.statusType}`);
    
    if (updatedProduct.stockQuantity === newQuantity) {
      console.log(`\n🎉 성공! 재고가 ${newQuantity}개로 업데이트되었습니다!`);
    } else {
      console.log(`\n⚠️ 재고가 예상과 다릅니다. (예상: ${newQuantity}, 실제: ${updatedProduct.stockQuantity})`);
    }
    
  } catch (error) {
    console.error('\n❌ 오류 발생:', error.response?.data?.message || error.message);
    if (error.response?.data?.invalidInputs) {
      console.error('유효하지 않은 입력:');
      error.response.data.invalidInputs.forEach(input => {
        console.error(`  - ${input.name}: ${input.message}`);
      });
    }
  }
}

// 실행
updateNaverStock().catch(console.error);