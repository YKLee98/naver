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
    // API 베이스 URL 설정 - ngrok 접속시 자동 감지
    let baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
    
    // 현재 호스트가 ngrok인 경우 프록시 사용
    if (window.location.hostname.includes('ngrok')) {
      // ngrok에서 접속 시 프록시를 통해 백엔드 연결
      baseURL = '/api';
    } else if (window.location.hostname === '172.30.1.79') {
      // 로컬 IP로 접속한 경우
      baseURL = 'http://172.30.1.79:3000/api';
    }
    
    console.log('[ApiService] Initializing with baseURL:', baseURL);
    
    this.instance = axios.create({
      baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
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

        if (error.response?.status === 401 && !originalRequest._retry) {
          if (this.isRefreshing) {
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
            this.isRefreshing = false;
            window.location.href = '/login';
            return Promise.reject(error);
          }

          try {
            const response = await this.instance.post('/auth/refresh', { refreshToken });
            const { token } = response.data.data;
            
            localStorage.setItem('authToken', token);
            this.instance.defaults.headers.common['Authorization'] = `Bearer ${token}`;
            
            this.processQueue(null, token);
            this.isRefreshing = false;
            
            return this.instance(originalRequest);
          } catch (err) {
            this.processQueue(err, null);
            this.isRefreshing = false;
            
            localStorage.removeItem('authToken');
            localStorage.removeItem('refreshToken');
            window.location.href = '/login';
            
            return Promise.reject(err);
          }
        }

        console.error('[API Response Error]', {
          url: error.config?.url,
          status: error.response?.status,
          message: error.message,
          data: error.response?.data
        });

        return Promise.reject(error);
      }
    );
  }

  // HTTP 메서드들
  async get<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.instance.get<ApiResponse<T>>(url, config);
    // Check if response has the expected structure
    if (response.data && 'data' in response.data) {
      return response.data.data!;
    }
    // If not wrapped in standard structure, return as is
    return response.data as T;
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

// Named export로 api 제공 (dashboard.service.ts에서 사용)
export const api = apiService;

// Default export도 제공
export default apiService;