import axios from 'axios';
import crypto from 'crypto';
import bcrypt from 'bcrypt';

// 네이버 상품 조회
async function getNaverProduct(sku) {
  const clientId = '42g71Rui1jMS5KKHDyDhIO';
  const clientSecret = '$2a$04$dqVRQvyZ./Bu0m4BDZh6eu';
  
  // 토큰 가져오기
  const timestamp = Date.now();
  const password = `${clientId}_${timestamp}`;
  const hashedPassword = await bcrypt.hash(password, clientSecret);
  const signature = Buffer.from(`${clientId}:${hashedPassword}`).toString('base64');
  
  console.log('네이버 API 인증 시도...');
  console.log('Client ID:', clientId);
  console.log('Timestamp:', timestamp);
  
  try {
    const tokenResponse = await axios.post(
      'https://api.commerce.naver.com/external/v1/oauth2/token',
      {
        client_id: clientId,
        timestamp: timestamp,
        client_secret_sign: hashedPassword,
        grant_type: 'client_credentials',
        type: 'SELF'
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
    
    const accessToken = tokenResponse.data.access_token;
    
    // 상품 검색
    const searchResponse = await axios.get(
      'https://api.commerce.naver.com/external/v2/products/search',
      {
        params: {
          searchKeyword: sku,
          searchType: 'SELLER_MANAGEMENT_CODE',
          page: 1,
          size: 10
        },
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );
    
    if (searchResponse.data.contents && searchResponse.data.contents.length > 0) {
      const product = searchResponse.data.contents[0];
      console.log(`네이버 상품 ${sku}:`);
      console.log(`  - 상품명: ${product.name}`);
      console.log(`  - 판매가: ${product.salePrice}원`);
      console.log(`  - 재고: ${product.stockQuantity}`);
      return product;
    } else {
      console.log(`네이버에서 ${sku} 상품을 찾을 수 없습니다.`);
    }
  } catch (error) {
    console.error(`네이버 API 오류:`, error.response?.data || error.message);
  }
}

// Shopify 상품 조회
async function getShopifyProduct(sku) {
  const storeDomain = 'hallyusuperstore19.myshopify.com';
  const accessToken = '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';
  
  try {
    // GraphQL로 SKU 검색
    const query = `
      query {
        productVariants(first: 10, query: "sku:${sku}") {
          edges {
            node {
              id
              sku
              title
              price
              inventoryQuantity
              product {
                title
              }
            }
          }
        }
      }
    `;
    
    const response = await axios.post(
      `https://${storeDomain}/admin/api/2025-01/graphql.json`,
      { query },
      {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
      }
    );
    
    if (response.data.data.productVariants.edges.length > 0) {
      const variant = response.data.data.productVariants.edges[0].node;
      console.log(`\nShopify 상품 ${sku}:`);
      console.log(`  - 상품명: ${variant.product.title}`);
      console.log(`  - 판매가: $${variant.price}`);
      console.log(`  - 재고: ${variant.inventoryQuantity}`);
      return variant;
    } else {
      console.log(`Shopify에서 ${sku} 상품을 찾을 수 없습니다.`);
    }
  } catch (error) {
    console.error(`Shopify API 오류:`, error.response?.data || error.message);
  }
}

// 메인 함수
async function checkPrices() {
  console.log('실시간 가격 조회 시작...\n');
  
  const skus = ['2025080501', '2025080502'];
  
  for (const sku of skus) {
    console.log(`\n========== ${sku} ==========`);
    await getNaverProduct(sku);
    await getShopifyProduct(sku);
  }
}

checkPrices().catch(console.error);