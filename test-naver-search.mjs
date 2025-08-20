import axios from 'axios';

async function testNaverSearch() {
  try {
    console.log('🔍 Testing Naver product search via backend\n');
    
    // 백엔드 API를 통해 네이버 검색 테스트
    const response = await axios.post('http://localhost:3000/api/v1/test/naver-search', {
      sku: '2025080502'
    }).catch(async (err) => {
      // 테스트 엔드포인트가 없으면 직접 재고 조회
      console.log('Test endpoint not available, checking inventory directly\n');
      
      const inventoryRes = await axios.get('http://localhost:3000/api/v1/inventory');
      const product = inventoryRes.data.data.find(item => item.sku === '2025080502');
      
      console.log('Product B from inventory API:');
      console.log('- SKU:', product?.sku);
      console.log('- Name:', product?.productName);
      console.log('- Naver Stock:', product?.naverStock);
      console.log('- Shopify Stock:', product?.shopifyStock);
      
      return null;
    });
    
    if (response && response.data) {
      console.log('Search result:', JSON.stringify(response.data, null, 2));
    }
    
    // 매핑 정보 확인
    console.log('\n📋 Checking mapping info...');
    const mappingRes = await axios.get('http://localhost:3000/api/v1/mappings');
    const mappings = mappingRes.data?.data?.mappings || [];
    const mapping = mappings.find(m => m.sku === '2025080502');
    
    if (mapping) {
      console.log('\nMapping for SKU 2025080502:');
      console.log('- Product Name:', mapping.productName);
      console.log('- Naver Product ID (channelNo):', mapping.naverProductId);
      console.log('- Shopify Product ID:', mapping.shopifyProductId);
      console.log('- Status:', mapping.status);
      
      // 이 channelProductNo가 실제로 네이버에서 유효한지 확인 필요
      console.log('\n⚠️ Note: The stored channelProductNo is', mapping.naverProductId);
      console.log('This needs to match exactly with a product in Naver Commerce Center');
    }
    
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

testNaverSearch();