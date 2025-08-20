import axios from 'axios';
import crypto from 'crypto';

const config = {
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

async function getAccessToken() {
  const timestamp = Date.now();
  const signature = generateSignature(
    timestamp,
    'POST',
    '/v1/oauth2/token',
    config.clientSecret
  );

  try {
    const response = await axios.post(
      `${config.apiUrl}/v1/oauth2/token`,
      {
        type: 'SELF',
        grant_type: 'client_credentials'
      },
      {
        headers: {
          'Authorization': `CEA algorithm=HmacSHA256, access-key=${config.clientId}, secret-key=${config.clientSecret}, nonce=${timestamp}, signature=${signature}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return response.data.access_token;
  } catch (error) {
    console.error('Token error:', error.response?.data || error.message);
    throw error;
  }
}

async function searchProduct(token, sku) {
  try {
    const response = await axios.get(
      `${config.apiUrl}/v1/products/search`,
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
  } catch (error) {
    console.error('Search error:', error.response?.data || error.message);
    throw error;
  }
}

async function updateStock(token, originProductNo, quantity) {
  try {
    const response = await axios.patch(
      `${config.apiUrl}/v2/products/origin-products/${originProductNo}`,
      {
        stockQuantity: quantity
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return response.data;
  } catch (error) {
    console.error('Update error:', error.response?.data || error.message);
    return null;
  }
}

async function main() {
  console.log('🔍 Testing Naver Product B (SKU: 2025080502)\n');
  
  try {
    const token = await getAccessToken();
    console.log('✅ Token obtained successfully\n');
    
    // 상품 B 검색
    console.log('📋 Searching for Product B (SKU: 2025080502)...');
    const searchResult = await searchProduct(token, '2025080502');
    
    if (searchResult.contents && searchResult.contents.length > 0) {
      console.log(`Found ${searchResult.contents.length} products with SKU 2025080502:\n`);
      
      searchResult.contents.forEach((product, idx) => {
        console.log(`Product ${idx + 1}:`);
        console.log(`  Name: ${product.name}`);
        console.log(`  SKU: ${product.sellerManagementCode}`);
        console.log(`  channelProductNo: ${product.channelProductNo}`);
        console.log(`  originProductNo: ${product.originProductNo}`);
        console.log(`  Stock: ${product.stockQuantity}`);
        console.log(`  Status: ${product.statusType}`);
        
        // channelProducts 확인
        if (product.channelProducts && product.channelProducts.length > 0) {
          console.log('  Channel Products:');
          product.channelProducts.forEach(cp => {
            console.log(`    - channelNo: ${cp.channelProductNo}, stock: ${cp.stockQuantity}`);
          });
        }
        console.log('');
      });
      
      // 매핑된 channelProductNo와 일치하는 상품 찾기
      const mappedChannelNo = '12205984965';
      console.log(`🔍 Looking for product with channelProductNo: ${mappedChannelNo}`);
      
      let targetProduct = null;
      
      // 직접 channelProductNo 매칭
      targetProduct = searchResult.contents.find(p => 
        p.channelProductNo === mappedChannelNo
      );
      
      // channelProducts 내에서 매칭
      if (!targetProduct) {
        for (const product of searchResult.contents) {
          if (product.channelProducts && product.channelProducts.length > 0) {
            const hasChannel = product.channelProducts.some(cp => 
              cp.channelProductNo === mappedChannelNo
            );
            if (hasChannel) {
              targetProduct = product;
              break;
            }
          }
        }
      }
      
      if (targetProduct) {
        console.log(`\n✅ Found matching product!`);
        console.log(`  originProductNo: ${targetProduct.originProductNo}`);
        console.log(`  Current Stock: ${targetProduct.stockQuantity}`);
        
        // 재고 업데이트 테스트
        const newStock = 50;
        console.log(`\n🔄 Testing stock update to ${newStock}...`);
        
        const updateResult = await updateStock(token, targetProduct.originProductNo, newStock);
        if (updateResult) {
          console.log('✅ Stock update successful!');
        } else {
          console.log('❌ Stock update failed - check error logs above');
        }
      } else {
        console.log(`\n❌ No product found with channelProductNo ${mappedChannelNo}`);
        console.log('This is why Product B inventory adjustment is failing!');
        
        // 첫 번째 상품으로 테스트
        if (searchResult.contents.length > 0) {
          const firstProduct = searchResult.contents[0];
          console.log(`\n📌 Using first product for test:`);
          console.log(`  originProductNo: ${firstProduct.originProductNo}`);
          console.log(`  channelProductNo: ${firstProduct.channelProductNo}`);
          
          const newStock = 50;
          console.log(`\n🔄 Testing stock update to ${newStock}...`);
          
          const updateResult = await updateStock(token, firstProduct.originProductNo, newStock);
          if (updateResult) {
            console.log('✅ Stock update successful!');
            console.log('\n💡 Solution: Update the mapping to use channelProductNo:', firstProduct.channelProductNo);
          } else {
            console.log('❌ Stock update failed');
          }
        }
      }
    } else {
      console.log('❌ No products found with SKU 2025080502');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

main();