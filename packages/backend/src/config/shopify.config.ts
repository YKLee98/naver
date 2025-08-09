// packages/backend/src/config/shopify.config.ts
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from multiple possible locations
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config(); // Load from default location

export const shopifyConfig = {
  // Store configuration - 환경 변수 이름 확인
  storeDomain: process.env.SHOPIFY_STORE_DOMAIN || 
               process.env.SHOPIFY_SHOP_DOMAIN || 
               'hallyusuperstore19.myshopify.com',
  
  accessToken: process.env.SHOPIFY_ACCESS_TOKEN || 
               process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || 
               process.env.SHOPIFY_TOKEN || 
               '',
  
  apiKey: process.env.SHOPIFY_API_KEY || 
          process.env.SHOPIFY_APP_KEY || 
          '',
  
  apiSecret: process.env.SHOPIFY_API_SECRET || 
             process.env.SHOPIFY_SECRET_KEY || 
             '',
  
  // API configuration
  apiVersion: '2025-04',
  scopes: [
    'read_products',
    'write_products',
    'read_inventory',
    'write_inventory',
    'read_orders',
    'write_orders',
    'read_locations'
  ],
  
  // Webhook configuration
  webhooks: {
    path: '/api/webhooks',
    webhookHandlers: {
      'ORDERS_CREATE': '/api/webhooks/orders/create',
      'ORDERS_UPDATED': '/api/webhooks/orders/update',
      'PRODUCTS_UPDATE': '/api/webhooks/products/update',
      'INVENTORY_LEVELS_UPDATE': '/api/webhooks/inventory/update'
    }
  },

  // Rate limiting
  rateLimit: {
    maxRetries: 3,
    retryDelay: 1000,
    maxRequestsPerSecond: 2
  }
};

// Validate configuration
export function validateShopifyConfig(): boolean {
  const required = ['storeDomain', 'accessToken'];
  const missing: string[] = [];

  for (const key of required) {
    if (!shopifyConfig[key as keyof typeof shopifyConfig]) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    console.error('Missing required Shopify configuration:', missing.join(', '));
    console.log('Environment variables found:', {
      SHOPIFY_STORE_DOMAIN: !!process.env.SHOPIFY_STORE_DOMAIN,
      SHOPIFY_ACCESS_TOKEN: !!process.env.SHOPIFY_ACCESS_TOKEN,
      SHOPIFY_ADMIN_ACCESS_TOKEN: !!process.env.SHOPIFY_ADMIN_ACCESS_TOKEN,
      SHOPIFY_API_KEY: !!process.env.SHOPIFY_API_KEY,
      SHOPIFY_API_SECRET: !!process.env.SHOPIFY_API_SECRET,
    });
    console.log('Current config:', {
      storeDomain: shopifyConfig.storeDomain,
      hasAccessToken: !!shopifyConfig.accessToken,
      accessTokenLength: shopifyConfig.accessToken?.length || 0,
      hasApiKey: !!shopifyConfig.apiKey,
      hasApiSecret: !!shopifyConfig.apiSecret
    });
    return false;
  }

  console.log('Shopify configuration validated successfully:', {
    storeDomain: shopifyConfig.storeDomain,
    apiVersion: shopifyConfig.apiVersion,
    hasCredentials: !!shopifyConfig.accessToken
  });

  return true;
}