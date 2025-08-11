// ===== packages/backend/src/scripts/test-naver-api.ts =====
import axios from 'axios';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

// .env 파일 로드
dotenv.config({ path: resolve(__dirname, '../../.env') });

// 색상 출력을 위한 헬퍼
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(message: string, color: string = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

// 환경 변수 확인
function checkEnvironmentVariables() {
  log('\n=== 1. 환경 변수 확인 ===', colors.cyan);

  const requiredVars = [
    'NAVER_CLIENT_ID',
    'NAVER_CLIENT_SECRET',
    'NAVER_API_BASE_URL',
    'NAVER_STORE_ID',
  ];

  const envVars: Record<string, string | undefined> = {};
  let allPresent = true;

  for (const varName of requiredVars) {
    const value = process.env[varName];
    envVars[varName] = value;

    if (value) {
      log(
        `✅ ${varName}: ${varName.includes('SECRET') ? '[HIDDEN]' : value}`,
        colors.green
      );
    } else {
      log(`❌ ${varName}: 없음`, colors.red);
      allPresent = false;
    }
  }

  return { allPresent, envVars };
}

// bcrypt 기반 서명 생성 (네이버 API 스펙)
async function generateSignatureBcrypt(
  clientId: string,
  clientSecret: string,
  timestamp: string
): Promise<string> {
  log('\n=== 2. Bcrypt 서명 생성 테스트 ===', colors.cyan);

  try {
    const password = `${clientId}_${timestamp}`;
    log(`Input: ${password}`, colors.blue);

    // clientSecret이 이미 bcrypt salt라면 직접 사용
    if (clientSecret.startsWith('$2a$') || clientSecret.startsWith('$2b$')) {
      const hashed = await bcrypt.hash(password, clientSecret);
      log(`Bcrypt Hash: ${hashed}`, colors.blue);

      // Base64 인코딩
      const signature = Buffer.from(hashed).toString('base64');
      log(`Base64 Signature: ${signature}`, colors.green);

      return signature;
    } else {
      log(`⚠️ Client Secret이 bcrypt salt 형식이 아닙니다.`, colors.yellow);
      throw new Error('Invalid client secret format');
    }
  } catch (error: any) {
    log(`❌ Bcrypt 서명 생성 실패: ${error.message}`, colors.red);
    throw error;
  }
}

// HMAC-SHA256 기반 서명 생성 (대체 방법)
function generateSignatureHMAC(
  clientId: string,
  clientSecret: string,
  timestamp: string
): string {
  log('\n=== 3. HMAC-SHA256 서명 생성 테스트 ===', colors.cyan);

  try {
    const message = `${clientId}_${timestamp}`;
    log(`Input: ${message}`, colors.blue);

    // HMAC-SHA256 생성
    const hmac = crypto.createHmac('sha256', clientSecret);
    hmac.update(message);
    const signature = hmac.digest('base64');

    log(`HMAC-SHA256 Signature: ${signature}`, colors.green);

    return signature;
  } catch (error: any) {
    log(`❌ HMAC 서명 생성 실패: ${error.message}`, colors.red);
    throw error;
  }
}

// 액세스 토큰 요청 테스트
async function testAccessToken(
  clientId: string,
  clientSecret: string,
  apiBaseUrl: string,
  signature: string,
  timestamp: string,
  method: string
): Promise<string | null> {
  log(`\n=== 4. 액세스 토큰 요청 (${method}) ===`, colors.cyan);

  const tokenUrl = `${apiBaseUrl}/external/v1/oauth2/token`;

  const params = new URLSearchParams({
    client_id: clientId,
    timestamp: timestamp,
    client_secret_sign: signature,
    grant_type: 'client_credentials',
    type: 'SELF',
  });

  log(`URL: ${tokenUrl}`, colors.blue);
  log(`Parameters:`, colors.blue);
  params.forEach((value, key) => {
    if (key === 'client_secret_sign') {
      log(`  ${key}: ${value.substring(0, 20)}...`, colors.blue);
    } else {
      log(`  ${key}: ${value}`, colors.blue);
    }
  });

  try {
    const response = await axios.post(tokenUrl, params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      timeout: 15000,
    });

    log(`✅ 성공! Access Token: ${response.data.access_token}`, colors.green);
    log(`Token Type: ${response.data.token_type}`, colors.green);
    log(`Expires In: ${response.data.expires_in}`, colors.green);

    return response.data.access_token;
  } catch (error: any) {
    log(`❌ 실패!`, colors.red);

    if (error.response) {
      log(`Status: ${error.response.status}`, colors.red);
      log(`Status Text: ${error.response.statusText}`, colors.red);
      log(
        `Response Data: ${JSON.stringify(error.response.data, null, 2)}`,
        colors.red
      );

      // 네이버 API 에러 코드 해석
      if (error.response.data.code) {
        interpretNaverErrorCode(error.response.data.code);
      }
    } else if (error.request) {
      log(`요청이 전송되었지만 응답을 받지 못했습니다.`, colors.red);
      log(`Error: ${error.message}`, colors.red);
    } else {
      log(`요청 설정 중 오류 발생: ${error.message}`, colors.red);
    }

    return null;
  }
}

