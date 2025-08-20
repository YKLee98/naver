import axios from 'axios';

async function testNaverStockDirect() {
  const baseUrl = 'http://localhost:3000/api/v1';
  const token = 'test-token';
  
  try {
    console.log('=== 네이버 재고 업데이트 직접 테스트 ===\n');
    
    // 1. SKU로 네이버 상품 검색 (매핑과 동일한 방식)
    const sku = '2025080501';
    console.log(`1. SKU ${sku}로 네이버 상품 검색...`);
    
    const searchRes = await axios.post(
      'http://localhost:3000/internal/naver/search',
      {
        searchKeyword: sku,
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
    ).catch(err => {
      console.log('Internal API 실패, 일반 API로 시도...');
      return null;
    });
    
    if (!searchRes) {
      // 대체 방법: 매핑 검색 API 사용
      const mappingSearchRes = await axios.get(
        `${baseUrl}/mappings/search-by-sku?sku=${sku}`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      
      console.log('\n네이버 검색 결과 (매핑 API):');
      const naverData = mappingSearchRes.data.data.naver;
      console.log('- Found:', naverData.found);
      console.log('- Products:', naverData.products?.length || 0);
      
      if (naverData.products && naverData.products.length > 0) {
        console.log('\n첫 번째 상품 정보:');
        const product = naverData.products[0];
        console.log('- ID:', product.id);
        console.log('- Name:', product.name);
        console.log('- Stock:', product.stockQuantity || product.stock);
        console.log('- OriginProductNo:', product.originProductNo);
        console.log('- ChannelProductNo:', product.channelProductNo);
      }
    }
    
    // 2. 재고 조정 시도 (다른 방법)
    console.log('\n2. 재고 조정 시도 (네이버만)...');
    const adjustRes = await axios.post(
      `${baseUrl}/inventory/${sku}/adjust`,
      {
        platform: 'naver',
        quantity: 50,
        adjustType: 'set',
        reason: 'Direct test'
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('\n조정 결과:');
    console.log('- Success:', adjustRes.data.success);
    console.log('- Naver Update:', adjustRes.data.data.updateResults.naver);
    
    // 3. 최종 재고 확인
    console.log('\n3. 최종 재고 확인...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const finalRes = await axios.get(
      `${baseUrl}/inventory/${sku}`,
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );
    
    console.log('최종 재고:');
    console.log('- Naver:', finalRes.data.data.naverQuantity);
    console.log('- Shopify:', finalRes.data.data.shopifyQuantity);
    
  } catch (error) {
    console.error('테스트 실패:', error.response?.data || error.message);
  }
}

testNaverStockDirect().catch(console.error);