// packages/backend/src/config/index.ts
import * as dotenv from 'dotenv';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file from backend package root
dotenv.config({ path: resolve(__dirname, '../../.env') });

// Environment type
export type Environment = 'development' | 'production' | 'test';

// Configuration interface
export interface Config {
  env: Environment;
  isDevelopment: boolean;
  isProduction: boolean;
  isTest: boolean;
  
  server: {
    port: number;
    wsPort: number;
    host: string;
  };
  
  mongodb: {
    uri: string;
    options: {
      useNewUrlParser: boolean;
      useUnifiedTopology: boolean;
    };
  };
  
  redis: {
    host: string;
    port: number;
    password?: string;
    db: number;
  };
  
  jwt: {
    secret: string;
    expiresIn: string;
    refreshExpiresIn: string;
  };
  
  encryption: {
    key: string;
  };
  
  naver: {
    clientId: string;
    clientSecret: string;
    apiBaseUrl: string;
    storeId: string;
    webhookSecret?: string;
  };
  
  shopify: {
    storeDomain: string;
    accessToken?: string;
    apiVersion: string;
    apiKey?: string;
    apiSecret?: string;
    webhookSecret?: string;
  };
  
  api: {
    prefix: string;
    rateLimit: {
      windowMs: number;
      maxRequests: number;
    };
  };
  
  aws: {
    region: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    s3Bucket?: string;
    sqsQueueUrl?: string;
  };
  
  exchangeRate: {
    apiKey?: string;
    apiUrl: string;
  };
  
  misc: {
    corsOrigin: string | string[];
    logLevel: string;
    logDir: string;
  };
  
  features: {
    enableShopify: boolean;
    enableClustering: boolean;
    workerCount: number;
  };
}

// Helper function to get environment variable
function getEnv(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (value === undefined && defaultValue === undefined) {
    throw new Error(`Environment variable ${key} is not defined`);
  }
  return value || defaultValue || '';
}

// Helper function to get optional environment variable
function getOptionalEnv(key: string, defaultValue?: string): string | undefined {
  return process.env[key] || defaultValue;
}

// Helper function to get boolean environment variable
function getBoolEnv(key: string, defaultValue: boolean = false): boolean {
  const value = process.env[key];
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === 'true';
}

// Helper function to get integer environment variable
function getIntEnv(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

// Helper function to handle Naver Client Secret
function getNaverClientSecret(): string {
  const secret = process.env.NAVER_CLIENT_SECRET || '';
  
  // Check if it's a valid bcrypt salt
  if (secret.startsWith('$2a$') || secret.startsWith('$2b$')) {
    if (secret.length >= 29) {
      return secret;
    }
    console.warn('NAVER_CLIENT_SECRET appears to be truncated, using default value');
    return '$2a$04$dqVRQvyZ./Bu0m4BDZh6eu';
  }
  
  // If not bcrypt format, return as is or use default
  if (!secret) {
    console.warn('NAVER_CLIENT_SECRET not set, using default value');
    return '$2a$04$dqVRQvyZ./Bu0m4BDZh6eu';
  }
  
  return secret;
}

// Build configuration object
export const config: Config = {
  // Environment
  env: (process.env.NODE_ENV || 'development') as Environment,
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production',
  isTest: process.env.NODE_ENV === 'test',
  
  // Server configuration
  server: {
    port: getIntEnv('PORT', 3000),
    wsPort: getIntEnv('WS_PORT', 3001),
    host: getEnv('HOST', 'localhost'),
  },
  
  // MongoDB configuration
  mongodb: {
    uri: getEnv('MONGODB_URI', 'mongodb://localhost:27017/hallyu-fomaholic'),
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    },
  },
  
  // Redis configuration
  redis: {
    host: getEnv('REDIS_HOST', 'localhost'),
    port: getIntEnv('REDIS_PORT', 6379),
    password: getOptionalEnv('REDIS_PASSWORD'),
    db: getIntEnv('REDIS_DB', 0),
  },
  
  // JWT configuration
  jwt: {
    secret: getEnv('JWT_SECRET', 'your-super-secret-jwt-key-change-this-in-production'),
    expiresIn: getEnv('JWT_EXPIRES_IN', '7d'),
    refreshExpiresIn: getEnv('JWT_REFRESH_EXPIRES_IN', '30d'),
  },
  
  // Encryption configuration
  encryption: {
    key: getEnv('ENCRYPTION_KEY', 'your-encryption-key-32-characters'),
  },
  
  // Naver Commerce API configuration
  naver: {
    clientId: getEnv('NAVER_CLIENT_ID', '42g71Rui1jMS5KKHDyDhIO'),
    clientSecret: getNaverClientSecret(),
    apiBaseUrl: getEnv('NAVER_API_URL', 'https://api.commerce.naver.com'),
    storeId: getEnv('NAVER_STORE_ID', 'ncp_1o1cu7_01'),
    webhookSecret: getOptionalEnv('NAVER_WEBHOOK_SECRET'),
  },
  
  // Shopify API configuration
  shopify: {
    storeDomain: getEnv('SHOPIFY_SHOP_DOMAIN', 'hallyusuperstore19.myshopify.com'),
    accessToken: getOptionalEnv('SHOPIFY_ACCESS_TOKEN'),
    apiVersion: getEnv('SHOPIFY_API_VERSION', '2025-04'),
    apiKey: getOptionalEnv('SHOPIFY_API_KEY'),
    apiSecret: getOptionalEnv('SHOPIFY_API_SECRET'),
    webhookSecret: getOptionalEnv('SHOPIFY_WEBHOOK_SECRET'),
  },
  
  // API configuration
  api: {
    prefix: getEnv('API_PREFIX', '/api/v1'),
    rateLimit: {
      windowMs: getIntEnv('RATE_LIMIT_WINDOW_MS', 900000), // 15 minutes
      maxRequests: getIntEnv('RATE_LIMIT_MAX_REQUESTS', 100),
    },
  },
  
  // AWS configuration
  aws: {
    region: getEnv('AWS_REGION', 'ap-northeast-2'),
    accessKeyId: getOptionalEnv('AWS_ACCESS_KEY_ID'),
    secretAccessKey: getOptionalEnv('AWS_SECRET_ACCESS_KEY'),
    s3Bucket: getOptionalEnv('AWS_S3_BUCKET'),
    sqsQueueUrl: getOptionalEnv('AWS_SQS_QUEUE_URL'),
  },
  
  // Exchange Rate API configuration
  exchangeRate: {
    apiKey: getOptionalEnv('EXCHANGE_RATE_API_KEY'),
    apiUrl: getEnv('EXCHANGE_RATE_API_URL', 'https://api.exchangerate-api.com/v4/latest/KRW'),
  },
  
  // Miscellaneous configuration
  misc: {
    corsOrigin: process.env.CORS_ORIGIN ? 
      process.env.CORS_ORIGIN.split(',').map(origin => origin.trim()) : 
      ['http://localhost:5173'],
    logLevel: getEnv('LOG_LEVEL', 'debug'),
    logDir: getEnv('LOG_DIR', './logs'),
  },
  
  // Feature flags
  features: {
    enableShopify: getBoolEnv('ENABLE_SHOPIFY', true),
    enableClustering: getBoolEnv('ENABLE_CLUSTERING', false),
    workerCount: getIntEnv('WORKER_COUNT', 4),
  },
};

