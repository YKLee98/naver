// packages/frontend/src/utils/api.ts
import axios, { 
  AxiosInstance, 
  AxiosRequestConfig, 
  AxiosResponse, 
  AxiosError 
} from 'axios';
import { ApiResponse } from '@/types';

/**
 * API 에러 클래스
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * API 클라이언트 설정
 */
interface ApiClientConfig {
  baseURL?: string;
  timeout?: number;
  headers?: Record<string, string>;
  onTokenExpired?: () => void;
  onError?: (error: ApiError) => void;
}

/**
 * 토큰 관리 유틸리티
 */
export class TokenManager {
  private static readonly ACCESS_TOKEN_KEY = 'authToken';
  private static readonly REFRESH_TOKEN_KEY = 'refreshToken';
  private static readonly TOKEN_EXPIRY_KEY = 'tokenExpiry';

  static getAccessToken(): string | null {
    // 두 가지 키 모두 확인 (호환성)
    return localStorage.getItem(this.ACCESS_TOKEN_KEY) || 
           localStorage.getItem('token') || 
           null;
  }

  static setAccessToken(token: string, expiresIn?: number): void {
    localStorage.setItem(this.ACCESS_TOKEN_KEY, token);
    // 호환성을 위해 'token' 키로도 저장
    localStorage.setItem('token', token);
    
    if (expiresIn) {
      const expiryTime = Date.now() + (expiresIn * 1000);
      localStorage.setItem(this.TOKEN_EXPIRY_KEY, expiryTime.toString());
    }
  }

  static getRefreshToken(): string | null {
    return localStorage.getItem(this.REFRESH_TOKEN_KEY);
  }

  static setRefreshToken(token: string): void {
    localStorage.setItem(this.REFRESH_TOKEN_KEY, token);
  }

  static clearTokens(): void {
    localStorage.removeItem(this.ACCESS_TOKEN_KEY);
    localStorage.removeItem('token');
    localStorage.removeItem(this.REFRESH_TOKEN_KEY);
    localStorage.removeItem(this.TOKEN_EXPIRY_KEY);
  }

  static isTokenExpired(): boolean {
    const expiry = localStorage.getItem(this.TOKEN_EXPIRY_KEY);
    if (!expiry) return false;
    
    return Date.now() > parseInt(expiry, 10);
  }
}

/**
 * 재시도 로직을 위한 Queue 관리
 */
class RequestQueue {
  private queue: Array<{
    config: AxiosRequestConfig;
    resolve: (value: any) => void;
    reject: (error: any) => void;
  }> = [];
  private isRefreshing = false;

  add(config: AxiosRequestConfig): Promise<any> {
    return new Promise((resolve, reject) => {
      this.queue.push({ config, resolve, reject });
    });
  }

  async processQueue(axiosInstance: AxiosInstance): Promise<void> {
    const requests = [...this.queue];
    this.queue = [];

    for (const { config, resolve, reject } of requests) {
      try {
        const response = await axiosInstance.request(config);
        resolve(response);
      } catch (error) {
        reject(error);
      }
    }
  }

  setRefreshing(state: boolean): void {
    this.isRefreshing = state;
  }

  getRefreshing(): boolean {
    return this.isRefreshing;
  }
}

/**
 * 엔터프라이즈급 API 클라이언트
 */
export class ApiClient {
  private instance: AxiosInstance;
  private requestQueue: RequestQueue;
  private config: ApiClientConfig;

  constructor(config: ApiClientConfig = {}) {
    this.config = {
      baseURL: config.baseURL || import.meta.env.VITE_API_URL || '/api/v1',
      timeout: config.timeout || 30000,
      headers: config.headers || { 'Content-Type': 'application/json' },
      ...config
    };

    this.requestQueue = new RequestQueue();
    this.instance = this.createInstance();
    this.setupInterceptors();
  }

  private createInstance(): AxiosInstance {
    return axios.create({
      baseURL: this.config.baseURL,
      timeout: this.config.timeout,
      headers: this.config.headers,
    });
  }

