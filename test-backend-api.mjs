import axios from 'axios';

async function testBackendApi() {
  try {
    console.log('🔍 Testing backend API to understand stock values\n');
    
    // 1. 네이버 API 직접 호출 (백엔드 경유)
    console.log('1️⃣ Searching Naver products via backend...');
    const searchResponse = await axios.post('http://localhost:3000/api/v1/sync/debug/naver-search', {
      sku: '2025080502'
    }).catch(err => {
      // 엔드포인트가 없을 수 있음
      return null;
    });
    
    if (searchResponse && searchResponse.data) {
      console.log('Naver search result:', JSON.stringify(searchResponse.data, null, 2));
    }
    
    // 2. 재고 조회 API
    console.log('\n2️⃣ Getting inventory from backend...');
    const inventoryResponse = await axios.get('http://localhost:3000/api/v1/inventory');
    const productB = inventoryResponse.data.data.find(item => item.sku === '2025080502');
    
    console.log('Product B inventory:');
    console.log('- SKU:', productB.sku);
    console.log('- Name:', productB.productName);
    console.log('- Naver Stock:', productB.naverStock);
    console.log('- Shopify Stock:', productB.shopifyStock);
    console.log('- Sync Status:', productB.syncStatus);
    console.log('- Last Synced:', productB.lastSyncedAt);
    
    // 3. 재고 조정 후 즉시 확인
    console.log('\n3️⃣ Adjusting inventory and checking immediately...');
    const adjustResponse = await axios.post(
      'http://localhost:3000/api/v1/inventory/2025080502/adjust',
      {
        platform: 'naver',
        adjustType: 'set',
        naverQuantity: 200,
        reason: 'Debug test'
      }
    );
    
    console.log('\nAdjust response:', adjustResponse.data);
    
    // 4. 바로 재조회
    console.log('\n4️⃣ Re-checking inventory immediately...');
    const reCheckResponse = await axios.get('http://localhost:3000/api/v1/inventory');
    const productBAfter = reCheckResponse.data.data.find(item => item.sku === '2025080502');
    
    console.log('Product B inventory after adjustment:');
    console.log('- Naver Stock:', productBAfter.naverStock);
    console.log('- Shopify Stock:', productBAfter.shopifyStock);
    
    // 5. SKU 상태 조회
    console.log('\n5️⃣ Getting SKU status...');
    const statusResponse = await axios.get('http://localhost:3000/api/v1/inventory/2025080502/status');
    console.log('Status response:', statusResponse.data);
    
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

testBackendApi();