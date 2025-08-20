import axios from 'axios';

async function testNaverAPIStructure() {
  const baseUrl = 'http://localhost:3000/api/v1';
  const token = 'test-token';
  
  try {
    console.log('=== 네이버 API 구조 분석 ===\n');
    
    // 내부 네이버 API 직접 호출
    const headers = { 
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
    
    // 1. searchProducts API 호출 (백엔드 내부 API 사용)
    console.log('1. searchProducts API 호출...');
    const searchBody = {
      searchKeyword: '2025080501',
      searchType: 'SELLER_MANAGEMENT_CODE',
      page: 1,
      size: 10
    };
    
    // 프록시 API 호출
    const proxyRes = await axios.post(
      'http://localhost:3000/api/internal/naver/search',
      searchBody,
      { headers }
    ).catch(err => {
      console.log('내부 API 실패, 대체 방법 시도...');
      return null;
    });
    
    if (proxyRes) {
      console.log('검색 결과:', JSON.stringify(proxyRes.data, null, 2));
    }
    
    // 2. 매핑 API로 데이터 구조 확인
    console.log('\n2. 매핑 API로 네이버 데이터 구조 확인...');
    const mappingRes = await axios.get(
      `${baseUrl}/mappings/search-by-sku?sku=2025080501`,
      { headers }
    );
    
    if (mappingRes.data?.data?.naver?.products) {
      const products = mappingRes.data.data.naver.products;
      console.log(`\n찾은 상품 수: ${products.length}\n`);
      
      // EPR 테스트 상품 찾기
      const testProduct = products.find(p => p.name && p.name.includes('EPR 테스트용 상품 A'));
      
      if (testProduct) {
        console.log('EPR 테스트용 상품 A 전체 구조:');
        console.log(JSON.stringify(testProduct, null, 2));
        
        console.log('\n주요 필드:');
        console.log('- id:', testProduct.id);
        console.log('- productNo:', testProduct.productNo);
        console.log('- channelProductNo:', testProduct.channelProductNo);
        console.log('- originProductNo:', testProduct.originProductNo);
        console.log('- sellerManagementCode:', testProduct.sellerManagementCode);
        console.log('- name:', testProduct.name);
        console.log('- price:', testProduct.price);
        console.log('- salePrice:', testProduct.salePrice);
        console.log('- stockQuantity:', testProduct.stockQuantity);
        
        // 추가 필드 검사
        console.log('\n기타 필드:');
        Object.keys(testProduct).forEach(key => {
          if (!['id', 'productNo', 'channelProductNo', 'originProductNo', 
                'sellerManagementCode', 'name', 'price', 'salePrice', 'stockQuantity'].includes(key)) {
            console.log(`- ${key}:`, testProduct[key]);
          }
        });
      } else {
        console.log('EPR 테스트용 상품 A를 찾을 수 없음');
        console.log('\n모든 상품 이름:');
        products.forEach((p, i) => console.log(`${i+1}. ${p.name}`));
      }
    }
    
  } catch (error) {
    console.error('테스트 실패:', error.response?.data || error.message);
  }
}

testNaverAPIStructure().catch(console.error);