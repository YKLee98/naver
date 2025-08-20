import axios from 'axios';
import bcrypt from 'bcryptjs';

// 하드코딩된 값들
const CLIENT_ID = '42g71Rui1jMS5KKHDyDhIO';
const CLIENT_SECRET = '$2a$04$dqVRQvyZ./Bu0m4BDZh6eu';
const API_URL = 'https://api.commerce.naver.com/external';

console.log('🔍 Testing with hardcoded values\n');
console.log('CLIENT_ID:', CLIENT_ID);
console.log('CLIENT_ID length:', CLIENT_ID.length);
console.log('CLIENT_SECRET:', CLIENT_SECRET);
console.log('CLIENT_SECRET length:', CLIENT_SECRET.length);
console.log('');

async function test() {
  const timestamp = Date.now();
  const password = CLIENT_ID + '_' + timestamp;
  
  console.log('Timestamp:', timestamp);
  console.log('Password:', password);
  
  // bcrypt hash 생성
  const signature = bcrypt.hashSync(password, CLIENT_SECRET);
  console.log('Signature:', signature);
  console.log('');
  
  const requestBody = {
    client_id: CLIENT_ID,
    timestamp: timestamp,
    grant_type: 'client_credentials',
    client_secret_sign: signature,
    type: 'SELF'
  };
  
  console.log('Request Body:');
  console.log(JSON.stringify(requestBody, null, 2));
  console.log('');
  
  try {
    console.log('📡 Calling API...');
    const response = await axios.post(
      API_URL + '/v1/oauth2/token',
      requestBody,
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
    
    console.log('✅ SUCCESS!');
    console.log('Response:', response.data);
    
    // 토큰을 받았으면 상품 검색도 해보기
    if (response.data.access_token) {
      console.log('\n\n📦 Now searching for products with SKU 2025080501...');
      
      const searchResponse = await axios.post(
        API_URL + '/v1/products/search',
        {
          searchType: 'SELLER_MANAGEMENT_CODE',
          searchKeyword: '2025080501',
          page: 1,
          size: 10
        },
        {
          headers: {
            'Authorization': 'Bearer ' + response.data.access_token,
            'Content-Type': 'application/json',
          },
        }
      );
      
      console.log('\nSearch Results:');
      console.log('Total:', searchResponse.data.totalElements);
      console.log('Contents:', searchResponse.data.contents?.length || 0);
      
      if (searchResponse.data.contents) {
        console.log('\nProducts found:');
        searchResponse.data.contents.forEach((p, i) => {
          console.log(`${i+1}. SKU: "${p.sellerManagementCode}" | Name: "${p.name}"`);
        });
      }
    }
    
  } catch (error) {
    console.error('❌ ERROR:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    } else {
      console.error(error.message);
    }
  }
}

test();