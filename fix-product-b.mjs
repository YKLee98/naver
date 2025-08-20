import axios from 'axios';

async function fixProductB() {
  try {
    console.log('🔍 Searching for Product B in both platforms...\n');
    
    // 1. Shopify에서 상품 B 찾기
    console.log('1. Searching in Shopify...');
    const shopifyResponse = await axios.get('http://localhost:3000/api/v1/products/search', {
      params: {
        search: '2025080502',
        platform: 'shopify'
      }
    });
    
    console.log('Shopify Response:', JSON.stringify(shopifyResponse.data, null, 2));
    
    let shopifyProductId = null;
    let shopifyVariantId = null;
    
    if (shopifyResponse.data?.data?.products) {
      const shopifyProducts = shopifyResponse.data.data.products;
      const productB = shopifyProducts.find(p => 
        p.variants?.some(v => v.sku === '2025080502')
      );
      
      if (productB) {
        shopifyProductId = productB.id;
        const variant = productB.variants.find(v => v.sku === '2025080502');
        shopifyVariantId = variant?.id;
        
        console.log('\n✅ Found Product B in Shopify:');
        console.log('  Product ID:', shopifyProductId);
        console.log('  Variant ID:', shopifyVariantId);
        console.log('  Title:', productB.title);
        console.log('  SKU:', variant?.sku);
      }
    }
    
    // 2. 네이버에서 상품 B 찾기
    console.log('\n2. Searching in Naver...');
    const naverResponse = await axios.get('http://localhost:3000/api/v1/products/search', {
      params: {
        search: '2025080502',
        searchType: 'SELLER_MANAGEMENT_CODE'
      }
    });
    
    console.log('Naver Response:', JSON.stringify(naverResponse.data, null, 2));
    
    let naverProductId = null;
    let naverOriginProductNo = null;
    let productName = null;
    
    if (naverResponse.data?.data?.products) {
      const naverProducts = naverResponse.data.data.products;
      if (naverProducts.length > 0) {
        const productB = naverProducts[0];
        naverProductId = productB.channelProductNo || productB.id;
        naverOriginProductNo = productB.originProductNo;
        productName = productB.name;
        
        console.log('\n✅ Found Product B in Naver:');
        console.log('  Channel Product No:', naverProductId);
        console.log('  Origin Product No:', naverOriginProductNo);
        console.log('  Name:', productName);
        console.log('  Stock:', productB.stockQuantity);
      }
    }
    
    // 3. 매핑 정보 업데이트
    if (shopifyProductId && naverOriginProductNo) {
      console.log('\n3. Updating mapping...');
      
      const mappingData = {
        sku: '2025080502',
        naverProductId: naverOriginProductNo, // originProductNo 사용
        shopifyProductId: shopifyProductId,
        shopifyVariantId: shopifyVariantId,
        productName: productName || 'EPR 테스트용 상품 B',
        isActive: true,
        status: 'active',
        priceMargin: 0
      };
      
      console.log('Mapping data:', JSON.stringify(mappingData, null, 2));
      
      const updateResponse = await axios.post('http://localhost:3000/api/v1/mappings', mappingData);
      
      console.log('\n✅ Mapping updated successfully!');
      console.log('Response:', JSON.stringify(updateResponse.data, null, 2));
    } else {
      console.log('\n❌ Could not find complete information:');
      console.log('  Shopify Product ID:', shopifyProductId || 'NOT FOUND');
      console.log('  Naver Origin Product No:', naverOriginProductNo || 'NOT FOUND');
    }
    
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

fixProductB();