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

async function searchBySku(accessToken, sku) {
  try {
    const response = await axios.post(
      `${API_URL}/v1/products/search`,
      {
        searchType: 'SELLER_MANAGEMENT_CODE',
        searchKeyword: sku,
        page: 1,
        size: 20,
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
    return null;
  }
}

async function listAllProducts(accessToken) {
  try {
    const response = await axios.post(
      `${API_URL}/v1/products/search`,
      {
        page: 1,
        size: 100,
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
    console.error('Failed to list products:', error.response?.data || error.message);
    return null;
  }
}

async function main() {
  console.log('🔍 Checking Naver Product SKUs\n');
  
  try {
    console.log('📌 Getting access token...');
    const accessToken = await getAccessToken();
    console.log('✅ Access token obtained\n');
    
    // Test search for specific SKUs
    const testSkus = ['2025080501', '2025080502', '20250805'];
    
    for (const sku of testSkus) {
      console.log(`\n📦 Searching for: "${sku}"`);
      console.log('='.repeat(60));
      
      const result = await searchBySku(accessToken, sku);
      
      if (result && result.contents) {
        console.log(`Found ${result.contents.length} products:`);
        result.contents.forEach((product, index) => {
          console.log(`  ${index + 1}. SKU: "${product.sellerManagementCode}" | Name: "${product.name}"`);
        });
      } else {
        console.log('  No products found');
      }
    }
    
    // List all products to see actual SKUs
    console.log('\n\n📋 Listing ALL products to see actual SKUs:');
    console.log('='.repeat(60));
    
    const allProducts = await listAllProducts(accessToken);
    
    if (allProducts && allProducts.contents) {
      console.log(`Total products: ${allProducts.totalElements || allProducts.contents.length}\n`);
      
      // Filter products with SKUs starting with 20250805
      const relevantProducts = allProducts.contents.filter(p => 
        p.sellerManagementCode && p.sellerManagementCode.includes('20250805')
      );
      
      if (relevantProducts.length > 0) {
        console.log(`Products with '20250805' in SKU:`);
        relevantProducts.forEach((product, index) => {
          console.log(`  ${index + 1}. SKU: "${product.sellerManagementCode}" | Name: "${product.name}" | Stock: ${product.stockQuantity}`);
        });
      }
      
      // Show first 10 products with their SKUs
      console.log('\n\nFirst 10 products in your store:');
      allProducts.contents.slice(0, 10).forEach((product, index) => {
        console.log(`  ${index + 1}. SKU: "${product.sellerManagementCode}" | Name: "${product.name}"`);
      });
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
  }
}

main();