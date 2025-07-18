import axios, { AxiosInstance, AxiosError } from 'axios';
import { ApiResponse } from '@/types';

class ApiService {
  private instance: AxiosInstance;

  constructor() {
    this.instance = axios.create({
      baseURL: import.meta.env.VITE_API_URL || '/api/v1',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    // 요청 인터셉터
    this.instance.interceptors.request.use(
      (config) => {
        const token = this.getToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // 응답 인터셉터
    this.instance.interceptors.response.use(
      (response) => response,
      async (error: AxiosError<ApiResponse<any>>) => {
        if (error.response?.status === 401) {
          // 토큰 만료 처리
          this.clearToken();
          window.location.href = '/login';
        }

        const message = error.response?.data?.message || error.message || 'An error occurred';
        
        return Promise.reject({
          message,
          status: error.response?.status,
          data: error.response?.data,
        });
      }
    );
  }

  private getToken(): string | null {
    return localStorage.getItem('token');
  }

  private setToken(token: string): void {
    localStorage.setItem('token', token);
  }

  private clearToken(): void {
    localStorage.removeItem('token');
  }

  async get<T>(url: string, params?: any): Promise<T> {
    const response = await this.instance.get<ApiResponse<T>>(url, { params });
    return response.data.data!;
  }

  async post<T>(url: string, data?: any): Promise<T> {
    const response = await this.instance.post<ApiResponse<T>>(url, data);
    return response.data.data!;
  }

  async put<T>(url: string, data?: any): Promise<T> {
    const response = await this.instance.put<ApiResponse<T>>(url, data);
    return response.data.data!;
  }

  async delete<T>(url: string): Promise<T> {
    const response = await this.instance.delete<ApiResponse<T>>(url);
    return response.data.data!;
  }

  async upload<T>(url: string, formData: FormData): Promise<T> {
    const response = await this.instance.post<ApiResponse<T>>(url, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data.data!;
  }
}

export default new ApiService();

