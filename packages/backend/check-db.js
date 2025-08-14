const mongoose = require('mongoose');

mongoose.connect('mongodb://localhost:27017/ERP_NAVER').then(async () => {
  const db = mongoose.connection.db;
  
  // Check product_mappings collection
  const mappings = await db.collection('product_mappings').find({}).limit(5).toArray();
  console.log('Product Mappings found:', mappings.length);
  
  mappings.forEach((m, i) => {
    console.log(`\n===== Product ${i+1} =====`);
    console.log('SKU:', m.sku);
    console.log('Product Name:', m.productName);
    console.log('Naver Product ID:', m.naverProductId);
    console.log('Shopify Product ID:', m.shopifyProductId);
    
    if (m.pricing) {
      console.log('Pricing:', JSON.stringify(m.pricing, null, 2));
    }
    
    // Check for other price-related fields
    if (m.naverPrice) console.log('Naver Price:', m.naverPrice);
    if (m.shopifyPrice) console.log('Shopify Price:', m.shopifyPrice);
    if (m.priceMargin) console.log('Price Margin:', m.priceMargin);
    if (m.exchangeRate) console.log('Exchange Rate:', m.exchangeRate);
  });
  
  // Check if there's a separate pricing collection
  const pricingData = await db.collection('pricing').find({}).limit(3).toArray();
  if (pricingData.length > 0) {
    console.log('\n\n===== Pricing Collection Data =====');
    console.log(JSON.stringify(pricingData, null, 2));
  }
  
  // Check pricehistories collection
  const priceHistories = await db.collection('pricehistories').find({}).limit(3).toArray();
  if (priceHistories.length > 0) {
    console.log('\n\n===== Price Histories Collection Data =====');
    console.log(JSON.stringify(priceHistories, null, 2));
  }
  
  process.exit(0);
}).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});