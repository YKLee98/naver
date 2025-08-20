import axios from 'axios';
import bcrypt from 'bcryptjs';

async function getNaverToken() {
  const clientId = '42g71Rui1jMS5KKHDyDhIO';
  const clientSecret = '$2a$04$dqVRQvyZ./Bu0m4BDZh6eu';
  
  const timestamp = Date.now();
  const password = `${clientId}_${timestamp}`;
  const hashedPassword = await bcrypt.hash(password, clientSecret);
  
  try {
    const tokenResponse = await axios.post(
      'https://api.commerce.naver.com/external/v1/oauth2/token',
      {
        client_id: clientId,
        timestamp: timestamp,
        client_secret_sign: hashedPassword,
        grant_type: 'client_credentials',
        type: 'SELF'
      },
      {
        headers: {
          'Content-Type': 'application/json',
        }
      }
    );
    
    return tokenResponse.data.access_token;
  } catch (error) {
    console.error('Token 획득 실패:', error.response?.data || error.message);
    throw error;
  }
}

async function searchNaverProducts(accessToken, sku) {
  try {
    const response = await axios.post(
      'https://api.commerce.naver.com/external/v1/products/search',
      {
        searchKeyword: sku,
        searchType: 'SELLER_MANAGEMENT_CODE',
        page: 1,
        size: 10
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    return response.data;
  } catch (error) {
    console.error('상품 검색 실패:', error.response?.data || error.message);
    return null;
  }
}

async function getProductDetail(accessToken, productNo) {
  try {
    // v2 API로 상품 상세 조회
    const response = await axios.get(
      `https://api.commerce.naver.com/external/v2/products/origin-products/${productNo}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    return response.data;
  } catch (error) {
    console.error(`상품 상세 조회 실패 (${productNo}):`, error.response?.status, error.response?.data?.message);
    return null;
  }
}

async function testRealNaverAPI() {
  try {
    console.log('=== 실제 네이버 API 테스트 ===\n');
    
    const accessToken = await getNaverToken();
    console.log('✅ 토큰 획득 성공\n');
    
    // SKU로 상품 검색
    const sku = '2025080501';
    console.log(`SKU ${sku}로 검색 중...`);
    
    const searchResult = await searchNaverProducts(accessToken, sku);
    
    if (searchResult && searchResult.contents) {
      console.log(`\n검색 결과: ${searchResult.contents.length}개 상품\n`);
      
      // 각 상품의 구조 확인
      for (let i = 0; i < Math.min(3, searchResult.contents.length); i++) {
        const product = searchResult.contents[i];
        console.log(`\n[상품 ${i+1}]`);
        console.log('- name:', product.name);
        console.log('- originProductNo:', product.originProductNo);
        console.log('- channelProductNo:', product.channelProductNo);
        console.log('- productNo:', product.productNo);
        console.log('- id:', product.id);
        console.log('- sellerManagementCode:', product.sellerManagementCode);
        console.log('- stockQuantity:', product.stockQuantity);
        console.log('- salePrice:', product.salePrice);
        
        // channelProducts 확인
        if (product.channelProducts && Array.isArray(product.channelProducts)) {
          console.log('- channelProducts 수:', product.channelProducts.length);
          if (product.channelProducts.length > 0) {
            const cp = product.channelProducts[0];
            console.log('  첫 번째 채널 상품:');
            console.log('  - channelProductNo:', cp.channelProductNo);
            console.log('  - stockQuantity:', cp.stockQuantity);
          }
        }
        
        // originProductNo로 상세 조회 시도
        if (product.originProductNo) {
          console.log(`\noriginProductNo ${product.originProductNo}로 상세 조회 시도...`);
          const detail = await getProductDetail(accessToken, product.originProductNo);
          if (detail) {
            console.log('✅ 상세 조회 성공');
            console.log('- statusType:', detail.originProduct?.statusType);
            console.log('- stockQuantity:', detail.originProduct?.stockQuantity);
          }
        }
      }
      
      // EPR 테스트 상품 찾기
      const testProduct = searchResult.contents.find(p => 
        p.name && p.name.includes('EPR 테스트') || 
        p.sellerManagementCode === sku
      );
      
      if (testProduct) {
        console.log('\n=== EPR 테스트 상품 발견 ===');
        console.log('전체 구조:', JSON.stringify(testProduct, null, 2));
      }
    } else {
      console.log('검색 결과 없음');
    }
    
  } catch (error) {
    console.error('테스트 실패:', error.message);
  }
}

testRealNaverAPI().catch(console.error);