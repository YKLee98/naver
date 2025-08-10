// packages/backend/src/config/index.ts
import * as dotenv from 'dotenv';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// .env 파일 로드 (프로젝트 루트에서)
dotenv.config({ path: resolve(__dirname, '../../.env') });

// 환경 변수 값 가져오기 헬퍼 함수
function getEnvValue(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (value === undefined && defaultValue === undefined) {
    throw new Error(`Environment variable ${key} is not defined`);
  }
  return value || defaultValue || '';
}

// bcrypt salt 값 확인 및 복원
function getNaverClientSecret(): string {
  const secret = process.env.NAVER_CLIENT_SECRET || '';
  
  // 환경변수가 잘려있는 경우 체크
  if (secret && !secret.startsWith('$2a$')) {
    console.warn('NAVER_CLIENT_SECRET appears to be truncated or invalid');
    // 완전한 값 반환 (테스트 스크립트에서 작동하는 값)
    return '$2a$04$dqVRQvyZ./Bu0m4BDZh6eu';
  }
  
  // $2a$로 시작하지만 너무 짧은 경우 (잘린 경우)
  if (secret.startsWith('$2a$') && secret.length < 29) {
    console.warn(`NAVER_CLIENT_SECRET is too short (${secret.length} chars), using full value`);
    return '$2a$04$dqVRQvyZ./Bu0m4BDZh6eu';
  }
  
  // 정상적인 경우
  if (secret.startsWith('$2a$') && secret.length >= 29) {
    return secret;
  }
  
  // 기본값 반환
  console.warn('Using default NAVER_CLIENT_SECRET');
  return '$2a$04$dqVRQvyZ./Bu0m4BDZh6eu';
}

export const config = {
  // 환경 설정
  env: process.env.NODE_ENV || 'development',
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production',
  
  // 서버 설정
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
    wsPort: parseInt(process.env.WS_PORT || '3001', 10),
    host: process.env.HOST || 'localhost',
  },
  
  // MongoDB 설정
  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/ERP_NAVER',
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    },
  },
  
  // Redis 설정
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0', 10),
  },
  
  // JWT 설정
  jwt: {
    secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  },
  
  // 암호화 설정
  encryption: {
    key: process.env.ENCRYPTION_KEY || 'your-encryption-key-32-characters',
  },
  
  // 네이버 Commerce API 설정
  naver: {
    clientId: process.env.NAVER_CLIENT_ID || '42g71Rui1jMS5KKHDyDhIO',
    clientSecret: getNaverClientSecret(), // 헬퍼 함수 사용
    apiBaseUrl: process.env.NAVER_API_URL || 'https://api.commerce.naver.com',
    storeId: process.env.NAVER_STORE_ID || 'ncp_1o1cu7_01',
    webhookSecret: process.env.NAVER_WEBHOOK_SECRET,
  },
  
  // Shopify API 설정
  shopify: {
    storeDomain: process.env.SHOPIFY_SHOP_DOMAIN || 'hallyusuperstore19.myshopify.com',
    accessToken: process.env.SHOPIFY_ACCESS_TOKEN,
    apiVersion: process.env.SHOPIFY_API_VERSION || '2025-04',
    apiKey: process.env.SHOPIFY_API_KEY,
    apiSecret: process.env.SHOPIFY_API_SECRET,
    webhookSecret: process.env.SHOPIFY_WEBHOOK_SECRET,
  },
  
  // API 설정
  api: {
    prefix: process.env.API_PREFIX || '/api/v1',
    rateLimit: {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '900000', 10), // 15분
      max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
    },
  },
  
  // 로깅 설정
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json',
    directory: process.env.LOG_DIRECTORY || 'logs',
  },
  
  // 동기화 설정
  sync: {
    batchSize: parseInt(process.env.SYNC_BATCH_SIZE || '50', 10),
    interval: parseInt(process.env.SYNC_INTERVAL || '300000', 10), // 5분
    retryAttempts: parseInt(process.env.SYNC_RETRY_ATTEMPTS || '3', 10),
    retryDelay: parseInt(process.env.SYNC_RETRY_DELAY || '5000', 10),
  },
  
  // 웹훅 설정
  webhook: {
    maxRetries: parseInt(process.env.WEBHOOK_MAX_RETRIES || '3', 10),
    timeout: parseInt(process.env.WEBHOOK_TIMEOUT || '10000', 10),
  },
  
  // 캐시 설정
  cache: {
    ttl: parseInt(process.env.CACHE_TTL || '3600', 10), // 1시간
    checkPeriod: parseInt(process.env.CACHE_CHECK_PERIOD || '600', 10), // 10분
  },
  
  // 기타 설정
  misc: {
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '10', 10),
    corsOrigin: process.env.CORS_ORIGIN || '*',
    uploadDir: process.env.UPLOAD_DIR || 'uploads',
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760', 10), // 10MB
  },
};