// 네이버 API 에러 코드 해석
function interpretNaverErrorCode(code: string) {
  const errorCodes: Record<string, string> = {
    INVALID_CLIENT: '클라이언트 ID가 잘못되었습니다.',
    INVALID_CLIENT_SECRET: '클라이언트 시크릿이 잘못되었습니다.',
    INVALID_SIGNATURE: '서명이 잘못되었습니다. 서명 생성 방식을 확인하세요.',
    INVALID_TIMESTAMP:
      '타임스탬프가 잘못되었습니다. 서버 시간과 동기화를 확인하세요.',
    EXPIRED_TIMESTAMP: '타임스탬프가 만료되었습니다. (5분 이내여야 함)',
    INVALID_GRANT_TYPE: 'grant_type이 잘못되었습니다.',
    UNAUTHORIZED: '인증 실패. 클라이언트 정보를 확인하세요.',
    'GW.AUTHN': '인증 실패',
    'GW.AUTHZ': '권한 부족',
    'GW.RATE_LIMIT': 'API 호출 제한 초과',
  };

  const message = errorCodes[code] || '알 수 없는 에러 코드';
  log(`에러 설명: ${message}`, colors.yellow);
}

// 상품 조회 API 테스트
async function testProductAPI(
  accessToken: string,
  apiBaseUrl: string
): Promise<boolean> {
  log('\n=== 5. 상품 조회 API 테스트 ===', colors.cyan);

  // 네이버 커머스 API v1 엔드포인트 사용
  const productUrl = `${apiBaseUrl}/external/v1/products`;
  log(`\n시도 중: ${productUrl}`, colors.blue);

  try {
    const response = await axios.get(productUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      params: {
        page: 1,
        size: 10,
      },
      timeout: 10000,
    });

    log(`✅ 상품 조회 성공!`, colors.green);

    if (response.data.totalCount !== undefined) {
      log(`전체 상품 수: ${response.data.totalCount}`, colors.green);
    }

    if (response.data.products && response.data.products.length > 0) {
      const product = response.data.products[0];
      log(`첫 번째 상품:`, colors.green);
      log(
        `  - ID: ${product.productId || product.originProductId}`,
        colors.green
      );
      log(`  - 이름: ${product.name}`, colors.green);
      log(
        `  - SKU: ${product.sellerManagementCode || product.sku}`,
        colors.green
      );
      log(`  - 가격: ${product.salePrice}원`, colors.green);
      log(`  - 재고: ${product.stockQuantity}개`, colors.green);
      log(`  - 상태: ${product.status}`, colors.green);
    } else {
      log(`상품이 없습니다. 상품을 먼저 등록해주세요.`, colors.yellow);
    }

    return true;
  } catch (error: any) {
    log(`❌ 상품 조회 실패!`, colors.red);

    if (error.response) {
      log(`Status: ${error.response.status}`, colors.red);
      log(
        `Response: ${JSON.stringify(error.response.data, null, 2)}`,
        colors.red
      );

      if (error.response.status === 403) {
        log(`💡 IP 화이트리스트 설정을 확인하세요.`, colors.yellow);
      } else if (error.response.status === 401) {
        log(`💡 액세스 토큰이 만료되었거나 잘못되었습니다.`, colors.yellow);
      }
    } else {
      log(`Error: ${error.message}`, colors.red);
    }

    return false;
  }
}

// 상품 등록 테스트
async function testProductCreate(
  accessToken: string,
  apiBaseUrl: string
): Promise<boolean> {
  log('\n=== 6. 상품 등록 테스트 ===', colors.cyan);

  const createUrl = `${apiBaseUrl}/external/v1/products`;

  const testProduct = {
    name: `테스트 상품 ${Date.now()}`,
    description: '테스트용 상품입니다',
    salePrice: 10000,
    categoryId: '50000000', // 예시 카테고리 ID
    stockQuantity: 100,
    sellerManagementCode: `TEST-SKU-${Date.now()}`,
    images: {
      representativeImage: {
        url: 'https://via.placeholder.com/500x500.png',
      },
    },
    detailContent: '<p>상품 상세 설명입니다.</p>',
    searchTags: ['테스트', '샘플'],
    attributes: {
      brand: '테스트 브랜드',
      manufacturer: '테스트 제조사',
    },
  };

  try {
    log(`상품 등록 시도...`, colors.blue);
    log(`상품명: ${testProduct.name}`, colors.blue);
    log(`SKU: ${testProduct.sellerManagementCode}`, colors.blue);

    const response = await axios.post(createUrl, testProduct, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    });

    log(`✅ 상품 등록 성공!`, colors.green);
    log(`생성된 상품 ID: ${response.data.productId}`, colors.green);

    return true;
  } catch (error: any) {
    log(`❌ 상품 등록 실패!`, colors.red);

    if (error.response) {
      log(`Status: ${error.response.status}`, colors.red);
      log(
        `Response: ${JSON.stringify(error.response.data, null, 2)}`,
        colors.red
      );

      if (error.response.data.errors) {
        log(`상세 에러:`, colors.red);
        error.response.data.errors.forEach((err: any) => {
          log(`  - ${err.field}: ${err.message}`, colors.red);
        });
      }
    } else {
      log(`Error: ${error.message}`, colors.red);
    }

    return false;
  }
}

