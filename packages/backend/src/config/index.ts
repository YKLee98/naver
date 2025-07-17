export interface Config {
  env: string;
  port: number;
  wsPort: number;
  apiPrefix: string;
  corsOrigin: string[];
  
  mongodb: {
    uri: string;
  };
  
  redis: {
    host: string;
    port: number;
    password?: string;
    db: number;
  };
  
  naver: {
    clientId: string;
    clientSecret: string;
    apiBaseUrl: string;
    storeId: string;
  };
  
  shopify: {
    shopDomain: string;
    accessToken: string;
    apiVersion: string;
    webhookSecret: string;
    apiKey?: string;
    apiSecret?: string;
  };
  
  aws: {
    region: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    sqsQueueUrl?: string;
    s3Bucket?: string;
  };
  
  exchangeRate: {
    apiKey: string;
    apiUrl: string;
  };
  
  jwt: {
    secret: string;
    expiresIn: string;
  };
  
  rateLimit: {
    windowMs: number;
    maxRequests: number;
  };
  
  logging: {
    level: string;
    dir: string;
  };
}

export const config: Config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  wsPort: parseInt(process.env.WS_PORT || '3001', 10),
  apiPrefix: process.env.API_PREFIX || '/api/v1',
  corsOrigin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:5173'],
  
  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/hallyu-pomaholic',
  },
  
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0', 10),
  },
  
  naver: {
    clientId: process.env.NAVER_CLIENT_ID!,
    clientSecret: process.env.NAVER_CLIENT_SECRET!,
    apiBaseUrl: process.env.NAVER_API_BASE_URL || 'https://api.commerce.naver.com',
    storeId: process.env.NAVER_STORE_ID!,
  },
  
  shopify: {
    shopDomain: process.env.SHOPIFY_SHOP_DOMAIN!,
    accessToken: process.env.SHOPIFY_ACCESS_TOKEN!,
    apiVersion: process.env.SHOPIFY_API_VERSION || '2024-01',
    webhookSecret: process.env.SHOPIFY_WEBHOOK_SECRET!,
    apiKey: process.env.SHOPIFY_API_KEY,
    apiSecret: process.env.SHOPIFY_API_SECRET,
  },
  
  aws: {
    region: process.env.AWS_REGION || 'ap-northeast-2',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sqsQueueUrl: process.env.AWS_SQS_QUEUE_URL,
    s3Bucket: process.env.AWS_S3_BUCKET,
  },
  
  exchangeRate: {
    apiKey: process.env.EXCHANGE_RATE_API_KEY!,
    apiUrl: process.env.EXCHANGE_RATE_API_URL || 'https://api.exchangerate-api.com/v4/latest/KRW',
  },
  
  jwt: {
    secret: process.env.JWT_SECRET || 'your-secret-key',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  },
  
  logging: {
    level: process.env.LOG_LEVEL || 'debug',
    dir: process.env.LOG_DIR || './logs',
  },
};

// 필수 환경 변수 검증
export function validateConfig(): void {
  const requiredEnvVars = [
    'NAVER_CLIENT_ID',
    'NAVER_CLIENT_SECRET',
    'NAVER_STORE_ID',
    'SHOPIFY_SHOP_DOMAIN',
    'SHOPIFY_ACCESS_TOKEN',
    'SHOPIFY_WEBHOOK_SECRET',
    'EXCHANGE_RATE_API_KEY',
  ];

  const missing = requiredEnvVars.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

