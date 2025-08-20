import axios from 'axios';
import bcrypt from 'bcryptjs';

const CLIENT_ID = '42g71Rui1jMS5KKHDyDhIO';
const CLIENT_SECRET = '$2a$04$dqVRQvyZ./Bu0m4BDZh6eu';

async function testAuth() {
  console.log('🔍 Testing Naver API Authentication\n');
  console.log('CLIENT_ID:', CLIENT_ID);
  console.log('CLIENT_SECRET:', CLIENT_SECRET);
  console.log('CLIENT_SECRET is bcrypt hash:', CLIENT_SECRET.startsWith('$2a'));
  
  const timestamp = Date.now();
  console.log('\nTimestamp:', timestamp);
  
  // Create password
  const password = `${CLIENT_ID}_${timestamp}`;
  console.log('Password (client_id_timestamp):', password);
  
  // Generate signature using bcrypt
  console.log('\n📝 Generating signature...');
  try {
    const signature = bcrypt.hashSync(password, CLIENT_SECRET);
    console.log('Signature generated:', signature);
    console.log('Signature length:', signature.length);
    
    // Prepare request data
    const requestData = {
      client_id: CLIENT_ID,
      timestamp: timestamp,
      grant_type: 'client_credentials',
      client_secret_sign: signature,
      type: 'SELF'
    };
    
    console.log('\n📤 Request data:');
    console.log(JSON.stringify(requestData, null, 2));
    
    // Make API call
    console.log('\n📡 Calling API...');
    const response = await axios.post(
      'https://api.commerce.naver.com/external/v1/oauth2/token',
      requestData,
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
    
    console.log('\n✅ Success!');
    console.log('Response:', response.data);
    
  } catch (error) {
    console.error('\n❌ Error occurred:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Response:', error.response.data);
    } else {
      console.error(error.message);
    }
  }
}

testAuth();