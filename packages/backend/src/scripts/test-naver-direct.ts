// packages/backend/src/scripts/test-naver-direct.ts
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

async function testNaverAPIDirect() {
  log('\n=== 네이버 API 직접 테스트 ===', colors.cyan);
  
  // 하드코딩된 토큰 사용 (로그에서 확인된 값)
  const accessToken = '30i87bJLXfaVIHVRz9p7t';
  
  log(`🔑 Access Token: ${accessToken}`, colors.blue);
  
  // 테스트할 엔드포인트들
  const tests = [
    {
      name: 'POST /v1/products/search (with commerce domain)',
      method: 'POST',
      url: 'https://api.commerce.naver.com/v1/products/search',
      data: { page: 1, size: 10 },
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      }
    },
    {
      name: 'POST /external/v1/products/search',
      method: 'POST',
      url: 'https://api.commerce.naver.com/external/v1/products/search',
      data: { page: 1, size: 10 },
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      }
    },
    {
      name: 'GET /v2/products/origin-products (목록)',
      method: 'GET',
      url: 'https://api.commerce.naver.com/v2/products/origin-products',
      params: { page: 1, size: 10 },
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      }
    },
    {
      name: 'GET /external/v1/products',
      method: 'GET',
      url: 'https://api.commerce.naver.com/external/v1/products',
      params: { page: 1, size: 10 },
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      }
    },
    {
      name: 'GET /external/v1/product-brands',
      method: 'GET',
      url: 'https://api.commerce.naver.com/external/v1/product-brands',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      }
    },
    {
      name: 'GET /v1/product-brands',
      method: 'GET',
      url: 'https://api.commerce.naver.com/v1/product-brands',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      }
    },
    {
      name: 'GET /v1/categories',
      method: 'GET',
      url: 'https://api.commerce.naver.com/v1/categories',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      }
    }
  ];
  
  log('\n테스트 시작...', colors.cyan);
  
  for (const test of tests) {
    log(`\n📌 테스트: ${test.name}`, colors.blue);
    log(`   URL: ${test.url}`, colors.blue);
    
    try {
      const config: any = {
        method: test.method,
        url: test.url,
        headers: test.headers,
        timeout: 10000,
        validateStatus: () => true // 모든 상태 코드 허용
      };
      
      if (test.method === 'POST' && test.data) {
        config.data = test.data;
      } else if (test.method === 'GET' && test.params) {
        config.params = test.params;
      }
      
      const response = await axios(config);
      
      const status = response.status;
      
      if (status === 200) {
        log(`   ✅ 성공! Status: ${status}`, colors.green);
        
        // 응답 구조 확인
        if (response.data) {
          const dataType = typeof response.data;
          log(`   응답 타입: ${dataType}`, colors.green);
          
          if (dataType === 'object') {
            const keys = Object.keys(response.data).slice(0, 10);
            log(`   응답 키: ${keys.join(', ')}`, colors.green);
            
            // 상품 데이터 확인
            if (response.data.contents) {
              log(`   상품 수: ${response.data.contents.length}`, colors.green);
            } else if (response.data.products) {
              log(`   상품 수: ${response.data.products.length}`, colors.green);
            } else if (response.data.items) {
              log(`   아이템 수: ${response.data.items.length}`, colors.green);
            } else if (Array.isArray(response.data)) {
              log(`   배열 길이: ${response.data.length}`, colors.green);
            }
          }
        }
        
        log(`\n   🎉 이 엔드포인트가 작동합니다!`, colors.green);
        log(`   사용할 URL: ${test.url}`, colors.green);
        log(`   Method: ${test.method}`, colors.green);
        
      } else if (status === 401) {
        log(`   ⚠️ 인증 실패 (401) - 토큰 만료 또는 잘못된 토큰`, colors.yellow);
      } else if (status === 403) {
        log(`   🔒 권한 없음 (403) - API 권한 확인 필요`, colors.yellow);
      } else if (status === 404) {
        log(`   ❌ Not Found (404)`, colors.red);
        
        // HTML 응답인지 JSON 응답인지 확인
        if (response.headers['content-type']?.includes('html')) {
          log(`   HTML 응답 - 잘못된 도메인이거나 프록시 문제`, colors.red);
        } else if (response.data?.code) {
          log(`   에러 코드: ${response.data.code}`, colors.red);
          log(`   메시지: ${response.data.message}`, colors.red);
        }
      } else if (status === 429) {
        log(`   ⏱️ Rate Limit (429) - API 호출 제한 초과`, colors.yellow);
      } else {
        log(`   ❓ Status: ${status}`, colors.yellow);
        if (response.data) {
          log(`   응답: ${JSON.stringify(response.data).substring(0, 200)}`, colors.yellow);
        }
      }
      
    } catch (error: any) {
      log(`   💥 에러: ${error.message}`, colors.red);
      
      if (error.code === 'ECONNREFUSED') {
        log(`   연결 거부 - 서버 다운 또는 방화벽`, colors.red);
      } else if (error.code === 'ETIMEDOUT') {
        log(`   타임아웃 - 네트워크 문제`, colors.red);
      }
    }
  }
  
  log('\n\n=== 테스트 완료 ===', colors.cyan);
  
  log('\n💡 디버깅 체크리스트:', colors.yellow);
  log('1. 네이버 커머스 API 센터에서 IP 화이트리스트 확인', colors.yellow);
  log('2. 토큰이 만료되지 않았는지 확인 (3시간 유효)', colors.yellow);
  log('3. API 권한이 제대로 승인되었는지 확인', colors.yellow);
  log('4. 네이버 스마트스토어에 실제 상품이 있는지 확인', colors.yellow);
  
  // 추가 테스트: 판매자 정보 API (권한 확인용)
  log('\n\n📌 추가 테스트: 판매자 정보 API (권한 확인)', colors.cyan);
  
  try {
    const sellerResponse = await axios.get('https://api.commerce.naver.com/external/v1/seller-info', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      validateStatus: () => true
    });
    
    if (sellerResponse.status === 200) {
      log('✅ 판매자 정보 API 성공 - 토큰과 권한이 정상입니다!', colors.green);
      if (sellerResponse.data?.sellerId) {
        log(`   판매자 ID: ${sellerResponse.data.sellerId}`, colors.green);
        log(`   스토어명: ${sellerResponse.data.storeName || 'N/A'}`, colors.green);
      }
    } else {
      log(`❌ 판매자 정보 API 실패: ${sellerResponse.status}`, colors.red);
    }
  } catch (error: any) {
    log(`❌ 판매자 정보 API 에러: ${error.message}`, colors.red);
  }
}

// 실행
testNaverAPIDirect().catch(console.error);