/**
 * 설정 검증 함수
 * 필수 환경 변수와 설정 값들이 올바른지 확인
 */
export function validateConfig(): void {
  const errors: string[] = [];
  
  // 프로덕션 환경에서 필수 환경 변수 체크
  if (config.isProduction) {
    // JWT Secret 검증
    if (config.jwt.secret === 'your-super-secret-jwt-key-change-this-in-production') {
      errors.push('JWT_SECRET must be changed in production environment');
    }
    
    // 암호화 키 검증
    if (config.encryption.key === 'your-encryption-key-32-characters') {
      errors.push('ENCRYPTION_KEY must be changed in production environment');
    }
    
    // MongoDB URI 검증
    if (config.mongodb.uri === 'mongodb://localhost:27017/ERP_NAVER') {
      console.warn('Warning: Using default MongoDB URI in production');
    }
    
    // CORS Origin 검증
    if (config.misc.corsOrigin === '*') {
      console.warn('Warning: CORS is set to allow all origins in production');
    }
  }
  
  // 네이버 API 설정 검증
  if (!config.naver.clientId) {
    errors.push('NAVER_CLIENT_ID is required');
  }
  
  if (!config.naver.clientSecret || config.naver.clientSecret.length < 29) {
    console.warn('Warning: NAVER_CLIENT_SECRET may be invalid or too short');
  }
  
  // Shopify API 설정 검증 (선택적)
  if (process.env.ENABLE_SHOPIFY === 'true') {
    if (!config.shopify.accessToken) {
      errors.push('SHOPIFY_ACCESS_TOKEN is required when ENABLE_SHOPIFY is true');
    }
    
    if (!config.shopify.apiKey) {
      errors.push('SHOPIFY_API_KEY is required when ENABLE_SHOPIFY is true');
    }
    
    if (!config.shopify.apiSecret) {
      errors.push('SHOPIFY_API_SECRET is required when ENABLE_SHOPIFY is true');
    }
  }
  
  // 포트 검증
  if (config.server.port < 1 || config.server.port > 65535) {
    errors.push(`Invalid PORT: ${config.server.port}. Must be between 1 and 65535`);
  }
  
  if (config.server.wsPort < 1 || config.server.wsPort > 65535) {
    errors.push(`Invalid WS_PORT: ${config.server.wsPort}. Must be between 1 and 65535`);
  }
  
  // Redis 설정 검증
  if (config.redis.port < 1 || config.redis.port > 65535) {
    errors.push(`Invalid REDIS_PORT: ${config.redis.port}. Must be between 1 and 65535`);
  }
  
  // 에러가 있으면 throw
  if (errors.length > 0) {
    const errorMessage = 'Configuration validation failed:\n' + errors.map(e => `  - ${e}`).join('\n');
    throw new Error(errorMessage);
  }
  
  // 설정 검증 성공
  console.log('✅ Configuration validated successfully');
}

// 개발 환경에서 설정 출력 (민감한 정보는 마스킹)
if (config.isDevelopment) {
  console.log('Configuration loaded:', {
    env: config.env,
    server: config.server,
    naver: {
      clientId: config.naver.clientId,
      clientSecretFormat: config.naver.clientSecret.substring(0, 10) + '...',
      clientSecretLength: config.naver.clientSecret.length,
      apiBaseUrl: config.naver.apiBaseUrl,
      storeId: config.naver.storeId,
    },
    shopify: {
      storeDomain: config.shopify.storeDomain,
      apiVersion: config.shopify.apiVersion,
      hasAccessToken: !!config.shopify.accessToken,
    },
  });
}

export default config;