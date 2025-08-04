// packages/frontend/src/services/api.ts
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { ApiResponse } from '@/types';

class ApiService {
  private instance: AxiosInstance;

  constructor() {
    this.instance = axios.create({
      baseURL: '/api/v1',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor
    this.instance.interceptors.request.use(
      (config) => {
        // authToken을 먼저 확인하고, 없으면 token 확인
        const token = localStorage.getItem('authToken') || localStorage.getItem('token');
        
        // 디버깅용 로그
        console.log(`[API Request] ${config.method?.toUpperCase()} ${config.url}`, {
          hasToken: !!token,
          tokenPreview: token ? token.substring(0, 20) + '...' : null
        });
        
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
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
        // 디버깅용 로그
        console.log(`[API Response] ${response.config.url}`, {
          status: response.status,
          data: response.data
        });
        return response;
      },
      async (error) => {
        const originalRequest = error.config;

        console.error(`[API Error] ${originalRequest?.url}`, {
          status: error.response?.status,
          message: error.response?.data?.message || error.message
        });

        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;

          try {
            const refreshToken = localStorage.getItem('refreshToken');
            if (refreshToken) {
              const response = await this.post('/auth/refresh', { refreshToken });
              const { accessToken, token } = response;
              
              // 두 가지 키로 저장 (호환성)
              const newToken = accessToken || token;
              localStorage.setItem('authToken', newToken);
              localStorage.setItem('token', newToken);
              
              originalRequest.headers.Authorization = `Bearer ${newToken}`;
              
              return this.instance(originalRequest);
            }
          } catch (refreshError) {
            // Refresh failed, redirect to login
            console.error('[Token Refresh Failed]', refreshError);
            localStorage.removeItem('authToken');
            localStorage.removeItem('token');
            localStorage.removeItem('refreshToken');
            localStorage.removeItem('user');
            window.location.href = '/login';
            return Promise.reject(refreshError);
          }
        }

        // Handle other errors
        if (error.response?.status === 403) {
          console.error('[403 Forbidden]', error.response.data);
        } else if (error.response?.status === 404) {
          console.error('[404 Not Found]', error.response.data);
        } else if (error.response?.status >= 500) {
          console.error('[Server Error]', error.response.data);
        }

        return Promise.reject(error);
      }
    );
  }

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

// 싱글톤 인스턴스 생성 및 export
const apiService = new ApiService();
export default apiService;