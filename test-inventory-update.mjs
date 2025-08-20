import axios from 'axios';

async function testInventoryUpdate() {
  try {
    const sku = '2025080501';
    const newQuantity = 100;
    
    console.log(`🔄 Testing inventory update for SKU ${sku} to ${newQuantity}`);
    
    // 재고 조정 요청 - 프론트엔드와 동일한 형식 사용
    const response = await axios.post(
      `http://localhost:3000/api/v1/inventory/${sku}/adjust`,
      {
        platform: 'both',
        adjustType: 'set',
        naverQuantity: newQuantity,
        shopifyQuantity: newQuantity,
        reason: 'Test adjustment'
      }
    );
    
    console.log('\n📋 Response:', JSON.stringify(response.data, null, 2));
    
    // 잠시 대기 후 재고 확인
    console.log('\n⏳ Waiting 3 seconds before verification...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // 재고 조회
    const inventoryResponse = await axios.get('http://localhost:3000/api/v1/inventory');
    const inventory = inventoryResponse.data.data.find(i => i.sku === sku);
    
    console.log('\n📊 Current inventory:');
    console.log(`- Naver stock: ${inventory?.naverStock || 'N/A'}`);
    console.log(`- Shopify stock: ${inventory?.shopifyStock || 'N/A'}`);
    
    if (inventory?.naverStock === newQuantity) {
      console.log('\n✅ SUCCESS: Naver inventory updated correctly!');
    } else {
      console.log(`\n❌ FAILED: Naver inventory is ${inventory?.naverStock}, expected ${newQuantity}`);
    }
    
    if (inventory?.shopifyStock === newQuantity) {
      console.log('✅ SUCCESS: Shopify inventory updated correctly!');
    } else {
      console.log(`❌ FAILED: Shopify inventory is ${inventory?.shopifyStock}, expected ${newQuantity}`);
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error.response?.data || error.message);
  }
}

testInventoryUpdate();