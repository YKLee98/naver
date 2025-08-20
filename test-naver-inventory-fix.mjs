import axios from 'axios';
import crypto from 'crypto';
import bcrypt from 'bcrypt';

// 네이버 API 인증
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
      }
    );
    
    return tokenResponse.data.access_token;
  } catch (error) {
    console.error('Failed to get token:', error.response?.data || error.message);
    throw error;
  }
}

// 상품 정보 가져오기 (SKU로 검색)
async function getProductBySku(accessToken, sku) {
  try {
    const response = await axios.post(
      'https://api.commerce.naver.com/external/v1/products/search',
      {
        searchType: 'SELLER_MANAGEMENT_CODE',
        searchKeyword: sku,
        page: 1,
        size: 10
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (response.data?.contents?.length > 0) {
      const product = response.data.contents.find(p => p.sellerManagementCode === sku);
      return product || response.data.contents[0];
    }
    return null;
  } catch (error) {
    console.error('Failed to search product:', error.response?.data || error.message);
    return null;
  }
}

// 재고 업데이트 (originProductNo 사용)
async function updateStock(accessToken, originProductNo, quantity) {
  try {
    console.log(`\n📦 Updating stock for originProductNo: ${originProductNo} to ${quantity}`);
    
    // 먼저 전체 상품 정보 가져오기
    const productResponse = await axios.get(
      `https://api.commerce.naver.com/external/v2/products/origin-products/${originProductNo}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const fullProductInfo = productResponse.data?.originProduct;
    if (!fullProductInfo) {
      throw new Error('Could not fetch product info');
    }
    
    console.log('Product info:', {
      name: fullProductInfo.name,
      currentStock: fullProductInfo.stockQuantity,
      statusType: fullProductInfo.statusType
    });
    
    // 재고 업데이트 요청 (최소 필드만)
    const updateData = {
      originProduct: {
        stockQuantity: quantity
      }
    };
    
    console.log('Sending update request...');
    const updateResponse = await axios.put(
      `https://api.commerce.naver.com/external/v2/products/origin-products/${originProductNo}`,
      updateData,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('Update response status:', updateResponse.status);
    
    // 검증
    await new Promise(resolve => setTimeout(resolve, 2000));
    const verifyResponse = await axios.get(
      `https://api.commerce.naver.com/external/v2/products/origin-products/${originProductNo}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const newStock = verifyResponse.data?.originProduct?.stockQuantity;
    console.log(`✅ Stock updated successfully: ${newStock}`);
    
    return true;
  } catch (error) {
    console.error('Failed to update stock:', error.response?.data || error.message);
    return false;
  }
}

// 백엔드 API 테스트
async function testBackendInventoryUpdate() {
  const baseUrl = 'http://localhost:3000/api/v1';
  const token = 'test-token';
  
  try {
    console.log('\n=== Testing Backend Inventory Update ===\n');
    
    // 재고 조정 API 호출
    const sku = '2025080501';
    const newQuantity = 50;
    
    console.log(`Adjusting inventory for ${sku} to ${newQuantity}...`);
    
    const response = await axios.post(
      `${baseUrl}/inventory/${sku}/adjust`,
      {
        platform: 'naver',
        quantity: newQuantity,
        adjustType: 'set',
        reason: 'Test adjustment'
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('Backend response:', response.data);
    
    // 결과 확인
    const checkResponse = await axios.get(
      `${baseUrl}/inventory/${sku}`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );
    
    console.log('Updated inventory:', checkResponse.data);
    
  } catch (error) {
    console.error('Backend test failed:', error.response?.data || error.message);
  }
}

// 직접 네이버 API 테스트
async function testDirectNaverUpdate() {
  console.log('\n=== Direct Naver API Test ===\n');
  
  try {
    const accessToken = await getNaverToken();
    console.log('✅ Got access token');
    
    // SKU로 상품 검색
    const sku = '2025080501';
    const product = await getProductBySku(accessToken, sku);
    
    if (!product) {
      console.error('Product not found');
      return;
    }
    
    console.log(`Found product:`, {
      name: product.name,
      originProductNo: product.originProductNo,
      currentStock: product.stockQuantity,
      sku: product.sellerManagementCode
    });
    
    // 재고 업데이트
    const newStock = 75;
    const success = await updateStock(accessToken, product.originProductNo, newStock);
    
    if (success) {
      console.log(`✅ Stock update successful for ${sku}`);
    } else {
      console.log(`❌ Stock update failed for ${sku}`);
    }
    
  } catch (error) {
    console.error('Direct test failed:', error.message);
  }
}

// 메인 실행
async function main() {
  // 직접 네이버 API 테스트 먼저
  await testDirectNaverUpdate();
  
  // 백엔드 API 테스트
  await testBackendInventoryUpdate();
}

main().catch(console.error);