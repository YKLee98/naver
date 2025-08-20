import axios from 'axios';

async function checkProductDetail() {
  try {
    // 백엔드 API를 통해 상품 정보 조회
    console.log('🔍 Checking product details for SKU: 2025080502\n');
    
    // 1. 재고 목록 조회
    const inventoryResponse = await axios.get('http://localhost:3000/api/v1/inventory');
    const inventory = inventoryResponse.data.data.find(i => i.sku === '2025080502');
    
    console.log('📦 Inventory API Response:');
    console.log('- Product Name:', inventory?.productName);
    console.log('- Naver Stock:', inventory?.naverStock);
    console.log('- Shopify Stock:', inventory?.shopifyStock);
    console.log('- Last Sync:', inventory?.lastSyncAt);
    
    // 2. SKU 매핑 정보 조회
    const mappingsResponse = await axios.get('http://localhost:3000/api/v1/mappings');
    const mappings = mappingsResponse.data?.data?.mappings || [];
    const mapping = mappings.find(m => m.sku === '2025080502');
    
    console.log('\n🔗 Mapping Information:');
    console.log('- SKU:', mapping?.sku);
    console.log('- Naver Product ID:', mapping?.naverProductId);
    console.log('- Shopify Product ID:', mapping?.shopifyProductId);
    console.log('- Shopify Variant ID:', mapping?.shopifyVariantId);
    
    // 3. 네이버에서 직접 상품 조회
    console.log('\n📡 Direct Naver Product Search:');
    const searchResponse = await axios.post('http://localhost:3000/api/v1/naver/products/search', {
      searchKeyword: '2025080502',
      searchType: 'SELLER_MANAGEMENT_CODE'
    });
    
    if (searchResponse.data.contents && searchResponse.data.contents.length > 0) {
      const naverProduct = searchResponse.data.contents[0];
      console.log('- Product Name:', naverProduct.name);
      console.log('- Origin Product No:', naverProduct.originProductNo);
      console.log('- Channel Product No:', naverProduct.channelProductNo);
      console.log('- Stock Quantity:', naverProduct.stockQuantity);
      console.log('- Status Type:', naverProduct.statusType);
      console.log('- Stock Manageable:', naverProduct.stockManageable);
      console.log('- Option Usable:', naverProduct.optionUsable);
      
      // 4. 원본 상품 정보 조회
      if (naverProduct.originProductNo) {
        console.log('\n📄 Origin Product Details:');
        try {
          const originResponse = await axios.get(
            `http://localhost:3000/api/v1/naver/products/${naverProduct.originProductNo}`
          );
          
          if (originResponse.data) {
            console.log('- Stock Quantity:', originResponse.data.stockQuantity);
            console.log('- Status Type:', originResponse.data.statusType);
            console.log('- Sale Price:', originResponse.data.salePrice);
          }
        } catch (err) {
          console.log('Could not fetch origin product details');
        }
      }
    }
    
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

checkProductDetail();