import axios from 'axios';
import bcrypt from 'bcryptjs';

// 하드코딩된 값들
const CLIENT_ID = '42g71Rui1jMS5KKHDyDhIO';
const CLIENT_SECRET = '$2a$04$dqVRQvyZ./Bu0m4BDZh6eu';
const API_URL = 'https://api.commerce.naver.com/external';

console.log('🔍 Testing Naver Commerce API with correct parameters\n');
console.log('CLIENT_ID:', CLIENT_ID);
console.log('CLIENT_SECRET:', CLIENT_SECRET.substring(0, 15) + '...');
console.log('');

async function test() {
  const timestamp = Date.now();
  const password = CLIENT_ID + '_' + timestamp;
  
  console.log('Timestamp:', timestamp);
  console.log('Password:', password);
  
  // bcrypt hash 생성
  const signature = bcrypt.hashSync(password, CLIENT_SECRET);
  console.log('Signature:', signature);
  
  // Base64 인코딩
  const base64Signature = Buffer.from(signature).toString('base64');
  console.log('Base64 Signature:', base64Signature);
  console.log('');
  
  // 두 가지 방식 모두 테스트
  console.log('📡 Test 1: Using "type" parameter (current implementation)');
  try {
    const requestBody1 = {
      client_id: CLIENT_ID,
      timestamp: timestamp,
      grant_type: 'client_credentials',
      client_secret_sign: signature,  // raw bcrypt
      type: 'SELF'
    };
    
    console.log('Request:', JSON.stringify(requestBody1, null, 2));
    
    const response1 = await axios.post(
      API_URL + '/v1/oauth2/token',
      requestBody1,
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
    
    console.log('✅ SUCCESS with type parameter!');
    console.log('Token:', response1.data.access_token);
  } catch (error) {
    console.error('❌ Failed with type parameter:', error.response?.data?.message || error.message);
  }
  
  console.log('\n📡 Test 2: Using "scope" parameter (documentation)');
  try {
    const requestBody2 = {
      client_id: CLIENT_ID,
      timestamp: timestamp,
      grant_type: 'client_credentials',
      client_secret_sign: signature,  // raw bcrypt
      scope: 'SELF'
    };
    
    console.log('Request:', JSON.stringify(requestBody2, null, 2));
    
    const response2 = await axios.post(
      API_URL + '/v1/oauth2/token',
      requestBody2,
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
    
    console.log('✅ SUCCESS with scope parameter!');
    console.log('Token:', response2.data.access_token);
  } catch (error) {
    console.error('❌ Failed with scope parameter:', error.response?.data?.message || error.message);
  }
  
  console.log('\n📡 Test 3: Using Base64 encoded signature');
  try {
    const requestBody3 = {
      client_id: CLIENT_ID,
      timestamp: timestamp,
      grant_type: 'client_credentials',
      client_secret_sign: base64Signature,  // base64 encoded
      type: 'SELF'
    };
    
    console.log('Request:', JSON.stringify(requestBody3, null, 2));
    
    const response3 = await axios.post(
      API_URL + '/v1/oauth2/token',
      requestBody3,
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
    
    console.log('✅ SUCCESS with Base64 encoding!');
    console.log('Token:', response3.data.access_token);
  } catch (error) {
    console.error('❌ Failed with Base64 encoding:', error.response?.data?.message || error.message);
  }
  
  console.log('\n📡 Test 4: Using application/x-www-form-urlencoded');
  try {
    const params = new URLSearchParams();
    params.append('client_id', CLIENT_ID);
    params.append('timestamp', timestamp.toString());
    params.append('grant_type', 'client_credentials');
    params.append('client_secret_sign', signature);
    params.append('type', 'SELF');
    
    console.log('Request params:', params.toString());
    
    const response4 = await axios.post(
      API_URL + '/v1/oauth2/token',
      params,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );
    
    console.log('✅ SUCCESS with form-urlencoded!');
    console.log('Token:', response4.data.access_token);
  } catch (error) {
    console.error('❌ Failed with form-urlencoded:', error.response?.data?.message || error.message);
  }
}

test().catch(console.error);