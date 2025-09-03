import axios from 'axios';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: './packages/backend/.env' });

const CLIENT_ID = process.env.NAVER_CLIENT_ID || '42g71Rui1jMS5KKHDyDhIO';
const CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET || '$2a$04$dqVRQvyZ./Bu0m4BDZh6eu';
const API_BASE_URL = 'https://api.commerce.naver.com';

console.log('🔍 Testing Naver API - Final Fix (with Base64)\n');
console.log('CLIENT_ID:', CLIENT_ID);
console.log('CLIENT_SECRET:', CLIENT_SECRET.substring(0, 10) + '...');

async function getAccessToken() {
  try {
    const timestamp = Date.now().toString();
    const password = `${CLIENT_ID}_${timestamp}`;
    
    // Generate bcrypt hash using CLIENT_SECRET as salt
    const hashed = bcrypt.hashSync(password, CLIENT_SECRET);
    
    // Convert to Base64 (this is what backend does!)
    const signature = Buffer.from(hashed).toString('base64');
    
    console.log('\n📝 Request Details:');
    console.log('Timestamp:', timestamp);
    console.log('Password:', password);
    console.log('Bcrypt Hash:', hashed);
    console.log('Base64 Signature:', signature);
    
    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      timestamp: timestamp,
      client_secret_sign: signature, // Use Base64 encoded signature
      grant_type: 'client_credentials',
      type: 'SELF',
    });
    
    console.log('\n📡 Calling Naver API...');
    
    const response = await axios.post(
      `${API_BASE_URL}/external/v1/oauth2/token`,
      params.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );
    
    console.log('\n✅ SUCCESS! Access token obtained:');
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

// Test product search
async function searchProducts(token) {
  try {
    // Try different search methods
    console.log('\n🔍 Method 1: Searching for exact SKU: 2025080501');
    
    let response = await axios.post(
      `${API_BASE_URL}/external/v1/products/search`,
      {
        searchKeyword: '2025080501',
        searchType: 'SELLER_MANAGEMENT_CODE',
        page: 1,
        size: 100
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );
    
    console.log('\n✅ Products found:', response.data.contents?.length || 0);
    
    if (response.data.contents && response.data.contents.length > 0) {
      console.log('\nSearching through all products for SKU...');
      response.data.contents.forEach((product, index) => {
        // Check in main product
        if (product.sellerManagementCode === '2025080501') {
          console.log(`\n✅ FOUND SKU in main product #${index + 1}!`);
          console.log('Product details:', JSON.stringify(product, null, 2));
        }
        
        // Check in channel products
        if (product.channelProducts) {
          product.channelProducts.forEach((cp, cpIndex) => {
            if (cp.sellerManagementCode === '2025080501') {
              console.log(`\n✅ FOUND SKU in channel product #${index + 1}-${cpIndex + 1}!`);
              console.log('Channel product details:', JSON.stringify(cp, null, 2));
            }
          });
        }
      });
    }
    
    // Try Method 2: Search without type
    console.log('\n🔍 Method 2: Searching without type specification');
    response = await axios.post(
      `${API_BASE_URL}/external/v1/products/search`,
      {
        searchKeyword: '2025080501',
        page: 1,
        size: 100
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );
    
    console.log('✅ Products found:', response.data.contents?.length || 0);
    
    // Try Method 3: List all products
    console.log('\n🔍 Method 3: Listing all products to find SKU');
    response = await axios.post(
      `${API_BASE_URL}/external/v1/products/search`,
      {
        page: 1,
        size: 100
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );
    
    console.log('✅ Total products:', response.data.contents?.length || 0);
    
    if (response.data.contents) {
      let foundSKU = false;
      response.data.contents.forEach((product) => {
        // Check main product
        if (product.sellerManagementCode === '2025080501') {
          console.log('\n✅ FOUND SKU 2025080501!');
          console.log('Product:', JSON.stringify(product, null, 2));
          foundSKU = true;
        }
        
        // Check channel products
        if (product.channelProducts) {
          product.channelProducts.forEach((cp) => {
            if (cp.sellerManagementCode === '2025080501') {
              console.log('\n✅ FOUND SKU 2025080501 in channel product!');
              console.log('Origin Product No:', product.originProductNo);
              console.log('Channel Product:', JSON.stringify(cp, null, 2));
              foundSKU = true;
            }
          });
        }
      });
      
      if (!foundSKU) {
        console.log('\n❌ SKU 2025080501 not found in any products');
        console.log('\nShowing all SKUs found:');
        response.data.contents.forEach((product, idx) => {
          if (product.sellerManagementCode) {
            console.log(`${idx + 1}. Main SKU: ${product.sellerManagementCode}`);
          }
          if (product.channelProducts) {
            product.channelProducts.forEach((cp) => {
              if (cp.sellerManagementCode) {
                console.log(`   - Channel SKU: ${cp.sellerManagementCode}`);
              }
            });
          }
        });
      }
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
    console.log('\n✅ Test completed successfully!');
  } catch (error) {
    console.log('\n❌ Test failed');
  }
}

main();