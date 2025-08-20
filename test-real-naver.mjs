import axios from 'axios';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, 'packages/backend/.env') });

const CLIENT_ID = process.env.NAVER_CLIENT_ID;
const CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET;
const API_URL = 'https://api.commerce.naver.com/external';

class NaverAPI {
  constructor() {
    this.accessToken = null;
  }

  async getAccessToken() {
    if (this.accessToken) return this.accessToken;
    
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
          type: 'SELF'
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
      
      this.accessToken = response.data.access_token;
      console.log('✅ Token obtained successfully');
      return this.accessToken;
    } catch (error) {
      console.error('❌ Failed to get token:', error.response?.data || error.message);
      throw error;
    }
  }

  async searchProducts(sku) {
    const token = await this.getAccessToken();
    
    try {
      const response = await axios.post(
        `${API_URL}/v1/products/search`,
        {
          searchType: 'SELLER_MANAGEMENT_CODE',
          searchKeyword: sku,
          page: 1,
          size: 20
        },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      
      return response.data;
    } catch (error) {
      console.error('❌ Search failed:', error.response?.data || error.message);
      return null;
    }
  }
}

async function main() {
  console.log('🔍 Testing Real Naver API\n');
  console.log('CLIENT_ID:', CLIENT_ID);
  console.log('CLIENT_SECRET:', CLIENT_SECRET?.substring(0, 10) + '...');
  console.log('');
  
  const api = new NaverAPI();
  
  // Test specific SKU
  const testSku = '2025080501';
  console.log(`\n📦 Searching for SKU: "${testSku}"`);
  console.log('='.repeat(60));
  
  const result = await api.searchProducts(testSku);
  
  if (result && result.contents) {
    console.log(`\n✅ API Response received`);
    console.log(`Total elements: ${result.totalElements}`);
    console.log(`Page size: ${result.size}`);
    console.log(`Contents length: ${result.contents.length}`);
    
    console.log('\n📋 All products returned:');
    result.contents.forEach((product, idx) => {
      console.log(`\n  ${idx + 1}. Product Details:`);
      console.log(`     SKU (sellerManagementCode): "${product.sellerManagementCode}"`);
      console.log(`     Name: "${product.name}"`);
      console.log(`     Product No: ${product.productNo || product.originProductNo}`);
      console.log(`     Stock: ${product.stockQuantity}`);
      console.log(`     Status: ${product.statusType}`);
    });
    
    console.log('\n🎯 Checking for exact match:');
    const exactMatch = result.contents.find(p => p.sellerManagementCode === testSku);
    if (exactMatch) {
      console.log('✅ EXACT MATCH FOUND!');
      console.log('Product:', exactMatch);
    } else {
      console.log('❌ No exact match found');
      console.log('Unique SKUs found:', [...new Set(result.contents.map(p => p.sellerManagementCode))]);
    }
  } else {
    console.log('❌ No results or error occurred');
  }
}

main().catch(console.error);