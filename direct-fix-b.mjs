import mongoose from 'mongoose';
import axios from 'axios';
import crypto from 'crypto';

// Shopify 설정
const shopifyConfig = {
  shop: 'hallyusuperstore19.myshopify.com',
  accessToken: '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',
  apiVersion: '2025-04'
};

// 네이버 설정
const naverConfig = {
  clientId: '42g71Rui1jMS5KKHDyDhIO',
  clientSecret: '$2a$04$dqVRQvyZ./Bu0m4BDZh6eu',
  apiUrl: 'https://api.commerce.naver.com'
};

function generateSignature(timestamp, method, path, secretKey) {
  const message = `${timestamp}.${method}.${path}`;
  return crypto
    .createHmac('sha256', secretKey)
    .update(message)
    .digest('base64');
}

async function getNaverToken() {
  const timestamp = Date.now();
  const signature = generateSignature(
    timestamp,
    'POST',
    '/oauth2/token',
    naverConfig.clientSecret
  );

  const response = await axios.post(
    `${naverConfig.apiUrl}/oauth2/token`,
    {
      type: 'SELF',
      grant_type: 'client_credentials'
    },
    {
      headers: {
        'Authorization': `CEA algorithm=HmacSHA256, access-key=${naverConfig.clientId}, secret-key=${naverConfig.clientSecret}, nonce=${timestamp}, signature=${signature}`,
        'Content-Type': 'application/json'
      }
    }
  );
  return response.data.access_token;
}

async function searchNaverProduct(token, sku) {
  const response = await axios.get(
    `${naverConfig.apiUrl}/v1/products/search`,
    {
      params: {
        searchKeyword: sku,
        searchType: 'SELLER_MANAGEMENT_CODE',
        page: 1,
        size: 10
      },
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }
  );
  return response.data;
}

async function searchShopifyProduct(sku) {
  const url = `https://${shopifyConfig.shop}/admin/api/${shopifyConfig.apiVersion}/products.json`;
  const response = await axios.get(url, {
    params: {
      limit: 250
    },
    headers: {
      'X-Shopify-Access-Token': shopifyConfig.accessToken,
      'Content-Type': 'application/json'
    }
  });
  
  // SKU로 상품 찾기
  const products = response.data.products;
  for (const product of products) {
    for (const variant of product.variants) {
      if (variant.sku === sku) {
        return {
          product,
          variant
        };
      }
    }
  }
  return null;
}

async function main() {
  console.log('🔍 Finding and fixing Product B (SKU: 2025080502)\n');
  
  try {
    // 1. Shopify에서 찾기
    console.log('1. Searching in Shopify...');
    const shopifyResult = await searchShopifyProduct('2025080502');
    
    if (shopifyResult) {
      console.log('✅ Found in Shopify:');
      console.log('  Product ID:', `gid://shopify/Product/${shopifyResult.product.id}`);
      console.log('  Product Title:', shopifyResult.product.title);
      console.log('  Variant ID:', `gid://shopify/ProductVariant/${shopifyResult.variant.id}`);
      console.log('  SKU:', shopifyResult.variant.sku);
      console.log('  Inventory:', shopifyResult.variant.inventory_quantity);
    } else {
      console.log('❌ Not found in Shopify');
    }
    
    // 2. 네이버에서 찾기
    console.log('\n2. Searching in Naver...');
    const token = await getNaverToken();
    const naverResult = await searchNaverProduct(token, '2025080502');
    
    let naverOriginNo = null;
    let naverChannelNo = null;
    let naverProductName = null;
    
    if (naverResult.contents && naverResult.contents.length > 0) {
      const product = naverResult.contents[0];
      naverOriginNo = product.originProductNo;
      naverChannelNo = product.channelProductNo;
      naverProductName = product.name;
      
      console.log('✅ Found in Naver:');
      console.log('  Origin Product No:', naverOriginNo);
      console.log('  Channel Product No:', naverChannelNo);
      console.log('  Name:', naverProductName);
      console.log('  Stock:', product.stockQuantity);
    } else {
      console.log('❌ Not found in Naver');
    }
    
    // 3. MongoDB 업데이트
    if (shopifyResult && naverOriginNo) {
      console.log('\n3. Updating MongoDB...');
      
      await mongoose.connect('mongodb://localhost:27017/ERP_NAVER');
      
      const mappingSchema = new mongoose.Schema({}, { strict: false });
      const ProductMapping = mongoose.model('ProductMapping', mappingSchema, 'productmappings');
      
      // 기존 매핑 삭제
      await ProductMapping.deleteMany({ sku: '2025080502' });
      
      // 새 매핑 생성 (상품 A와 동일한 구조로)
      const newMapping = await ProductMapping.create({
        sku: '2025080502',
        productName: shopifyResult.product.title, // Shopify 이름 사용 (상품 A처럼)
        naverProductId: naverOriginNo, // originProductNo 사용
        shopifyProductId: `gid://shopify/Product/${shopifyResult.product.id}`,
        shopifyVariantId: `gid://shopify/ProductVariant/${shopifyResult.variant.id}`,
        vendor: shopifyResult.product.vendor || 'album',
        priceMargin: 0,
        isActive: true,
        status: 'active',
        inventory: {
          naver: {
            available: naverResult.contents[0]?.stockQuantity || 0,
            reserved: 0
          },
          shopify: {
            available: shopifyResult.variant.inventory_quantity || 0,
            reserved: 0
          },
          discrepancy: 0,
          lastSync: new Date(),
          syncStatus: 'synced'
        },
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      console.log('✅ Mapping created successfully!');
      console.log('  ID:', newMapping._id);
      console.log('  SKU:', newMapping.sku);
      console.log('  Product Name:', newMapping.productName);
      console.log('  Naver ID:', newMapping.naverProductId);
      console.log('  Shopify ID:', newMapping.shopifyProductId);
      
      await mongoose.disconnect();
    } else {
      console.log('\n❌ Cannot update - missing data');
    }
    
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

main();