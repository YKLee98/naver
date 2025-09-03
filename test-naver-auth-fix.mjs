import axios from 'axios';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: './packages/backend/.env' });

const CLIENT_ID = process.env.NAVER_CLIENT_ID || '42g71Rui1jMS5KKHDyDhIO';
const CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET || '$2a$04$dqVRQvyZ./Bu0m4BDZh6eu';
const API_BASE_URL = 'https://api.commerce.naver.com';

console.log('🔍 Testing Naver API Authentication (Fixed)\n');
console.log('CLIENT_ID:', CLIENT_ID);
console.log('CLIENT_SECRET:', CLIENT_SECRET.substring(0, 10) + '...');

async function getAccessToken() {
  try {
    const timestamp = Date.now().toString();
    const password = `${CLIENT_ID}_${timestamp}`;
    
    // Generate signature using bcrypt
    const signature = await bcrypt.hash(password, CLIENT_SECRET);
    
    console.log('\n📝 Request Details:');
    console.log('Timestamp:', timestamp);
    console.log('Signature:', signature);
    
    // Use URLSearchParams like the backend does
    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      timestamp: timestamp,
      client_secret_sign: signature,
      grant_type: 'client_credentials',
      type: 'SELF',
    });
    
    console.log('\n📡 Calling API...');
    
    const response = await axios.post(
      `${API_BASE_URL}/external/v1/oauth2/token`,
      params.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );
    
    console.log('\n✅ Success! Access token obtained:');
    console.log('Token:', response.data.access_token?.substring(0, 50) + '...');
    console.log('Type:', response.data.token_type);
    console.log('Expires in:', response.data.expires_in, 'seconds');
    
    return response.data.access_token;
  } catch (error) {
    console.log('\n❌ Error occurred:');
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