const mongoose = require('mongoose');

mongoose.connect('mongodb://localhost:27017/ERP_NAVER').then(async () => {
  const db = mongoose.connection.db;
  
  // 모든 매핑 데이터 확인
  const mappings = await db.collection('productmappings').find({}).toArray();
  console.log('Current mappings in DB:');
  mappings.forEach(m => {
    const naverPrice = m.pricing?.naver?.regular || 'N/A';
    const shopifyPrice = m.pricing?.shopify?.regular || 'N/A';
    console.log(`SKU: ${m.sku}, Naver: ${naverPrice}원, Shopify: $${shopifyPrice}`);
  });
  
  // 가격 업데이트
  await db.collection('productmappings').updateOne(
    { sku: '2025080501' },
    { 
      $set: {
        'pricing.naver.regular': 45000,
        'pricing.naver.sale': 42000,
        'pricing.shopify.regular': 35.99,
        'pricing.shopify.sale': 33.99
      }
    }
  );
  
  await db.collection('productmappings').updateOne(
    { sku: '2025080502' },
    { 
      $set: {
        'pricing.naver.regular': 38000,
        'pricing.naver.sale': 35000,
        'pricing.shopify.regular': 28.99,
        'pricing.shopify.sale': 26.99
      }
    }
  );
  
  console.log('\nUpdated prices:');
  const updated = await db.collection('productmappings').find({}).toArray();
  updated.forEach(m => {
    const naverRegular = m.pricing?.naver?.regular;
    const naverSale = m.pricing?.naver?.sale;
    const shopifyRegular = m.pricing?.shopify?.regular;
    const shopifySale = m.pricing?.shopify?.sale;
    console.log(`SKU: ${m.sku}, Naver: ${naverRegular}원 (sale: ${naverSale}원), Shopify: $${shopifyRegular} (sale: $${shopifySale})`);
  });
  
  mongoose.disconnect();
}).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});