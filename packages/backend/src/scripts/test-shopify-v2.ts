// packages/backend/src/scripts/test-shopify-v2.ts
import axios from 'axios';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// ES 모듈에서 __dirname 대체
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// .env 파일 로드
dotenv.config({ path: resolve(__dirname, '../../.env') });

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message: string, color: string = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

async function testShopifyAPI() {
  log('\n=== Shopify API 테스트 시작 ===', colors.cyan);
  
  const shopDomain = process.env.SHOPIFY_SHOP_DOMAIN;
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;
  const apiVersion = process.env.SHOPIFY_API_VERSION || '2025-04';
  
  if (!shopDomain || !accessToken) {
    log('❌ 환경 변수가 설정되지 않았습니다.', colors.red);
    log('SHOPIFY_SHOP_DOMAIN=' + (shopDomain || 'NOT_SET'), colors.yellow);
    log('SHOPIFY_ACCESS_TOKEN=' + (accessToken ? 'SET' : 'NOT_SET'), colors.yellow);
    return;
  }
  
  log(`🏪 Shop: ${shopDomain}`, colors.blue);
  log(`📦 API Version: ${apiVersion}`, colors.blue);
  
  // REST API 테스트
  log('\n📌 REST API 테스트', colors.cyan);
  try {
    const restUrl = `https://${shopDomain}/admin/api/${apiVersion}/products.json`;
    const restResponse = await axios.get(restUrl, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
      params: { limit: 5 }
    });
    
    log(`✅ 상품 수: ${restResponse.data.products.length}`, colors.green);
    
    if (restResponse.data.products.length > 0) {
      const product = restResponse.data.products[0];
      const variant = product.variants[0];
      log(`\n첫 번째 상품:`, colors.green);
      log(`  - Title: ${product.title}`, colors.green);
      log(`  - Vendor: ${product.vendor}`, colors.green);
      log(`  - SKU: ${variant.sku || 'SKU 없음'}`, colors.yellow);
    }
  } catch (error: any) {
    log(`❌ REST API 실패: ${error.message}`, colors.red);
  }
  
  // GraphQL 테스트
  log('\n📌 GraphQL SKU 검색', colors.cyan);
  const graphqlUrl = `https://${shopDomain}/admin/api/${apiVersion}/graphql.json`;
  
  try {
    const query = `
      query {
        products(first: 10) {
          edges {
            node {
              id
              title
              vendor
              variants(first: 5) {
                edges {
                  node {
                    sku
                    price
                  }
                }
              }
            }
          }
        }
      }
    `;
    
    const response = await axios.post(
      graphqlUrl,
      { query },
      {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        }
      }
    );
    
    const products = response.data.data?.products?.edges || [];
    log(`\n전체 상품: ${products.length}개`, colors.blue);
    
    let skuCount = 0;
    products.forEach((p: any) => {
      const product = p.node;
      product.variants.edges.forEach((v: any) => {
        if (v.node.sku) {
          skuCount++;
          log(`  SKU: ${v.node.sku} - ${product.title}`, colors.green);
        }
      });
    });
    
    if (skuCount === 0) {
      log(`\n⚠️ SKU가 설정된 상품이 없습니다!`, colors.red);
    }
    
  } catch (error: any) {
    log(`❌ GraphQL 실패: ${error.message}`, colors.red);
  }
  
  log('\n=== 테스트 완료 ===', colors.cyan);
}

// 실행
testShopifyAPI().catch(console.error);