  private setupInterceptors(): void {
    // Request Interceptor
    this.instance.interceptors.request.use(
      (config) => {
        // 토큰 추가
        const token = TokenManager.getAccessToken();
        if (token && !TokenManager.isTokenExpired()) {
          config.headers.Authorization = `Bearer ${token}`;
        }

        // 디버깅 정보
        if (import.meta.env.DEV) {
          console.log(`[API] ${config.method?.toUpperCase()} ${config.url}`, {
            headers: config.headers,
            data: config.data,
          });
        }

        return config;
      },
      (error) => {
        console.error('[API] Request error:', error);
        return Promise.reject(error);
      }
    );

    // Response Interceptor
    this.instance.interceptors.response.use(
      (response) => {
        // 성공 응답 처리
        if (import.meta.env.DEV) {
          console.log(`[API] Response ${response.config.url}:`, response.data);
        }
        return response;
      },
      async (error: AxiosError) => {
        const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean };

        // 네트워크 에러 처리
        if (!error.response) {
          const apiError = new ApiError(
            0,
            'NETWORK_ERROR',
            '네트워크 연결을 확인해주세요.'
          );
          this.config.onError?.(apiError);
          return Promise.reject(apiError);
        }

        // 401 Unauthorized 처리
        if (error.response.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;

          // 이미 토큰 갱신 중이면 대기
          if (this.requestQueue.getRefreshing()) {
            return this.requestQueue.add(originalRequest);
          }

          this.requestQueue.setRefreshing(true);

          try {
            await this.refreshAccessToken();
            // 대기 중인 요청들 처리
            await this.requestQueue.processQueue(this.instance);
            // 원래 요청 재시도
            return this.instance.request(originalRequest);
          } catch (refreshError) {
            // 토큰 갱신 실패
            TokenManager.clearTokens();
            this.config.onTokenExpired?.();
            window.location.href = '/login';
            return Promise.reject(refreshError);
          } finally {
            this.requestQueue.setRefreshing(false);
          }
        }

        // 기타 에러 처리
        const apiError = this.createApiError(error);
        this.config.onError?.(apiError);
        return Promise.reject(apiError);
      }
    );
  }

  private async refreshAccessToken(): Promise<void> {
    const refreshToken = TokenManager.getRefreshToken();
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    try {
      const response = await axios.post<{
        accessToken: string;
        refreshToken?: string;
        expiresIn?: number;
      }>(`${this.config.baseURL}/auth/refresh`, { refreshToken });

      const { accessToken, refreshToken: newRefreshToken, expiresIn } = response.data;
      
      TokenManager.setAccessToken(accessToken, expiresIn);
      if (newRefreshToken) {
        TokenManager.setRefreshToken(newRefreshToken);
      }
    } catch (error) {
      console.error('[API] Token refresh failed:', error);
      throw error;
    }
  }

  private createApiError(error: AxiosError): ApiError {
    if (!error.response) {
      return new ApiError(0, 'NETWORK_ERROR', '네트워크 오류가 발생했습니다.');
    }

    const { status, data } = error.response;
    const errorData = data as any;

    return new ApiError(
      status,
      errorData?.error?.code || 'UNKNOWN_ERROR',
      errorData?.error?.message || errorData?.message || '알 수 없는 오류가 발생했습니다.',
      errorData?.error?.details
    );
  }

  // HTTP 메서드들
  async get<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.instance.get<ApiResponse<T>>(url, config);
    return response.data.data as T;
  }

  async post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.instance.post<ApiResponse<T>>(url, data, config);
    return response.data.data as T;
  }

  async put<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.instance.put<ApiResponse<T>>(url, data, config);
    return response.data.data as T;
  }

  async patch<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.instance.patch<ApiResponse<T>>(url, data, config);
    return response.data.data as T;
  }

  async delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.instance.delete<ApiResponse<T>>(url, config);
    return response.data.data as T;
  }

  async upload<T = any>(url: string, formData: FormData, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.instance.post<ApiResponse<T>>(url, formData, {
      ...config,
      headers: {
        ...config?.headers,
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data.data as T;
  }

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
}

// 기본 API 클라이언트 인스턴스
export const apiClient = new ApiClient();

// 기본 export
export default apiClient;