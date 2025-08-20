import axios from 'axios';
import bcrypt from 'bcryptjs';
import https from 'https';

const CLIENT_ID = '42g71Rui1jMS5KKHDyDhIO';
const CLIENT_SECRET = '$2a$04$dqVRQvyZ./Bu0m4BDZh6eu';

console.log('🔍 Debugging Naver API Call\n');
console.log('App Name: formaholic');
console.log('App ID:', CLIENT_ID);
console.log('App Secret:', CLIENT_SECRET.substring(0, 20) + '...');
console.log('');

// 여러 API 엔드포인트 테스트
const endpoints = [
  'https://api.commerce.naver.com/external/v1/oauth2/token',
  'https://api.commerce.naver.com/external/v2/oauth2/token',
  'https://api.commerce.naver.com/v1/oauth2/token',
];

async function testEndpoint(url) {
  console.log(`\n📡 Testing: ${url}`);
  console.log('='.repeat(60));
  
  const timestamp = Date.now();
  const password = CLIENT_ID + '_' + timestamp;
  const signature = bcrypt.hashSync(password, CLIENT_SECRET);
  
  // 여러 가지 파라미터 조합 시도
  const variations = [
    {
      name: 'Standard (type: SELF)',
      body: {
        client_id: CLIENT_ID,
        timestamp: timestamp,
        grant_type: 'client_credentials',
        client_secret_sign: signature,
        type: 'SELF'
      }
    },
    {
      name: 'With scope instead of type',
      body: {
        client_id: CLIENT_ID,
        timestamp: timestamp,
        grant_type: 'client_credentials',
        client_secret_sign: signature,
        scope: 'SELF'
      }
    },
    {
      name: 'With account_id',
      body: {
        client_id: CLIENT_ID,
        timestamp: timestamp,
        grant_type: 'client_credentials',
        client_secret_sign: signature,
        type: 'SELF',
        account_id: 'ncp_1o1cu7_01'
      }
    }
  ];
  
  for (const variation of variations) {
    console.log(`\nTrying: ${variation.name}`);
    console.log('Body:', JSON.stringify(variation.body, null, 2).substring(0, 200) + '...');
    
    try {
      const response = await axios.post(url, variation.body, {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 10000,
        validateStatus: () => true // Accept any status code
      });
      
      console.log(`Response Status: ${response.status}`);
      if (response.status === 200) {
        console.log('✅ SUCCESS!');
        console.log('Token:', response.data.access_token?.substring(0, 50) + '...');
        return response.data.access_token;
      } else {
        console.log('❌ Failed:', response.data.message || response.data);
      }
    } catch (error) {
      console.log('❌ Error:', error.message);
    }
  }
  
  return null;
}

async function main() {
  // Test all endpoints
  for (const endpoint of endpoints) {
    const token = await testEndpoint(endpoint);
    if (token) {
      console.log('\n\n✅ AUTHENTICATION SUCCESSFUL!');
      console.log('Working endpoint:', endpoint);
      break;
    }
  }
  
  // Also try with form-urlencoded
  console.log('\n\n📡 Testing with form-urlencoded');
  console.log('='.repeat(60));
  
  const timestamp = Date.now();
  const password = CLIENT_ID + '_' + timestamp;
  const signature = bcrypt.hashSync(password, CLIENT_SECRET);
  
  const params = new URLSearchParams();
  params.append('client_id', CLIENT_ID);
  params.append('timestamp', timestamp.toString());
  params.append('grant_type', 'client_credentials');
  params.append('client_secret_sign', signature);
  params.append('type', 'SELF');
  
  try {
    const response = await axios.post(
      'https://api.commerce.naver.com/external/v1/oauth2/token',
      params.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );
    
    console.log('✅ Form-urlencoded SUCCESS!');
    console.log('Token:', response.data.access_token);
  } catch (error) {
    console.log('❌ Form-urlencoded failed:', error.response?.data?.message || error.message);
  }
}

main().catch(console.error);