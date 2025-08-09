// packages/backend/src/scripts/test-shopify-api.ts
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
  const apiVersion = process.env.SHOPIFY_API_VERSION || '2025-04'; // 2025-04로 업데이트
  
  if (!shopDomain || !accessToken) {
    log('❌ SHOPIFY_SHOP_DOMAIN 또는 SHOPIFY_ACCESS_TOKEN이 설정되지 않았습니다.', colors.red);
    log('\n.env 파일 확인:', colors.yellow);
    log('SHOPIFY_SHOP_DOMAIN=yourstore.myshopify.com', colors.yellow);
    log('SHOPIFY_ACCESS_TOKEN=shpat_xxxxx', colors.yellow);
    log('SHOPIFY_API_VERSION=2025-04', colors.yellow);
    return;
  }
  
  log(`🏪 Shop: ${shopDomain}`, colors.blue);
  log(`🔑 Token: ${accessToken.substring(0, 10)}...`, colors.blue);
  log(`📦 API Version: ${apiVersion}`, colors.blue);
  
  // 1. REST API로 상품 목록 조회
  log('\n📌 REST API 테스트', colors.cyan);
  try {
    const restUrl = `https://${shopDomain}/admin/api/${apiVersion}/products.json`;
    log(`URL: ${restUrl}`, colors.blue);
    
    const restResponse = await axios.get(restUrl, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
      params: {
        limit: 5
      }
    });
    
    log(`✅ REST API 성공! 상품 수: ${restResponse.data.products.length}`, colors.green);
    
    if (restResponse.data.products.length > 0) {
      const product = restResponse.data.products[0];
      const variant = product.variants[0];
      log(`\n첫 번째 상품:`, colors.green);
      log(`  - Title: ${product.title}`, colors.green);
      log(`  - ID: ${product.id}`, colors.green);
      log(`  - Vendor: ${product.vendor}`, colors.green);
      log(`  - SKU: ${variant.sku || 'SKU 없음'}`, colors.yellow);
      log(`  - Price: ${variant.price}`, colors.green);
      log(`  - Inventory: ${variant.inventory_quantity}`, colors.green);
      
      // SKU가 없으면 경고
      if (!variant.sku) {
        log(`\n⚠️ 경고: 이 상품에 SKU가 설정되지 않았습니다!`, colors.yellow);
        log(`Shopify 관리자에서 상품 편집 > Inventory > SKU 필드에 값을 입력하세요.`, colors.yellow);
      }
    } else {
      log(`⚠️ Shopify 스토어에 상품이 없습니다.`, colors.yellow);
    }
  } catch (error: any) {
    log(`❌ REST API 실패: ${error.message}`, colors.red);
    if (error.response) {
      log(`Status: ${error.response.status}`, colors.red);
      log(`Data: ${JSON.stringify(error.response.data)}`, colors.red);
      
      if (error.response.status === 401) {
        log(`\n💡 인증 실패: Access Token이 잘못되었거나 만료되었습니다.`, colors.yellow);
      } else if (error.response.status === 404) {
        log(`\n💡 API 버전이 잘못되었을 수 있습니다. 현재: ${apiVersion}`, colors.yellow);
      }
    }
  }
  
  // 2. GraphQL API로 SKU 검색
  log('\n📌 GraphQL API 테스트', colors.cyan);
  const graphqlUrl = `https://${shopDomain}/admin/api/${apiVersion}/graphql.json`;
  log(`URL: ${graphqlUrl}`, colors.blue);
  
  // 테스트할 SKU 목록
  const testSkus = ['2025080501', 'TEST-SKU-001', 'ALBUM-001'];
  
  for (const testSku of testSkus) {
    try {
      log(`\n🔍 SKU 검색: ${testSku}`, colors.blue);
      
      const searchQuery = `
        query searchBySku($query: String!) {
          productVariants(first: 10, query: $query) {
            edges {
              node {
                id
                title
                sku
                price
                inventoryQuantity
                product {
                  id
                  title
                  vendor
                  productType
                }
              }
            }
          }
        }
      `;
      
      const searchResponse = await axios.post(
        graphqlUrl,
        {
          query: searchQuery,
          variables: {
            query: `sku:${testSku}`
          }
        },
        {
          headers: {
            'X-Shopify-Access-Token': accessToken,
            'Content-Type': 'application/json',
          }
        }
      );
      
      const variants = searchResponse.data.data?.productVariants?.edges || [];
      
      if (variants.length > 0) {
        log(`✅ SKU '${testSku}' 찾음! 결과 수: ${variants.length}`, colors.green);
        const variant = variants[0].node;
        log(`  - Product: ${variant.product.title}`, colors.green);
        log(`  - Variant: ${variant.title}`, colors.green);
        log(`  - Price: ${variant.price}`, colors.green);
        log(`  - Inventory: ${variant.inventoryQuantity}`, colors.green);
        log(`  - Vendor: ${variant.product.vendor}`, colors.green);
        break; // 하나라도 찾으면 중단
      } else {
        log(`❌ SKU '${testSku}'를 찾을 수 없습니다.`, colors.red);
      }
      
    } catch (error: any) {
      log(`❌ GraphQL 검색 실패 (${testSku}): ${error.message}`, colors.red);
    }
  }
  
  // 3. 전체 상품에서 SKU 목록 확인
  log(`\n📌 전체 상품 SKU 목록 확인`, colors.cyan);
  
  try {
    const listQuery = `
      query listProducts {
        products(first: 50) {
          edges {
            node {
              id
              title
              vendor
              variants(first: 10) {
                edges {
                  node {
                    id
                    sku
                    title
                    price
                    inventoryQuantity
                  }
                }
              }
            }
          }
        }
      }
    `;
    
    const listResponse = await axios.post(
      graphqlUrl,
      { query: listQuery },
      {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        }
      }
    );
    
    const products = listResponse.data.data?.products?.edges || [];
    log(`\n전체 상품 수: ${products.length}`, colors.blue);
    
    let totalSkus = 0;
    let albumProducts = 0;
    
    log('\nSKU가 있는 상품 목록:', colors.cyan);
    products.forEach((productEdge: any) => {
      const product = productEdge.node;
      const isAlbum = product.vendor?.toLowerCase() === 'album';
      
      if (isAlbum) {
        albumProducts++;
      }
      
      product.variants.edges.forEach((variantEdge: any) => {
        const variant = variantEdge.node;
        if (variant.sku) {
          totalSkus++;
          const vendorTag = isAlbum ? ' [ALBUM]' : '';
          log(`  SKU: ${variant.sku} - ${product.title} / ${variant.title}${vendorTag}`, 
              isAlbum ? colors.green : colors.blue);
        }
      });
    });
    
    log(`\n📊 통계:`, colors.cyan);
    log(`  - 전체 상품: ${products.length}개`, colors.blue);
    log(`  - Album 벤더 상품: ${albumProducts}개`, colors.green);
    log(`  - SKU가 있는 Variant: ${totalSkus}개`, colors.blue);
    
    if (totalSkus === 0) {
      log(`\n⚠️ 경고: SKU가 설정된 상품이 하나도 없습니다!`, colors.red);
      log(`Shopify 관리자에서 상품에 SKU를 추가해야 합니다.`, colors.yellow);
    }
    
  } catch (error: any) {
    log(`❌ 상품 목록 조회 실패: ${error.message}`, colors.red);
  }
  
  log('\n=== 테스트 완료 ===', colors.cyan);
  
  log('\n💡 체크리스트:', colors.yellow);
  log('1. ✅ Shopify 상품에 SKU가 설정되어 있는지 확인', colors.yellow);
  log('2. ✅ vendor가 "album"인 상품이 있는지 확인', colors.yellow);
  log('3. ✅ SHOPIFY_ACCESS_TOKEN이 올바른지 확인', colors.yellow);
  log('4. ✅ SHOPIFY_SHOP_DOMAIN이 올바른지 확인', colors.yellow);
  log('5. ✅ SHOPIFY_API_VERSION이 2025-04로 설정되어 있는지 확인', colors.yellow);
  
  log('\n📝 SKU 설정 방법:', colors.cyan);
  log('1. Shopify Admin > Products > 상품 선택', colors.blue);
  log('2. Inventory 섹션에서 "Track quantity" 체크', colors.blue);
  log('3. SKU 필드에 고유한 값 입력 (예: 2025080501)', colors.blue);
  log('4. Save 버튼 클릭', colors.blue);
}

