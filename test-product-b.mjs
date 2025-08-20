import axios from 'axios';

async function testProductB() {
  try {
    // Test Product B = SKU 2025080502
    const sku = '2025080502';
    const newQuantity = 150;
    
    console.log(`🔄 Testing inventory update for Test Product B (SKU: ${sku}) to ${newQuantity}`);
    
    // 재고 조정 요청
    const adjustResponse = await axios.post(
      `http://localhost:3000/api/v1/inventory/${sku}/adjust`,
      {
        platform: 'both',
        adjustType: 'set',
        naverQuantity: newQuantity,
        shopifyQuantity: newQuantity,
        reason: 'Test Product B (non-option product) adjustment'
      }
    );
    
    console.log('\n📋 Adjustment Response:', JSON.stringify(adjustResponse.data, null, 2));
    
    // 3초 대기 후 재고 확인
    console.log('\n⏳ Waiting 3 seconds...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // 재고 조회
    const inventoryResponse = await axios.get('http://localhost:3000/api/v1/inventory');
    const inventory = inventoryResponse.data.data.find(i => i.sku === sku);
    
    console.log('\n📊 Current inventory for Test Product B:');
    console.log(`- Naver stock: ${inventory?.naverStock || 'N/A'}`);
    console.log(`- Shopify stock: ${inventory?.shopifyStock || 'N/A'}`);
    
    if (adjustResponse.data?.data?.updateResults?.naver?.success) {
      console.log('\n✅ Naver API returned success');
    } else {
      console.log('\n❌ Naver API error:', adjustResponse.data?.data?.updateResults?.naver?.error);
    }
    
    if (inventory?.naverStock === newQuantity) {
      console.log('✅ SUCCESS: Naver inventory updated correctly!');
    } else {
      console.log(`❌ FAILED: Naver inventory is ${inventory?.naverStock}, expected ${newQuantity}`);
    }
    
    if (inventory?.shopifyStock === newQuantity) {
      console.log('✅ SUCCESS: Shopify inventory updated correctly!');
    } else {
      console.log(`❌ FAILED: Shopify inventory is ${inventory?.shopifyStock}, expected ${newQuantity}`);
    }
    
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

testProductB();