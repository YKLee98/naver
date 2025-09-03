import axios from 'axios';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: './packages/backend/.env' });

const CLIENT_ID = process.env.NAVER_CLIENT_ID || '42g71Rui1jMS5KKHDyDhIO';
const CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET || '$2a$04$dqVRQvyZ./Bu0m4BDZh6eu';
const API_BASE_URL = 'https://api.commerce.naver.com';

console.log('🔍 Testing Naver API Authentication (Correct Method)\n');
console.log('CLIENT_ID:', CLIENT_ID);
console.log('CLIENT_SECRET:', CLIENT_SECRET.substring(0, 10) + '...');
console.log('CLIENT_SECRET is bcrypt hash:', CLIENT_SECRET.startsWith('$2'));

async function getAccessToken() {
  try {
    const timestamp = Date.now().toString();
    const password = `${CLIENT_ID}_${timestamp}`;
    
    // CLIENT_SECRET is already a bcrypt hash, use it to compare/verify
    // Generate new signature by comparing password with the hash
    const isValid = await bcrypt.compare(password, CLIENT_SECRET);
    console.log('\n📝 Password validation:', isValid ? 'Valid' : 'Invalid');
    
    // For Naver API, we need to generate a NEW hash from the password using the CLIENT_SECRET as salt
    // The CLIENT_SECRET acts as the salt pattern
    const signature = CLIENT_SECRET; // Use the CLIENT_SECRET directly as signature
    
    console.log('\n📝 Request Details:');
    console.log('Timestamp:', timestamp);
    console.log('Password:', password);
    console.log('Signature (using CLIENT_SECRET):', signature);
    
    // Try both methods
    console.log('\n📡 Method 1: Using CLIENT_SECRET directly as signature...');
    
    try {
      const params = new URLSearchParams({
        client_id: CLIENT_ID,
        timestamp: timestamp,
        client_secret_sign: CLIENT_SECRET, // Use CLIENT_SECRET directly
        grant_type: 'client_credentials',
        type: 'SELF',
      });
      
      const response = await axios.post(
        `${API_BASE_URL}/external/v1/oauth2/token`,
        params.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );
      
      console.log('\n✅ Method 1 Success! Access token obtained:');
      console.log('Token:', response.data.access_token?.substring(0, 50) + '...');
      console.log('Type:', response.data.token_type);
      console.log('Expires in:', response.data.expires_in, 'seconds');
      
      return response.data.access_token;
    } catch (error1) {
      console.log('Method 1 failed:', error1.response?.data?.message || error1.message);
      
      // Try method 2: Generate new bcrypt hash
      console.log('\n📡 Method 2: Generating new bcrypt hash...');
      
      // Extract salt from CLIENT_SECRET
      const salt = CLIENT_SECRET.substring(0, 29); // bcrypt salt is first 29 chars
      const newSignature = await bcrypt.hash(password, salt);
      
      console.log('New signature:', newSignature);
      
      const params2 = new URLSearchParams({
        client_id: CLIENT_ID,
        timestamp: timestamp,
        client_secret_sign: newSignature,
        grant_type: 'client_credentials',
        type: 'SELF',
      });
      
      const response2 = await axios.post(
        `${API_BASE_URL}/external/v1/oauth2/token`,
        params2.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );
      
      console.log('\n✅ Method 2 Success! Access token obtained:');
      console.log('Token:', response2.data.access_token?.substring(0, 50) + '...');
      console.log('Type:', response2.data.token_type);
      console.log('Expires in:', response2.data.expires_in, 'seconds');
      
      return response2.data.access_token;
    }
  } catch (error) {
    console.log('\n❌ Both methods failed:');
    if (error.response) {
      console.log('Status:', error.response.status);
      console.log('Response:', error.response.data);
    } else {
      console.log('Error:', error.message);
    }
    throw error;
  }
}

// Test product search with the token
async function searchProducts(token) {
  try {
    console.log('\n🔍 Testing product search for SKU: 2025080501');
    
    const response = await axios.get(
      `${API_BASE_URL}/external/v2/products/search`,
      {
        params: {
          searchKeyword: '2025080501',
          searchType: 'SELLER_MANAGEMENT_CODE',
          page: 1,
          size: 10
        },
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );
    
    console.log('\n✅ Products found:', response.data.contents?.length || 0);
    
    if (response.data.contents && response.data.contents.length > 0) {
      const product = response.data.contents[0];
      console.log('\nFirst product:');
      console.log('- Name:', product.name);
      console.log('- Product No:', product.originProductNo);
      console.log('- SKU:', product.sellerManagementCode);
      console.log('- Stock:', product.stockQuantity);
    }
    
    return response.data;
  } catch (error) {
    console.log('\n❌ Search error:', error.response?.data || error.message);
    throw error;
  }
}

// Run the test
async function main() {
  try {
    const token = await getAccessToken();
    await searchProducts(token);
  } catch (error) {
    console.log('\n❌ Test failed');
  }
}

main();