// 실행
testShopifyAPI().catch(console.error);

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
  const apiVersion = process.env.SHOPIFY_API_VERSION || '2024-01';
  
  if (!shopDomain || !accessToken) {
    log('❌ SHOPIFY_SHOP_DOMAIN 또는 SHOPIFY_ACCESS_TOKEN이 설정되지 않았습니다.', colors.red);
    return;
  }
  
  log(`🏪 Shop: ${shopDomain}`, colors.blue);
  log(`🔑 Token: ${accessToken.substring(0, 10)}...`, colors.blue);
  log(`📦 API Version: ${apiVersion}`, colors.blue);
  
  // 1. REST API로 상품 목록 조회
  log('\n📌 REST API 테스트', colors.cyan);
  try {
    const restUrl = `https://${shopDomain}/admin/api/${apiVersion}/products.json`;
    const restResponse = await axios.get(restUrl, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
      params: {
        limit: 5
      }
    });
    
    log(`✅ REST API 성공! 상품 수: ${restResponse.data.products.length}`, colors.green);
    
    if (restResponse.data.products.length > 0) {
      const product = restResponse.data.products[0];
      const variant = product.variants[0];
      log(`첫 번째 상품:`, colors.green);
      log(`  - Title: ${product.title}`, colors.green);
      log(`  - ID: ${product.id}`, colors.green);
      log(`  - SKU: ${variant.sku || 'SKU 없음'}`, colors.green);
      log(`  - Price: ${variant.price}`, colors.green);
      log(`  - Inventory: ${variant.inventory_quantity}`, colors.green);
    }
  } catch (error: any) {
    log(`❌ REST API 실패: ${error.message}`, colors.red);
    if (error.response) {
      log(`Status: ${error.response.status}`, colors.red);
      log(`Data: ${JSON.stringify(error.response.data)}`, colors.red);
    }
  }
  
  // 2. GraphQL API로 SKU 검색
  log('\n📌 GraphQL API 테스트', colors.cyan);
  const graphqlUrl = `https://${shopDomain}/admin/api/${apiVersion}/graphql.json`;
  
  // 테스트할 SKU
  const testSku = '2025080501';
  
  try {
    // 2-1. productVariants 쿼리로 SKU 검색
    log(`\nSKU로 검색: ${testSku}`, colors.blue);
    
    const searchQuery = `
      query searchBySku($query: String!) {
        productVariants(first: 10, query: $query) {
          edges {
            node {
              id
              title
              sku
              price
              inventoryQuantity
              product {
                id
                title
                vendor
              }
            }
          }
        }
      }
    `;
    
    const searchResponse = await axios.post(
      graphqlUrl,
      {
        query: searchQuery,
        variables: {
          query: `sku:${testSku}`
        }
      },
      {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        }
      }
    );
    
    const variants = searchResponse.data.data?.productVariants?.edges || [];
    
    if (variants.length > 0) {
      log(`✅ SKU 검색 성공! 찾은 variant 수: ${variants.length}`, colors.green);
      variants.forEach((edge: any, index: number) => {
        const variant = edge.node;
        log(`\nVariant ${index + 1}:`, colors.green);
        log(`  - SKU: ${variant.sku}`, colors.green);
        log(`  - Title: ${variant.title}`, colors.green);
        log(`  - Product: ${variant.product.title}`, colors.green);
        log(`  - Price: ${variant.price}`, colors.green);
        log(`  - Inventory: ${variant.inventoryQuantity}`, colors.green);
      });
    } else {
      log(`⚠️ SKU '${testSku}'를 찾을 수 없습니다.`, colors.yellow);
      
      // 2-2. 전체 상품 목록에서 SKU 확인
      log(`\n전체 상품 목록 조회...`, colors.blue);
      
      const listQuery = `
        query listProducts {
          products(first: 10) {
            edges {
              node {
                id
                title
                variants(first: 10) {
                  edges {
                    node {
                      id
                      sku
                      title
                      price
                    }
                  }
                }
              }
            }
          }
        }
      `;
      
      const listResponse = await axios.post(
        graphqlUrl,
        { query: listQuery },
        {
          headers: {
            'X-Shopify-Access-Token': accessToken,
            'Content-Type': 'application/json',
          }
        }
      );
      
      const products = listResponse.data.data?.products?.edges || [];
      log(`\n전체 상품 수: ${products.length}`, colors.blue);
      
      let skuFound = false;
      products.forEach((productEdge: any) => {
        const product = productEdge.node;
        product.variants.edges.forEach((variantEdge: any) => {
          const variant = variantEdge.node;
          if (variant.sku) {
            log(`  SKU: ${variant.sku} - ${product.title} / ${variant.title}`, colors.blue);
            if (variant.sku === testSku) {
              skuFound = true;
              log(`    ⭐ 찾았습니다!`, colors.green);
            }
          }
        });
      });
      
      if (!skuFound) {
        log(`\n❌ SKU '${testSku}'가 Shopify에 존재하지 않습니다.`, colors.red);
        log(`💡 Shopify 관리자 페이지에서 상품에 SKU를 추가하세요.`, colors.yellow);
      }
    }
    
  } catch (error: any) {
    log(`❌ GraphQL API 실패: ${error.message}`, colors.red);
    if (error.response) {
      log(`Status: ${error.response.status}`, colors.red);
      if (error.response.data.errors) {
        log(`Errors: ${JSON.stringify(error.response.data.errors, null, 2)}`, colors.red);
      }
    }
  }
  
  log('\n=== 테스트 완료 ===', colors.cyan);
  
  log('\n💡 체크리스트:', colors.yellow);
  log('1. Shopify 상품에 SKU가 설정되어 있는지 확인', colors.yellow);
  log('2. SHOPIFY_ACCESS_TOKEN이 올바른지 확인', colors.yellow);
  log('3. SHOPIFY_SHOP_DOMAIN이 올바른지 확인 (예: myshop.myshopify.com)', colors.yellow);
  log('4. API 권한이 products 읽기/쓰기 권한을 포함하는지 확인', colors.yellow);
}

// 실행
testShopifyAPI().catch(console.error);