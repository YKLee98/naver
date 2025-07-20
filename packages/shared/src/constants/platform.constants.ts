// packages/shared/src/constants/platform.constants.ts
export const NAVER_API = {
  BASE_URL: 'https://api.commerce.naver.com',
  VERSION: 'v1',
  RATE_LIMIT: {
    REQUESTS_PER_SECOND: 2,
    BURST_SIZE: 4,
  },
  ENDPOINTS: {
    PRODUCTS: '/external/v1/products',
    ORDERS: '/external/v1/orders',
    INVENTORY: '/external/v1/inventory',
  },
} as const;

export const SHOPIFY_API = {
  VERSION: '2025-04',
  RATE_LIMIT: {
    REQUESTS_PER_SECOND: 2,
    BURST_SIZE: 40,
    RESTORE_RATE: 2,
  },
  WEBHOOK_TOPICS: [
    'products/create',
    'products/update',
    'products/delete',
    'inventory_levels/update',
    'orders/create',
    'orders/updated',
    'orders/cancelled',
  ],
} as const;

export const EXCHANGE_RATE_API = {
  BASE_URL: 'https://api.exchangerate-api.com/v4/latest',
  UPDATE_INTERVAL: 3600000, // 1 hour
  CACHE_TTL: 3600, // 1 hour in seconds
} as const;
