import axios from 'axios';

async function testNaverSkuSearch() {
  try {
    const skuToSearch = 'NAVER-FMHM-240401-1';
    
    console.log('Testing SKU search for:', skuToSearch);
    
    // 백엔드 API 호출
    const response = await axios.get('http://localhost:3000/api/v1/mappings/search-by-sku', {
      params: { sku: skuToSearch },
      headers: {
        'Authorization': 'Bearer test-token'
      }
    });
    
    console.log('\n=== SEARCH RESULTS ===');
    console.log('Response status:', response.status);
    
    if (response.data?.data?.naver) {
      const naverData = response.data.data.naver;
      console.log('\n📦 NAVER Results:');
      console.log('Found:', naverData.found);
      console.log('Products count:', naverData.products?.length || 0);
      console.log('Message:', naverData.message);
      
      if (naverData.products && naverData.products.length > 0) {
        console.log('\nFirst product:');
        console.log('- ID:', naverData.products[0].id);
        console.log('- SKU:', naverData.products[0].sku);
        console.log('- Name:', naverData.products[0].name);
        console.log('- Price:', naverData.products[0].price);
      }
    }
    
    if (response.data?.data?.shopify) {
      const shopifyData = response.data.data.shopify;
      console.log('\n🛒 SHOPIFY Results:');
      console.log('Found:', shopifyData.found);
      console.log('Products count:', shopifyData.products?.length || 0);
      console.log('Message:', shopifyData.message);
    }
    
  } catch (error) {
    console.error('Error testing SKU search:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

testNaverSkuSearch();