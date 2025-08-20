import axios from 'axios';

async function testProductInfo() {
  try {
    // 매핑 정보 가져오기
    const mappingResponse = await axios.get('http://localhost:3000/api/v1/mappings');
    const mapping = mappingResponse.data.data.mappings.find(m => m.sku === '2025080501');
    
    console.log('📦 Mapping info for 2025080501:');
    console.log('- naverProductId in mapping:', mapping.naverProductId);
    
    // 인벤토리 조회해서 실제 product 정보 확인
    const inventoryResponse = await axios.get('http://localhost:3000/api/v1/inventory');
    const inventory = inventoryResponse.data.data.find(i => i.sku === '2025080501');
    
    console.log('\n📊 Inventory info:');
    console.log('- naverStock:', inventory.naverStock);
    console.log('- shopifyStock:', inventory.shopifyStock);
    
    // 매핑의 naverProductId가 channelProductNo인지 originProductNo인지 확인 필요
    console.log('\n⚠️  Note: The naverProductId in mapping (12205978733) might be:');
    console.log('- channelProductNo (채널 상품 번호)');
    console.log('- Need to find originProductNo (원상품 번호) for API updates');
    
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

testProductInfo();