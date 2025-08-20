import axios from 'axios';

async function testNaverSkuSearchDetail() {
  try {
    const skuToSearch = '2025080501';
    
    console.log('Testing SKU search for:', skuToSearch);
    console.log('=' .repeat(50));
    
    // 백엔드 API 호출
    const response = await axios.get('http://localhost:3000/api/v1/mappings/search-by-sku', {
      params: { sku: skuToSearch },
      headers: {
        'Authorization': 'Bearer test-token'
      }
    });
    
    if (response.data?.data?.naver?.products) {
      const products = response.data.data.naver.products;
      console.log(`\n📦 Found ${products.length} NAVER products:\n`);
      
      products.forEach((product, index) => {
        console.log(`${index + 1}. Product Details:`);
        console.log(`   - ID: ${product.id}`);
        console.log(`   - SKU: ${product.sku}`);
        console.log(`   - Name: ${product.name}`);
        console.log(`   - Price: ${product.price}원`);
        console.log(`   - Stock: ${product.stockQuantity}`);
        console.log(`   - Similarity: ${product.similarity}%`);
        console.log('-'.repeat(50));
      });
      
      // SKU가 정확히 일치하는 것만 필터링
      const exactMatches = products.filter(p => p.sku === skuToSearch);
      console.log(`\n✅ Exact SKU matches: ${exactMatches.length}`);
      
      if (exactMatches.length > 0) {
        console.log('\nExact matching products:');
        exactMatches.forEach((product, index) => {
          console.log(`${index + 1}. ${product.name} (ID: ${product.id})`);
        });
      }
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
  }
}

testNaverSkuSearchDetail();