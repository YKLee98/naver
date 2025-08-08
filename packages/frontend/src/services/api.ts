// packages/frontend/src/services/api.ts
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import { ApiResponse } from '@/types';

class ApiService {
  private instance: AxiosInstance;
  private isRefreshing = false;
  private failedQueue: Array<{
    resolve: (value?: any) => void;
    reject: (error?: any) => void;
  }> = [];

  constructor() {
    // API 베이스 URL 설정
    const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';
    
    console.log('[ApiService] Initializing with baseURL:', baseURL);
    
    this.instance = axios.create({
      baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  private processQueue(error: any, token: string | null = null): void {
    this.failedQueue.forEach(prom => {
      if (error) {
        prom.reject(error);
      } else {
        prom.resolve(token);
      }
    });
    
    this.failedQueue = [];
  }

  private setupInterceptors(): void {
    // Request interceptor
    this.instance.interceptors.request.use(
      (config) => {
        // 토큰 추가 (두 가지 키 모두 확인)
        const token = localStorage.getItem('authToken') || localStorage.getItem('token');
        
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
          console.log(`[API Request] ${config.method?.toUpperCase()} ${config.url} (with auth)`);
        } else {
          console.log(`[API Request] ${config.method?.toUpperCase()} ${config.url} (no auth)`);
        }

        // 개발 환경에서 상세 로깅
        if (import.meta.env.DEV) {
          console.log('[API Request Details]', {
            url: config.url,
            method: config.method,
            headers: config.headers,
            data: config.data,
            params: config.params
          });
        }
        
        return config;
      },
      (error) => {
        console.error('[API Request Error]', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.instance.interceptors.response.use(
      (response) => {
        console.log(`[API Response] ${response.config.url}`, {
          status: response.status,
          statusText: response.statusText
        });

        // 개발 환경에서 응답 데이터 로깅
        if (import.meta.env.DEV) {
          console.log('[API Response Data]', response.data);
        }

        return response;
      },
      async (error: AxiosError) => {
        const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean };

        // 에러 로깅
        console.error(`[API Error] ${originalRequest?.url}`, {
          status: error.response?.status,
          statusText: error.response?.statusText,
          message: error.response?.data?.message || error.message,
          data: error.response?.data
        });

        // 네트워크 오류 처리
        if (!error.response) {
          console.error('[API] Network error - no response received');
          return Promise.reject({
            ...error,
            message: '네트워크 연결을 확인해주세요.'
          });
        }

        // 401 Unauthorized 처리
        if (error.response?.status === 401 && !originalRequest._retry) {
          if (this.isRefreshing) {
            // 이미 토큰 갱신 중이면 대기
            return new Promise((resolve, reject) => {
              this.failedQueue.push({ resolve, reject });
            }).then(token => {
              originalRequest.headers!.Authorization = `Bearer ${token}`;
              return this.instance(originalRequest);
            }).catch(err => {
              return Promise.reject(err);
            });
          }

          originalRequest._retry = true;
          this.isRefreshing = true;

          const refreshToken = localStorage.getItem('refreshToken');
          
          if (!refreshToken) {
            console.log('[API] No refresh token available, redirecting to login');
            this.clearAuthAndRedirect();
            return Promise.reject(error);
          }

          try {
            console.log('[API] Attempting to refresh token...');
            const response = await this.post('/auth/refresh', { refreshToken });
            const { accessToken, refreshToken: newRefreshToken } = response;
            
            // 새 토큰 저장
            if (accessToken) {
              localStorage.setItem('authToken', accessToken);
              localStorage.setItem('token', accessToken);
            }
            
            if (newRefreshToken) {
              localStorage.setItem('refreshToken', newRefreshToken);
            }
            
            console.log('[API] Token refreshed successfully');
            
            this.isRefreshing = false;
            this.processQueue(null, accessToken);
            
            // 원래 요청 재시도
            originalRequest.headers!.Authorization = `Bearer ${accessToken}`;
            return this.instance(originalRequest);
            
          } catch (refreshError) {
            console.error('[API] Token refresh failed:', refreshError);
            this.isRefreshing = false;
            this.processQueue(refreshError, null);
            this.clearAuthAndRedirect();
            return Promise.reject(refreshError);
          }
        }

        // 403 Forbidden
        if (error.response?.status === 403) {
          console.error('[API] 403 Forbidden - Access denied');
        }

        // 404 Not Found
        if (error.response?.status === 404) {
          console.error('[API] 404 Not Found - Resource not found');
        }

        // 500+ Server errors
        if (error.response?.status >= 500) {
          console.error('[API] Server error:', error.response.status);
        }

        return Promise.reject(error);
      }
    );
  }

  private clearAuthAndRedirect(): void {
    console.log('[API] Clearing auth data and redirecting to login');
    localStorage.removeItem('authToken');
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    
    // 로그인 페이지로 리다이렉트 (현재 페이지가 로그인이 아닌 경우)
    if (!window.location.pathname.includes('/login')) {
      window.location.href = '/login';
    }
  }

  // HTTP 메서드들
  async get<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.instance.get<ApiResponse<T>>(url, config);
    return response.data.data!;
  }

  async post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.instance.post<ApiResponse<T>>(url, data, config);
    return response.data.data!;
  }

  async put<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.instance.put<ApiResponse<T>>(url, data, config);
    return response.data.data!;
  }

  async patch<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.instance.patch<ApiResponse<T>>(url, data, config);
    return response.data.data!;
  }

  async delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.instance.delete<ApiResponse<T>>(url, config);
    return response.data.data!;
  }

  // 파일 업로드
  async upload<T = any>(url: string, formData: FormData, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.instance.post<ApiResponse<T>>(url, formData, {
      ...config,
      headers: {
        ...config?.headers,
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data.data!;
  }

  // 파일 다운로드
  async download(url: string, config?: AxiosRequestConfig): Promise<Blob> {
    const response = await this.instance.get(url, {
      ...config,
      responseType: 'blob',
    });
    return response.data;
  }

  // Axios 인스턴스 직접 접근 (필요시)
  getAxiosInstance(): AxiosInstance {
    return this.instance;
  }

  // 헬스 체크
  async healthCheck(): Promise<boolean> {
    try {
      await this.get('/health');
      return true;
    } catch (error) {
      console.error('[API] Health check failed:', error);
      return false;
    }
  }
}

// 싱글톤 인스턴스 생성 및 export
const apiService = new ApiService();
export default apiService;