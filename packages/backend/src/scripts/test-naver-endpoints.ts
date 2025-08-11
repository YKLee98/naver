// test-naver-endpoints.ts
// 네이버 커머스 API 엔드포인트 테스트 스크립트

import axios from 'axios';

async function testNaverEndpoints() {
  const accessToken = '30i87bJLXfaVIHVRz9p7t'; // 로그에서 확인된 토큰
  const storeId = process.env.NAVER_STORE_ID || 'ncp_1o1cu7_01';

  // 테스트할 엔드포인트 목록
  const endpoints = [
    // 가능한 모든 엔드포인트 조합
    '/external/v1/products',
    '/external/v1/products/origin-products',
    '/external/v1/product-orders',
    '/external/v2/products',
    '/v1/products',
    '/v1/products/origin-products',
    '/v1/product-orders',
    '/v2/products',

    // 스토어 ID 포함 버전
    `/external/v1/seller/${storeId}/products`,
    `/external/v1/${storeId}/products`,
    `/v1/seller/${storeId}/products`,

    // 다른 가능한 경로들
    '/external/v1/pay-order/seller/products',
    '/external/v1/seller/products',
    '/external/v1/origin-products',
  ];

  console.log('🔍 네이버 커머스 API 엔드포인트 테스트 시작\n');
  console.log(`📍 Base URL: https://api.commerce.naver.com`);
  console.log(`🔑 Access Token: ${accessToken.substring(0, 10)}...`);
  console.log(`🏪 Store ID: ${storeId}\n`);
  console.log('='.repeat(60));

  for (const endpoint of endpoints) {
    const fullUrl = `https://api.commerce.naver.com${endpoint}`;

    try {
      console.log(`\n📌 테스트 중: ${endpoint}`);

      const response = await axios.get(fullUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        params: {
          page: 1,
          size: 1,
        },
        timeout: 5000,
        validateStatus: (status) => true, // 모든 상태 코드 허용
      });

      const status = response.status;

      if (status === 200) {
        console.log(`✅ 성공! Status: ${status}`);
        console.log(`   응답 구조:`);

        const data = response.data;
        if (data) {
          // 응답 데이터 구조 확인
          const keys = Object.keys(data).slice(0, 5);
          console.log(`   - 최상위 키: ${keys.join(', ')}`);

          if (data.contents) {
            console.log(`   - contents 배열 길이: ${data.contents.length}`);
          }
          if (data.content) {
            console.log(`   - content 배열 길이: ${data.content.length}`);
          }
          if (data.products) {
            console.log(`   - products 배열 길이: ${data.products.length}`);
          }
          if (data.items) {
            console.log(`   - items 배열 길이: ${data.items.length}`);
          }
          if (data.totalCount !== undefined) {
            console.log(`   - totalCount: ${data.totalCount}`);
          }
          if (data.totalElements !== undefined) {
            console.log(`   - totalElements: ${data.totalElements}`);
          }
        }

        // 성공한 엔드포인트 저장
        console.log(`\n🎉 올바른 엔드포인트 발견: ${endpoint}`);
        break;
      } else if (status === 401) {
        console.log(`⚠️  인증 실패 (401) - 토큰 만료 또는 잘못된 토큰`);
      } else if (status === 403) {
        console.log(`🔒 권한 없음 (403) - IP 화이트리스트 또는 권한 확인 필요`);
      } else if (status === 404) {
        console.log(`❌ Not Found (404) - 엔드포인트 존재하지 않음`);
      } else if (status === 429) {
        console.log(`⏱️  Rate Limit (429) - API 호출 제한 초과`);
      } else {
        console.log(`❓ 기타 응답: Status ${status}`);
        if (response.data) {
          console.log(
            `   메시지: ${response.data.message || JSON.stringify(response.data).substring(0, 100)}`
          );
        }
      }
    } catch (error: any) {
      console.log(`💥 에러 발생: ${error.message}`);

      if (error.code === 'ECONNREFUSED') {
        console.log(`   → 연결 거부됨 (서버 다운 또는 방화벽)`);
      } else if (error.code === 'ETIMEDOUT') {
        console.log(`   → 타임아웃 (네트워크 문제)`);
      }
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('테스트 완료!\n');

  // 추가 팁
  console.log('💡 팁:');
  console.log('1. 404 에러가 계속되면 네이버 커머스 API 센터에서 권한 확인');
  console.log('2. 403 에러는 IP 화이트리스트 설정 확인');
  console.log('3. 401 에러는 토큰 재발급 필요');
  console.log('4. API 문서: https://apicenter.commerce.naver.com/docs');
}

// 실행
testNaverEndpoints().catch(console.error);
