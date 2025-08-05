// packages/frontend/src/services/api/config.ts
import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { toast } from 'react-toastify';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

// Axios 인스턴스 생성
const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // 토큰 추가
    const token = localStorage.getItem('authToken');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // 요청 로깅
    if (import.meta.env.DEV) {
      console.log(`[API] ${config.method?.toUpperCase()} ${config.url}`, config.params || config.data);
    }

    return config;
  },
  (error: AxiosError) => {
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // 401 에러 처리 (인증 만료)
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        // 토큰 갱신 로직
        const refreshToken = localStorage.getItem('refreshToken');
        if (refreshToken) {
          const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {
            refreshToken,
          });

          const { accessToken } = response.data;
          localStorage.setItem('authToken', accessToken);

          // 원래 요청 재시도
          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          }
          return api(originalRequest);
        }
      } catch (refreshError) {
        // 리프레시 실패 시 로그인 페이지로 이동
        localStorage.removeItem('authToken');
        localStorage.removeItem('refreshToken');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    // 에러 메시지 표시
    if (error.response?.data && typeof error.response.data === 'object' && 'message' in error.response.data) {
      const errorMessage = (error.response.data as { message: string }).message;
      toast.error(errorMessage);
    } else if (error.message) {
      toast.error(error.message);
    }

    return Promise.reject(error);
  }
);

export default api;
export { api as apiClient }; // apiClient로도 export

// API 엔드포인트 상수
export const API_ENDPOINTS = {
  // Auth
  AUTH: {
    LOGIN: '/auth/login',
    LOGOUT: '/auth/logout',
    REFRESH: '/auth/refresh',
    ME: '/auth/me',
  },

  // Dashboard
  DASHBOARD: {
    STATISTICS: '/dashboard/statistics',
    ACTIVITIES: '/dashboard/activities',
    CHARTS: {
      PRICE: '/dashboard/charts/price',
      INVENTORY: '/dashboard/charts/inventory',
    },
  },

  // Products
  PRODUCTS: {
    LIST: '/products',
    DETAIL: (sku: string) => `/products/${sku}`,
    SEARCH: {
      NAVER: '/products/search/naver',
      SHOPIFY: '/products/search/shopify',
    },
  },

  // Inventory
  INVENTORY: {
    STATUS_LIST: '/inventory/status',
    STATUS: (sku: string) => `/inventory/${sku}/status`,
    HISTORY: (sku: string) => `/inventory/${sku}/history`,
    ADJUST: (sku: string) => `/inventory/${sku}/adjust`,
    LOW_STOCK: '/inventory/low-stock',
  },

  // Sync
  SYNC: {
    FULL: '/sync/full',
    SKU: (sku: string) => `/sync/sku/${sku}`,
    STATUS: '/sync/status',
    SETTINGS: '/sync/settings',
    HISTORY: '/sync/history',
  },

  // Mappings
  MAPPINGS: {
    LIST: '/mappings',
    CREATE: '/mappings',
    UPDATE: (id: string) => `/mappings/${id}`,
    DELETE: (id: string) => `/mappings/${id}`,
    AUTO_DISCOVER: '/mappings/auto-discover',
    VALIDATE: (id: string) => `/mappings/${id}/validate`,
    BULK: '/mappings/bulk',
  },

  // Price Sync
  PRICE_SYNC: {
    INITIAL_PRICES: '/price-sync/initial-prices',
    SYNC: '/price-sync/sync',
    APPLY_MARGINS: '/price-sync/apply-margins',
    HISTORY: '/price-sync/history',
  },

  // Exchange Rate
  EXCHANGE_RATE: {
    CURRENT: '/exchange-rate/current',
    HISTORY: '/exchange-rate/history',
    MANUAL: '/exchange-rate/manual',
    REFRESH: '/exchange-rate/refresh',
  },

  // Settings
  SETTINGS: {
    GET: '/settings',
    UPDATE: '/settings',
  },
};