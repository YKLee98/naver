// packages/frontend/src/services/api/config.ts
import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { toast } from 'react-toastify';

// ngrok이나 다른 도메인에서 접속할 때도 API 호출이 가능하도록 처리
const API_BASE_URL = (() => {
  // ngrok 도메인에서 접속한 경우 - 백엔드 ngrok URL 사용
  if (window.location.hostname.includes('ngrok')) {
    console.log('Detected ngrok domain, using backend ngrok URL');
    return 'https://backend.monitor.ngrok.pro/api';
  }
  
  // 환경변수가 설정되어 있으면 우선 사용
  if (import.meta.env.VITE_API_URL) {
    console.log('Using VITE_API_URL:', import.meta.env.VITE_API_URL);
    return import.meta.env.VITE_API_URL;
  }
  
  // 모든 경우 프록시 사용 (vite가 처리)
  console.log('Using proxy for API calls');
  return '/api';
})();

// Axios 인스턴스 생성
export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // 토큰 추가 - 두 가지 키 모두 확인
    const token = localStorage.getItem('authToken') || localStorage.getItem('token');
    
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // 요청 로깅
    if (import.meta.env.DEV) {
      console.log(`[API Request] ${config.method?.toUpperCase()} ${config.url}`, {
        params: config.params,
        data: config.data,
        hasToken: !!token
      });
    }

    return config;
  },
  (error: AxiosError) => {
    console.error('[API Request Error]', error);
    return Promise.reject(error);
  }
);

// Response interceptor
apiClient.interceptors.response.use(
  (response) => {
    if (import.meta.env.DEV) {
      console.log(`[API Response] ${response.config.url}`, response.data);
    }
    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (import.meta.env.DEV) {
      console.error('[API Response Error]', {
        url: originalRequest?.url,
        status: error.response?.status,
        data: error.response?.data
      });
    }

    // 401 에러 처리 (인증 만료)
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        // 토큰 갱신 시도
        const refreshToken = localStorage.getItem('refreshToken');
        if (refreshToken) {
          const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {
            refreshToken,
          });

          const { accessToken } = response.data.data;
          
          // 새 토큰 저장
          localStorage.setItem('authToken', accessToken);
          localStorage.setItem('token', accessToken);

          // 원래 요청 재시도
          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          }
          return apiClient(originalRequest);
        }
      } catch (refreshError) {
        // 리프레시 실패 시 로그인 페이지로 이동
        localStorage.removeItem('authToken');
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        
        // 로그인 페이지가 아닌 경우에만 리다이렉트
        if (!window.location.pathname.includes('/login')) {
          window.location.href = '/login';
        }
        return Promise.reject(refreshError);
      }
    }

    // 에러 메시지 표시
    if (error.response?.data && typeof error.response.data === 'object' && 'message' in error.response.data) {
      const errorMessage = (error.response.data as any).message;
      if (error.response.status !== 401) { // 401은 위에서 처리
        toast.error(errorMessage);
      }
    }

    return Promise.reject(error);
  }
);

// API 메서드들
export const get = async <T = any>(url: string, config?: any): Promise<T> => {
  const response = await apiClient.get(url, config);
  return response.data?.data || response.data;
};

export const post = async <T = any>(url: string, data?: any, config?: any): Promise<T> => {
  const response = await apiClient.post(url, data, config);
  return response.data?.data || response.data;
};

export const put = async <T = any>(url: string, data?: any, config?: any): Promise<T> => {
  const response = await apiClient.put(url, data, config);
  return response.data?.data || response.data;
};

export const patch = async <T = any>(url: string, data?: any, config?: any): Promise<T> => {
  const response = await apiClient.patch(url, data, config);
  return response.data?.data || response.data;
};

export const del = async <T = any>(url: string, config?: any): Promise<T> => {
  const response = await apiClient.delete(url, config);
  return response.data?.data || response.data;
};

// default export도 제공
export default apiClient;