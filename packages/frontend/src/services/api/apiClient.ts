// packages/frontend/src/services/api/apiClient.ts
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { store } from '@store/index';
import { logout, refreshToken } from '@store/slices/authSlice';

/**
 * API Response interface
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data: T;
  message?: string;
  errors?: Array<{
    field?: string;
    message: string;
    code?: string;
  }>;
  metadata?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
}

/**
 * API Error interface
 */
export interface ApiError {
  message: string;
  code?: string;
  status?: number;
  errors?: Array<{
    field?: string;
    message: string;
  }>;
}

/**
 * Request queue for handling token refresh
 */
interface QueuedRequest {
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
  config: InternalAxiosRequestConfig;
}

/**
 * Enterprise-grade API Client with advanced features
 */
class ApiClient {
  private client: AxiosInstance;
  private isRefreshing = false;
  private refreshQueue: QueuedRequest[] = [];
  private requestCache = new Map<string, { data: any; timestamp: number }>();
  private cacheTimeout = 60000; // 1 minute default cache
  private retryCount = 3;
  private retryDelay = 1000;

  constructor() {
    this.client = this.createClient();
    this.setupInterceptors();
  }

  /**
   * Create axios instance with default config
   */
  private createClient(): AxiosInstance {
    // API URL 설정 - ngrok으로 접속한 경우 ngrok 백엔드 사용
    let baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
    
    // 현재 호스트가 ngrok인 경우 프록시 사용
    if (window.location.hostname.includes('ngrok')) {
      // ngrok에서 접속 시 프록시를 통해 백엔드 연결
      baseURL = '/api';
    } else if (window.location.hostname === '172.30.1.79') {
      // 로컬 IP로 접속한 경우
      baseURL = 'http://172.30.1.79:3000/api';
    }
    
    return axios.create({
      baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Version': import.meta.env.VITE_APP_VERSION || '1.0.0',
        'ngrok-skip-browser-warning': 'true',
      },
      withCredentials: false, // CORS 문제 방지
    });
  }

  /**
   * Setup request and response interceptors
   */
  private setupInterceptors(): void {
    // Request interceptor
    this.client.interceptors.request.use(
      (config) => this.handleRequest(config),
      (error) => Promise.reject(this.handleError(error))
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => this.handleResponse(response),
      async (error) => this.handleResponseError(error)
    );
  }

  /**
   * Handle request before sending
   */
  private handleRequest(config: InternalAxiosRequestConfig): InternalAxiosRequestConfig {
    // Add auth token
    const token = localStorage.getItem('authToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Add request ID for tracking
    config.headers['X-Request-ID'] = this.generateRequestId();

    // Add timestamp
    config.headers['X-Request-Time'] = new Date().toISOString();

    // Log request in development
    if (import.meta.env.DEV) {
      console.log(`[API] ${config.method?.toUpperCase()} ${config.url}`, config.data);
    }

    return config;
  }

  /**
   * Handle successful response
   */
  private handleResponse(response: AxiosResponse): AxiosResponse {
    // Log response in development
    if (import.meta.env.DEV) {
      const duration = this.calculateDuration(response.config);
      console.log(
        `[API] Response ${response.status} (${duration}ms)`,
        response.config.url,
        response.data
      );
    }

    // Cache GET requests if enabled
    if (response.config.method === 'get' && response.config.headers['X-Cache-Enabled']) {
      this.cacheResponse(response.config.url!, response.data);
    }

    return response;
  }

  /**
   * Handle response error
   */
  private async handleResponseError(error: any): Promise<any> {
    const originalRequest = error.config;

    // Handle network errors
    if (!error.response) {
      return Promise.reject(this.createNetworkError());
    }

    // Handle 401 Unauthorized
    if (error.response.status === 401 && !originalRequest._retry) {
      return this.handle401Error(originalRequest);
    }

    // Handle 403 Forbidden
    if (error.response.status === 403) {
      return this.handle403Error(error);
    }

    // Handle 429 Rate Limit
    if (error.response.status === 429) {
      return this.handle429Error(originalRequest, error);
    }

    // Handle 500+ Server Errors with retry
    if (error.response.status >= 500 && !originalRequest._retry) {
      return this.handle5xxError(originalRequest, error);
    }

    return Promise.reject(this.handleError(error));
  }

  /**
   * Handle 401 Unauthorized errors
   */
  private async handle401Error(originalRequest: InternalAxiosRequestConfig): Promise<any> {
    originalRequest._retry = true;

    if (!this.isRefreshing) {
      this.isRefreshing = true;

      try {
        const result = await store.dispatch(refreshToken()).unwrap();
        
        if (result.token) {
          localStorage.setItem('authToken', result.token);
          this.processQueue(null, result.token);
          return this.client(originalRequest);
        }
      } catch (error) {
        this.processQueue(error, null);
        store.dispatch(logout());
        window.location.href = '/login';
        return Promise.reject(error);
      } finally {
        this.isRefreshing = false;
      }
    }

    // Queue the request while refreshing
    return new Promise((resolve, reject) => {
      this.refreshQueue.push({ resolve, reject, config: originalRequest });
    });
  }

  /**
   * Handle 403 Forbidden errors
   */
  private handle403Error(error: any): Promise<any> {
    const errorData = error.response?.data;
    return Promise.reject({
      message: errorData?.message || 'Access denied',
      code: 'FORBIDDEN',
      status: 403,
    });
  }

  /**
   * Handle 429 Rate Limit errors
   */
  private async handle429Error(
    originalRequest: InternalAxiosRequestConfig,
    error: any
  ): Promise<any> {
    const retryAfter = error.response.headers['retry-after'];
    const delay = retryAfter ? parseInt(retryAfter) * 1000 : 5000;

    if (!originalRequest._retryCount) {
      originalRequest._retryCount = 0;
    }

    if (originalRequest._retryCount < 2) {
      originalRequest._retryCount++;
      
      await this.delay(delay);
      return this.client(originalRequest);
    }

    return Promise.reject(this.handleError(error));
  }

  /**
   * Handle 5xx Server errors
   */
  private async handle5xxError(
    originalRequest: InternalAxiosRequestConfig,
    error: any
  ): Promise<any> {
    if (!originalRequest._retryCount) {
      originalRequest._retryCount = 0;
    }

    if (originalRequest._retryCount < this.retryCount) {
      originalRequest._retryCount++;
      
      // Exponential backoff
      const delay = this.retryDelay * Math.pow(2, originalRequest._retryCount);
      await this.delay(delay);
      
      return this.client(originalRequest);
    }

    return Promise.reject(this.handleError(error));
  }

  /**
   * Process queued requests after token refresh
   */
  private processQueue(error: any, token: string | null): void {
    this.refreshQueue.forEach((request) => {
      if (error) {
        request.reject(error);
      } else if (token) {
        request.config.headers.Authorization = `Bearer ${token}`;
        request.resolve(this.client(request.config));
      }
    });
    
    this.refreshQueue = [];
  }

  /**
   * Handle and format errors
   */
  private handleError(error: any): ApiError {
    if (error.response) {
      const { data, status } = error.response;
      return {
        message: data?.message || this.getStatusMessage(status),
        code: data?.code || this.getStatusCode(status),
        status,
        errors: data?.errors,
      };
    }

    if (error.request) {
      return this.createNetworkError();
    }

    return {
      message: error.message || 'An unexpected error occurred',
      code: 'UNKNOWN_ERROR',
    };
  }

  /**
   * Create network error
   */
  private createNetworkError(): ApiError {
    return {
      message: 'Network error. Please check your connection.',
      code: 'NETWORK_ERROR',
      status: 0,
    };
  }

  /**
   * Get status message
   */
  private getStatusMessage(status: number): string {
    const messages: Record<number, string> = {
      400: 'Bad request',
      401: 'Unauthorized',
      403: 'Forbidden',
      404: 'Not found',
      429: 'Too many requests',
      500: 'Internal server error',
      502: 'Bad gateway',
      503: 'Service unavailable',
    };
    return messages[status] || 'An error occurred';
  }

  /**
   * Get status code
   */
  private getStatusCode(status: number): string {
    const codes: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      429: 'RATE_LIMITED',
      500: 'SERVER_ERROR',
      502: 'BAD_GATEWAY',
      503: 'SERVICE_UNAVAILABLE',
    };
    return codes[status] || 'ERROR';
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Calculate request duration
   */
  private calculateDuration(config: any): number {
    const requestTime = config.headers['X-Request-Time'];
    if (!requestTime) return 0;
    return Date.now() - new Date(requestTime).getTime();
  }

  /**
   * Cache response
   */
  private cacheResponse(url: string, data: any): void {
    this.requestCache.set(url, {
      data,
      timestamp: Date.now(),
    });

    // Clean old cache entries
    setTimeout(() => {
      this.cleanCache();
    }, this.cacheTimeout);
  }

  /**
   * Get cached response
   */
  private getCachedResponse(url: string): any | null {
    const cached = this.requestCache.get(url);
    
    if (!cached) return null;
    
    const age = Date.now() - cached.timestamp;
    if (age > this.cacheTimeout) {
      this.requestCache.delete(url);
      return null;
    }
    
    return cached.data;
  }

  /**
   * Clean expired cache entries
   */
  private cleanCache(): void {
    const now = Date.now();
    
    for (const [url, entry] of this.requestCache.entries()) {
      if (now - entry.timestamp > this.cacheTimeout) {
        this.requestCache.delete(url);
      }
    }
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Public API methods
   */

  async get<T = any>(url: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    // Check cache for GET requests
    if (config?.headers?.['X-Cache-Enabled']) {
      const cached = this.getCachedResponse(url);
      if (cached) {
        return cached;
      }
    }

    const response = await this.client.get<ApiResponse<T>>(url, config);
    return response.data;
  }

  async post<T = any>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig
  ): Promise<ApiResponse<T>> {
    const response = await this.client.post<ApiResponse<T>>(url, data, config);
    return response.data;
  }

  async put<T = any>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig
  ): Promise<ApiResponse<T>> {
    const response = await this.client.put<ApiResponse<T>>(url, data, config);
    return response.data;
  }

  async patch<T = any>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig
  ): Promise<ApiResponse<T>> {
    const response = await this.client.patch<ApiResponse<T>>(url, data, config);
    return response.data;
  }

  async delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    const response = await this.client.delete<ApiResponse<T>>(url, config);
    return response.data;
  }

  /**
   * Upload file with progress tracking
   */
  async upload<T = any>(
    url: string,
    formData: FormData,
    onProgress?: (progress: number) => void
  ): Promise<ApiResponse<T>> {
    const response = await this.client.post<ApiResponse<T>>(url, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(progress);
        }
      },
    });
    return response.data;
  }

  /**
   * Download file
   */
  async download(url: string, filename?: string): Promise<void> {
    const response = await this.client.get(url, {
      responseType: 'blob',
    });

    const blob = new Blob([response.data]);
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = filename || 'download';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(downloadUrl);
  }

  /**
   * Get axios instance for custom requests
   */
  getClient(): AxiosInstance {
    return this.client;
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.requestCache.clear();
  }

  /**
   * Set cache timeout
   */
  setCacheTimeout(timeout: number): void {
    this.cacheTimeout = timeout;
  }
}

// Export singleton instance
export const apiClient = new ApiClient();

// Export convenience methods
export const api = {
  get: apiClient.get.bind(apiClient),
  post: apiClient.post.bind(apiClient),
  put: apiClient.put.bind(apiClient),
  patch: apiClient.patch.bind(apiClient),
  delete: apiClient.delete.bind(apiClient),
  upload: apiClient.upload.bind(apiClient),
  download: apiClient.download.bind(apiClient),
  clearCache: apiClient.clearCache.bind(apiClient),
};

// Add TypeScript declarations for custom config properties
declare module 'axios' {
  export interface InternalAxiosRequestConfig {
    _retry?: boolean;
    _retryCount?: number;
  }
}