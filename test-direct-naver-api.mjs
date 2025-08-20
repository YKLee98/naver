import axios from 'axios';

async function testDirectNaverAPI() {
  const baseUrl = 'http://localhost:3000';
  const token = 'test-token';
  
  try {
    console.log('=== 네이버 API 직접 테스트 ===\n');
    
    // 프록시 엔드포인트 생성 (임시)
    const testRes = await axios.post(
      `${baseUrl}/api/test/naver/search`,
      {
        searchKeyword: '2025080501',
        searchType: 'SELLER_MANAGEMENT_CODE',
        page: 1,
        size: 10
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    ).catch(async (err) => {
      // 실패 시 매핑 API 사용
      console.log('테스트 API 없음, 매핑 API 사용...\n');
      
      const mappingRes = await axios.get(
        `${baseUrl}/api/v1/mappings/search-by-sku?sku=2025080501`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      
      return { data: mappingRes.data.data.naver };
    });
    
    if (testRes.data.products) {
      const products = testRes.data.products;
      
      // EPR 테스트 상품 찾기
      const testProductA = products.find(p => p.id === 12205978733 || (p.name && p.name.includes('EPR 테스트용 상품 A')));
      const testProductB = products.find(p => p.id === 12205984965 || (p.name && p.name.includes('EPR 테스트용 상품 B')));
      
      console.log('=== EPR 테스트용 상품 A (ID: 12205978733) ===');
      if (testProductA) {
        console.log('찾은 필드들:');
        Object.keys(testProductA).forEach(key => {
          const value = testProductA[key];
          if (value !== undefined && value !== null && value !== '') {
            console.log(`  ${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`);
          }
        });
        
        // 네이버 API에서 사용 가능한 ID 확인
        const possibleIds = [
          testProductA.originProductNo,
          testProductA.channelProductNo,
          testProductA.productNo,
          testProductA.id,
          '12205978733'  // 매핑된 ID
        ].filter(id => id);
        
        console.log('\n사용 가능한 ID들:', possibleIds);
        
        // 어떤 ID를 originProductNo로 사용해야 하는지 판단
        const recommendedId = testProductA.originProductNo || testProductA.id || '12205978733';
        console.log('권장 originProductNo:', recommendedId);
      }
      
      console.log('\n=== EPR 테스트용 상품 B (ID: 12205984965) ===');
      if (testProductB) {
        console.log('찾은 필드들:');
        Object.keys(testProductB).forEach(key => {
          const value = testProductB[key];
          if (value !== undefined && value !== null && value !== '') {
            console.log(`  ${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`);
          }
        });
      }
    } else {
      console.log('상품 데이터를 가져올 수 없습니다.');
    }
    
  } catch (error) {
    console.error('테스트 실패:', error.message);
  }
}

testDirectNaverAPI().catch(console.error);