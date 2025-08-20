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

async function updateStock() {
  try {
    console.log('=== 네이버 재고 업데이트 작동 테스트 ===\n');
    
    const accessToken = await getNaverToken();
    console.log('✅ 토큰 획득 성공\n');
    
    // EPR 테스트용 상품 A
    const originProductNo = '12150233672';
    const newQuantity = 50;
    
    // 1. 현재 상품 정보 조회
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
    
    const product = productResponse.data.originProduct;
    console.log(`✅ 상품명: ${product.name}`);
    console.log(`✅ 현재 재고: ${product.stockQuantity}`);
    console.log(`✅ 현재 가격: ${product.salePrice}원\n`);
    
    // 2. 필수 필드를 모두 포함한 업데이트
    console.log(`📤 재고 업데이트 시도: ${product.stockQuantity} → ${newQuantity}`);
    
    const updateData = {
      originProduct: {
        name: product.name,
        salePrice: product.salePrice,
        images: product.images || [],
        stockQuantity: newQuantity,
        statusType: newQuantity > 0 ? 'SALE' : 'OUTOFSTOCK',
        detailAttribute: product.detailAttribute
      }
    };
    
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
    
    // 3. 확인
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
    
    const updated = verifyResponse.data.originProduct;
    console.log(`\n📊 최종 결과:`);
    console.log(`- 재고: ${updated.stockQuantity}개 (목표: ${newQuantity}개)`);
    
    if (updated.stockQuantity === newQuantity) {
      console.log(`\n🎉 성공! 네이버 재고가 ${newQuantity}개로 업데이트되었습니다!`);
      
      // 백엔드에 적용할 정확한 필수 필드 목록
      console.log('\n✅ 백엔드에 적용할 필수 필드:');
      console.log('- name (상품명)');
      console.log('- salePrice (판매가)');
      console.log('- images (이미지 배열)');
      console.log('- stockQuantity (재고수량)');
      console.log('- statusType (판매상태)');
      console.log('- detailAttribute (상세속성)');
    }
    
  } catch (error) {
    console.error('\n❌ 오류:', error.response?.data?.message || error.message);
    if (error.response?.data?.invalidInputs) {
      error.response.data.invalidInputs.forEach(input => {
        console.error(`  - ${input.name}: ${input.message}`);
      });
    }
  }
}

updateStock().catch(console.error);