// Configuration validation function
export function validateConfig(): string[] {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Critical validations for production
  if (config.isProduction) {
    // JWT Secret validation
    if (config.jwt.secret === 'your-super-secret-jwt-key-change-this-in-production' || 
        config.jwt.secret.length < 32) {
      errors.push('JWT_SECRET must be changed and at least 32 characters in production');
    }
    
    // Encryption key validation
    if (config.encryption.key === 'your-encryption-key-32-characters' || 
        config.encryption.key.length !== 32) {
      errors.push('ENCRYPTION_KEY must be exactly 32 characters in production');
    }
    
    // MongoDB URI validation
    if (config.mongodb.uri.includes('localhost')) {
      warnings.push('Using localhost MongoDB in production');
    }
    
    // CORS validation
    if (config.misc.corsOrigin === '*') {
      warnings.push('CORS is set to allow all origins in production');
    }
  }
  
  // Naver API configuration validation
  if (!config.naver.clientId) {
    errors.push('NAVER_CLIENT_ID is required');
  }
  
  if (!config.naver.clientSecret || config.naver.clientSecret.length < 29) {
    warnings.push('NAVER_CLIENT_SECRET may be invalid or too short');
  }
  
  if (!config.naver.storeId) {
    errors.push('NAVER_STORE_ID is required');
  }
  
  // Shopify API configuration validation (if enabled)
  if (config.features.enableShopify) {
    if (!config.shopify.accessToken) {
      errors.push('SHOPIFY_ACCESS_TOKEN is required when ENABLE_SHOPIFY is true');
    }
    
    if (!config.shopify.storeDomain) {
      errors.push('SHOPIFY_SHOP_DOMAIN is required when ENABLE_SHOPIFY is true');
    }
  }
  
  // Port validation
  if (config.server.port < 1 || config.server.port > 65535) {
    errors.push(`Invalid PORT: ${config.server.port}. Must be between 1 and 65535`);
  }
  
  if (config.server.wsPort < 1 || config.server.wsPort > 65535) {
    errors.push(`Invalid WS_PORT: ${config.server.wsPort}. Must be between 1 and 65535`);
  }
  
  // Redis port validation
  if (config.redis.port < 1 || config.redis.port > 65535) {
    errors.push(`Invalid REDIS_PORT: ${config.redis.port}. Must be between 1 and 65535`);
  }
  
  // Log warnings
  warnings.forEach(warning => console.warn(`⚠️  ${warning}`));
  
  return errors;
}

// Log configuration on startup (with sensitive data masked)
if (config.isDevelopment) {
  console.log('📋 Configuration loaded:', {
    env: config.env,
    server: config.server,
    naver: {
      clientId: config.naver.clientId,
      clientSecretLength: config.naver.clientSecret.length,
      clientSecretPreview: config.naver.clientSecret.substring(0, 10) + '...',
      apiBaseUrl: config.naver.apiBaseUrl,
      storeId: config.naver.storeId,
    },
    shopify: {
      storeDomain: config.shopify.storeDomain,
      apiVersion: config.shopify.apiVersion,
      hasAccessToken: !!config.shopify.accessToken,
    },
    features: config.features,
  });
}

export default config;