// 메인 실행 함수
async function main() {
  log('\n========================================', colors.magenta);
  log('   네이버 커머스 API 연결 테스트 시작', colors.magenta);
  log('========================================', colors.magenta);

  // 1. 환경 변수 확인
  const { allPresent, envVars } = checkEnvironmentVariables();

  if (!allPresent) {
    log(
      '\n❌ 필수 환경 변수가 누락되었습니다. .env 파일을 확인하세요.',
      colors.red
    );
    log('\n📋 .env 파일 예시:', colors.yellow);
    log('NAVER_CLIENT_ID=your_client_id', colors.yellow);
    log('NAVER_CLIENT_SECRET=$2a$10$...your_bcrypt_salt...', colors.yellow);
    log('NAVER_API_BASE_URL=https://api.commerce.naver.com', colors.yellow);
    log('NAVER_STORE_ID=your_store_id', colors.yellow);
    process.exit(1);
  }

  const clientId = envVars.NAVER_CLIENT_ID!;
  const clientSecret = envVars.NAVER_CLIENT_SECRET!;
  const apiBaseUrl = envVars.NAVER_API_BASE_URL!;

  // 타임스탬프 생성 (밀리초)
  const timestamp = Date.now().toString();
  log(`\n📅 Timestamp: ${timestamp}`, colors.blue);

  // 2. 서명 생성 및 토큰 획득
  let accessToken: string | null = null;

  // Client Secret 형식 확인
  if (clientSecret.startsWith('$2a$') || clientSecret.startsWith('$2b$')) {
    // Bcrypt salt 형식인 경우
    try {
      const bcryptSignature = await generateSignatureBcrypt(
        clientId,
        clientSecret,
        timestamp
      );
      accessToken = await testAccessToken(
        clientId,
        clientSecret,
        apiBaseUrl,
        bcryptSignature,
        timestamp,
        'Bcrypt'
      );
    } catch (error: any) {
      log(`Bcrypt 방식 실패: ${error.message}`, colors.yellow);
    }
  } else {
    // 일반 시크릿인 경우 HMAC 시도
    log('\n💡 일반 시크릿 형식 감지, HMAC-SHA256 방식 시도...', colors.yellow);

    const hmacSignature = generateSignatureHMAC(
      clientId,
      clientSecret,
      timestamp
    );
    accessToken = await testAccessToken(
      clientId,
      clientSecret,
      apiBaseUrl,
      hmacSignature,
      timestamp,
      'HMAC-SHA256'
    );
  }

  // 3. 액세스 토큰이 있으면 API 테스트
  if (accessToken) {
    // 상품 조회 테스트
    const productListSuccess = await testProductAPI(accessToken, apiBaseUrl);

    // 상품 등록 테스트 (선택적)
    if (productListSuccess) {
      log(
        '\n상품 등록 테스트를 진행하시겠습니까? (실제 상품이 등록됩니다)',
        colors.yellow
      );
      log('테스트를 원하시면 코드에서 주석을 해제하세요.', colors.yellow);

      // 주석 해제하여 상품 등록 테스트 실행
      // await testProductCreate(accessToken, apiBaseUrl);
    }

    log('\n========================================', colors.magenta);
    log('   ✅ 테스트 완료 - API 연결 성공!', colors.green);
    log('========================================', colors.magenta);

    log('\n📊 다음 단계:', colors.cyan);
    log('1. 네이버 커머스 센터에서 상품 카테고리 ID 확인', colors.cyan);
    log('2. 실제 상품 데이터로 API 연동 구현', colors.cyan);
    log('3. 웹훅 설정으로 실시간 동기화 구현', colors.cyan);
    log('4. 에러 처리 및 재시도 로직 구현', colors.cyan);
  } else {
    log('\n========================================', colors.magenta);
    log('   ❌ 테스트 실패 - API 연결 실패', colors.red);
    log('========================================', colors.magenta);

    log('\n📋 확인 사항:', colors.yellow);
    log('1. 클라이언트 ID와 시크릿이 정확한지 확인하세요.', colors.yellow);
    log(
      '2. 네이버 커머스 센터에서 API 사용 권한이 있는지 확인하세요.',
      colors.yellow
    );
    log('3. IP 화이트리스트 설정이 필요할 수 있습니다.', colors.yellow);
    log('4. 클라이언트 시크릿 형식을 확인하세요:', colors.yellow);
    log('   - Bcrypt salt: $2a$10$... 또는 $2b$10$...', colors.yellow);
    log('   - 일반 시크릿: 영숫자 문자열', colors.yellow);
    log(
      '5. API 센터(https://apicenter.commerce.naver.com)에서 설정을 확인하세요.',
      colors.yellow
    );
  }
}

// 스크립트 실행
main().catch((error) => {
  log(`\n예기치 않은 오류: ${error.message}`, colors.red);
  process.exit(1);
});
