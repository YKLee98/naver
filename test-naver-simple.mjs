import axios from 'axios';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, 'packages/backend/.env') });

const CLIENT_ID = process.env.NAVER_CLIENT_ID;
const CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET;
const API_URL = 'https://api.commerce.naver.com/external';

async function getAccessToken() {
  const timestamp = Date.now();
  const password = `${CLIENT_ID}_${timestamp}`;
  const signature = bcrypt.hashSync(password, CLIENT_SECRET);
  
  try {
    const response = await axios.post(
      `${API_URL}/v1/oauth2/token`,
      {
        client_id: CLIENT_ID,
        timestamp: timestamp,
        grant_type: 'client_credentials',
        client_secret_sign: signature,
        type: 'SELF',
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
    
    return response.data.access_token;
  } catch (error) {
    console.error('Failed to get access token:', error.response?.data || error.message);
    throw error;
  }
}

async function searchProducts(accessToken, sku) {
  try {
    const response = await axios.post(
      `${API_URL}/v1/products/search`,
      {
        searchType: 'SELLER_MANAGEMENT_CODE',
        searchKeyword: sku,
        page: 1,
        size: 10,
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );
    
    return response.data;
  } catch (error) {
    console.error('Failed to search products:', error.response?.data || error.message);
    throw error;
  }
}

async function main() {
  console.log('🔍 Testing Naver API Search\n');
  console.log('CLIENT_ID:', CLIENT_ID);
  console.log('API_URL:', API_URL);
  console.log('');
  
  try {
    // Get access token
    console.log('📌 Getting access token...');
    const accessToken = await getAccessToken();
    console.log('✅ Access token obtained\n');
    
    // Test SKUs
    const testSkus = ['2025080501', '2025080502'];
    
    for (const sku of testSkus) {
      console.log(`\n📦 Searching for SKU: ${sku}`);
      console.log('='.repeat(50));
      
      const result = await searchProducts(accessToken, sku);
      
      console.log(`Total results: ${result.totalElements || 0}`);
      console.log(`Contents length: ${result.contents?.length || 0}`);
      
      if (result.contents && result.contents.length > 0) {
        console.log('\n📋 All products found:');
        result.contents.forEach((product, index) => {
          console.log(`  ${index + 1}. SKU: "${product.sellerManagementCode}" | Name: "${product.name}" | Stock: ${product.stockQuantity}`);
        });
        
        // Filter exact matches
        console.log('\n🎯 Exact matches only:');
        const exactMatches = result.contents.filter(p => p.sellerManagementCode === sku);
        if (exactMatches.length > 0) {
          exactMatches.forEach((product, index) => {
            console.log(`  ${index + 1}. SKU: "${product.sellerManagementCode}" | Name: "${product.name}" | Stock: ${product.stockQuantity}`);
          });
        } else {
          console.log('  ❌ No exact matches found');
        }
      } else {
        console.log('  ❌ No products found');
      }
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
  }
}

main();