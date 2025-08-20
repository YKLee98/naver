import mongoose from 'mongoose';
import axios from 'axios';

async function fixProductB() {
  console.log('🔧 Fixing Product B (2025080502)\n');
  
  try {
    // MongoDB 연결
    await mongoose.connect('mongodb://localhost:27017/ERP_NAVER');
    
    const mappingSchema = new mongoose.Schema({}, { strict: false });
    const ProductMapping = mongoose.model('ProductMapping', mappingSchema, 'productmappings');
    
    // 1. 백엔드 API로 SKU 검색
    console.log('1. Searching via backend API...');
    const searchResponse = await axios.get('http://localhost:3000/api/v1/mappings/search-products', {
      params: {
        sku: '2025080502'
      }
    });
    
    console.log('Search response:', JSON.stringify(searchResponse.data, null, 2));
    
    // 2. Shopify 상품 정보 추출
    let shopifyProductName = null;
    let shopifyProductId = null;
    let shopifyVariantId = null;
    
    if (searchResponse.data?.data?.shopify?.found) {
      const shopifyProduct = searchResponse.data.data.shopify.products[0];
      shopifyProductName = shopifyProduct.title;
      shopifyProductId = shopifyProduct.id;
      shopifyVariantId = shopifyProduct.variantId;
      
      console.log('\n✅ Shopify Product Found:');
      console.log('  Name:', shopifyProductName);
      console.log('  Product ID:', shopifyProductId);
      console.log('  Variant ID:', shopifyVariantId);
    }
    
    // 3. 네이버 상품 정보 추출 (originProductNo 찾기)
    let naverOriginProductNo = null;
    
    if (searchResponse.data?.data?.naver?.found) {
      const naverProduct = searchResponse.data.data.naver.products[0];
      // originProductNo가 있으면 사용, 없으면 id 사용
      naverOriginProductNo = naverProduct.originProductNo || naverProduct.id;
      
      console.log('\n✅ Naver Product Found:');
      console.log('  Origin Product No:', naverOriginProductNo);
      console.log('  Name:', naverProduct.name);
    }
    
    // 4. 데이터베이스 업데이트
    if (shopifyProductName && naverOriginProductNo) {
      console.log('\n3. Updating database...');
      
      // 기존 매핑 삭제
      await ProductMapping.deleteMany({ sku: '2025080502' });
      
      // 새 매핑 생성 (상품 A와 동일한 구조)
      const newMapping = await ProductMapping.create({
        sku: '2025080502',
        productName: shopifyProductName, // Shopify 이름 사용!
        naverProductId: naverOriginProductNo, // originProductNo 사용
        shopifyProductId: shopifyProductId,
        shopifyVariantId: shopifyVariantId,
        vendor: 'album',
        priceMargin: 0,
        isActive: true,
        status: 'active',
        syncStatus: 'synced',
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      console.log('\n✅ Mapping updated successfully!');
      console.log('  Product Name:', newMapping.productName);
      console.log('  Naver Product ID:', newMapping.naverProductId);
      console.log('  Shopify Product ID:', newMapping.shopifyProductId);
      
      // 5. 재고 조정 테스트
      console.log('\n4. Testing inventory adjustment...');
      const adjustResponse = await axios.post(
        'http://localhost:3000/api/v1/inventory/2025080502/adjust',
        {
          platform: 'naver',
          adjustType: 'set',
          quantity: 50,
          reason: 'test',
          notes: 'Testing after fix'
        }
      );
      
      console.log('Adjust response:', JSON.stringify(adjustResponse.data, null, 2));
      
      if (adjustResponse.data?.data?.updateResults?.naver?.success) {
        console.log('\n✅ SUCCESS! Product B inventory adjustment is now working!');
      } else {
        console.log('\n⚠️ Inventory adjustment still has issues');
      }
    } else {
      console.log('\n❌ Missing required data to fix mapping');
    }
    
    await mongoose.disconnect();
    
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
    await mongoose.disconnect();
  }
}

fixProductB();