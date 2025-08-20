import axios from 'axios';
import bcrypt from 'bcryptjs';

async function testNaverComplete() {
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
    
    console.log('🔐 Getting token...');
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
    console.log('✅ Got token successfully\n');
    
    // Test Product B = SKU 2025080502
    const sku = '2025080502';
    const newQuantity = 250;
    
    // SKU로 상품 검색
    console.log(`🔍 Searching for product with SKU: ${sku}`);
    const searchResponse = await axios.post(
      'https://api.commerce.naver.com/external/v1/products/search',
      {
        searchKeyword: sku,
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
    
    if (!searchResponse.data.contents || searchResponse.data.contents.length === 0) {
      console.error('❌ Product not found');
      return;
    }
    
    const product = searchResponse.data.contents[0];
    const originProductNo = product.originProductNo;
    const channelProductNo = product.channelProductNo;
    
    console.log('📦 Found product:');
    console.log('- Name:', product.name);
    console.log('- Origin Product No:', originProductNo);
    console.log('- Channel Product No:', channelProductNo);
    console.log('- Current Stock:', product.stockQuantity);
    console.log('- Status:', product.statusType);
    console.log('- Stock Manageable:', product.stockManageable);
    
    // v2 API로 전체 상품 정보 가져오기
    console.log('\n📄 Getting full product details from v2 API...');
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
    if (!fullProduct) {
      console.error('❌ Could not get full product details');
      return;
    }
    
    console.log('✅ Got full product details');
    console.log('- Current stockQuantity:', fullProduct.stockQuantity);
    console.log('- Sale Price:', fullProduct.salePrice);
    console.log('- Has detailAttribute:', !!fullProduct.detailAttribute);
    
    // 방법 1: 최소한의 필드만 업데이트
    console.log('\n📤 Method 1: Updating with minimal fields...');
    try {
      const minimalUpdate = {
        originProduct: {
          stockQuantity: newQuantity
        }
      };
      
      const response1 = await axios.put(
        `https://api.commerce.naver.com/external/v2/products/origin-products/${originProductNo}`,
        minimalUpdate,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      console.log('Response:', response1.status, response1.statusText);
      
      // 확인
      await new Promise(resolve => setTimeout(resolve, 2000));
      const check1 = await axios.get(
        `https://api.commerce.naver.com/external/v2/products/origin-products/${originProductNo}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      console.log('✅ Stock after update:', check1.data?.originProduct?.stockQuantity);
      
      if (check1.data?.originProduct?.stockQuantity === newQuantity) {
        console.log('🎉 SUCCESS with minimal update!');
        return;
      }
    } catch (err) {
      console.log('❌ Minimal update failed:', err.response?.data?.message || err.message);
    }
    
    // 방법 2: 전체 originProduct 업데이트 (기존 데이터 병합)
    console.log('\n📤 Method 2: Updating with full originProduct merge...');
    try {
      const fullUpdate = {
        originProduct: {
          ...fullProduct,
          stockQuantity: newQuantity,
          statusType: newQuantity > 0 ? 'SALE' : 'OUTOFSTOCK'
        }
      };
      
      const response2 = await axios.put(
        `https://api.commerce.naver.com/external/v2/products/origin-products/${originProductNo}`,
        fullUpdate,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      console.log('Response:', response2.status, response2.statusText);
      
      // 확인
      await new Promise(resolve => setTimeout(resolve, 2000));
      const check2 = await axios.get(
        `https://api.commerce.naver.com/external/v2/products/origin-products/${originProductNo}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      console.log('✅ Stock after update:', check2.data?.originProduct?.stockQuantity);
      
      if (check2.data?.originProduct?.stockQuantity === newQuantity) {
        console.log('🎉 SUCCESS with full merge!');
        return;
      }
    } catch (err) {
      console.log('❌ Full merge failed:', err.response?.data?.message || err.message);
    }
    
    // 방법 3: PATCH 메소드 시도
    console.log('\n📤 Method 3: Trying PATCH method...');
    try {
      const patchData = {
        stockQuantity: newQuantity
      };
      
      const response3 = await axios.patch(
        `https://api.commerce.naver.com/external/v2/products/origin-products/${originProductNo}`,
        patchData,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      console.log('Response:', response3.status, response3.statusText);
      
      // 확인
      await new Promise(resolve => setTimeout(resolve, 2000));
      const check3 = await axios.get(
        `https://api.commerce.naver.com/external/v2/products/origin-products/${originProductNo}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      console.log('✅ Stock after update:', check3.data?.originProduct?.stockQuantity);
      
      if (check3.data?.originProduct?.stockQuantity === newQuantity) {
        console.log('🎉 SUCCESS with PATCH!');
        return;
      }
    } catch (err) {
      console.log('❌ PATCH failed:', err.response?.data?.message || err.message);
    }
    
    // 방법 4: 상태 변경 API 사용
    console.log('\n📤 Method 4: Using status change API...');
    try {
      // 먼저 품절로 변경
      await axios.put(
        `https://api.commerce.naver.com/external/v1/products/origin-products/${originProductNo}/change-status`,
        { statusType: 'OUTOFSTOCK' },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      console.log('✅ Changed to OUTOFSTOCK');
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // 다시 판매중으로 변경하면서 재고 업데이트
      await axios.put(
        `https://api.commerce.naver.com/external/v1/products/origin-products/${originProductNo}/change-status`,
        { statusType: 'SALE' },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      console.log('✅ Changed back to SALE');
      
      // 재고 업데이트 재시도
      const retryUpdate = {
        originProduct: {
          stockQuantity: newQuantity
        }
      };
      
      const response4 = await axios.put(
        `https://api.commerce.naver.com/external/v2/products/origin-products/${originProductNo}`,
        retryUpdate,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      console.log('Response:', response4.status, response4.statusText);
      
      // 확인
      await new Promise(resolve => setTimeout(resolve, 2000));
      const check4 = await axios.get(
        `https://api.commerce.naver.com/external/v2/products/origin-products/${originProductNo}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      console.log('✅ Stock after update:', check4.data?.originProduct?.stockQuantity);
      
      if (check4.data?.originProduct?.stockQuantity === newQuantity) {
        console.log('🎉 SUCCESS with status change!');
        return;
      }
    } catch (err) {
      console.log('❌ Status change method failed:', err.response?.data?.message || err.message);
    }
    
    console.log('\n❌ All methods failed. The API returns success but stock is not actually updating.');
    console.log('This might be due to:');
    console.log('1. Stock management disabled in Naver Commerce Center');
    console.log('2. API permissions limited to read-only');
    console.log('3. Product-specific settings preventing API updates');
    console.log('4. Synchronization delay in Naver system');
    
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

testNaverComplete();