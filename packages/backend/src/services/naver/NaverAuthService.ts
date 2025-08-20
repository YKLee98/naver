// packages/backend/src/services/naver/NaverAuthService.ts
import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from 'axios';
import bcrypt from 'bcryptjs';
import { BaseService, ServiceConfig } from '../base/BaseService.js';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import { createHash } from 'crypto';

export interface NaverToken {
  access_token: string;
  expires_in: number;
  token_type: string;
  issued_at?: number;
}

export interface NaverAuthConfig {
  clientId: string;
  clientSecret: string;
  apiBaseUrl: string;
  storeId: string;
  tokenCacheTTL?: number;
  maxRetries?: number;
  timeout?: number;
}

export class NaverAuthService extends BaseService {
  private tokenCacheKey = 'naver:auth:token';
  private authConfig: NaverAuthConfig;
  private axiosInstance: AxiosInstance;
  private tokenRefreshPromise: Promise<NaverToken> | null = null;

  constructor(redis?: any, customConfig?: Partial<NaverAuthConfig>) {
    super({
      name: 'NaverAuthService',
      version: '2.0.0',
      redis,
      config: customConfig,
    });

    // Initialize configuration
    this.authConfig = {
      clientId: customConfig?.clientId || config.naver.clientId,
      clientSecret: customConfig?.clientSecret || config.naver.clientSecret,
      apiBaseUrl: customConfig?.apiBaseUrl || config.naver.apiBaseUrl,
      storeId: customConfig?.storeId || config.naver.storeId,
      tokenCacheTTL: customConfig?.tokenCacheTTL || 3000, // 50 minutes (token expires in 60)
      maxRetries: customConfig?.maxRetries || 3,
      timeout: customConfig?.timeout || 30000,
    };

    // Create axios instance
    this.axiosInstance = axios.create({
      baseURL: this.authConfig.apiBaseUrl,
      timeout: this.authConfig.timeout,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    this.setupAxiosInterceptors();
  }

  /**
   * Initialize service
   */
  protected override async onInitialize(): Promise<void> {
    this.validateConfiguration();

    // Test authentication on initialization
    try {
      await this.getToken();
      logger.info('Naver authentication test successful');
    } catch (error) {
      logger.warn(
        'Naver authentication test failed, will retry on first request:',
        error
      );
    }
  }

  /**
   * Cleanup service
   */
  protected override async onCleanup(): Promise<void> {
    // Clear token cache
    if (this.redis) {
      await this.redis.del(this.tokenCacheKey);
    }
  }

  /**
   * Validate configuration
   */
  private validateConfiguration(): void {
    const required = ['clientId', 'clientSecret', 'apiBaseUrl', 'storeId'];
    const missing = required.filter(
      (key) => !this.authConfig[key as keyof NaverAuthConfig]
    );

    if (missing.length > 0) {
      throw new Error(
        `Missing required Naver configuration: ${missing.join(', ')}`
      );
    }

    // Validate client secret format
    if (!this.isValidClientSecret(this.authConfig.clientSecret)) {
      logger.warn('Naver client secret may be invalid');
    }

    logger.info('Naver Auth Service configuration validated', {
      clientId: this.authConfig.clientId,
      apiBaseUrl: this.authConfig.apiBaseUrl,
      storeId: this.authConfig.storeId,
      secretType: this.detectSecretType(),
      secretLength: this.authConfig.clientSecret.length,
    });
  }

  /**
   * Setup axios interceptors
   */
  private setupAxiosInterceptors(): void {
    // Request interceptor
    this.axiosInstance.interceptors.request.use(
      (config) => {
        logger.debug('Naver API request:', {
          method: config.method,
          url: config.url,
          params: config.params,
        });
        return config;
      },
      (error) => {
        logger.error('Naver API request error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.axiosInstance.interceptors.response.use(
      (response) => {
        logger.debug('Naver API response:', {
          status: response.status,
          url: response.config.url,
        });
        return response;
      },
      async (error: AxiosError) => {
        const originalRequest = error.config as AxiosRequestConfig & {
          _retry?: boolean;
        };

        // Log error details
        logger.error('Naver API error response:', {
          status: error.response?.status,
          data: error.response?.data,
          url: originalRequest?.url,
        });

        // Handle 401 errors (token expired)
        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;

          try {
            // Clear cached token
            await this.clearCachedToken();

            // Get new token
            const token = await this.getToken();

            // Retry original request with new token
            if (originalRequest.headers) {
              originalRequest.headers['Authorization'] =
                `Bearer ${token.access_token}`;
            }

            return this.axiosInstance(originalRequest);
          } catch (refreshError) {
            logger.error('Token refresh failed:', refreshError);
            throw refreshError;
          }
        }

        throw error;
      }
    );
  }

  /**
   * Check if client secret is valid
   */
  private isValidClientSecret(secret: string): boolean {
    // Check if it's a bcrypt salt format
    if (secret.startsWith('$2a$') || secret.startsWith('$2b$')) {
      return secret.length >= 29;
    }

    // Check if it's a regular secret
    return secret.length >= 16;
  }

  /**
   * Detect client secret type
   */
  private detectSecretType(): 'bcrypt' | 'plain' | 'unknown' {
    const secret = this.authConfig.clientSecret;

    if (secret.startsWith('$2a$') || secret.startsWith('$2b$')) {
      return 'bcrypt';
    }

    if (secret.length >= 16 && /^[a-zA-Z0-9]+$/.test(secret)) {
      return 'plain';
    }

    return 'unknown';
  }

  /**
   * Generate signature for Naver API
   */
  private async generateSignature(timestamp: string): Promise<string> {
    const secretType = this.detectSecretType();
    const password = `${this.authConfig.clientId}_${timestamp}`;

    logger.debug('Generating Naver signature', {
      clientId: this.authConfig.clientId,
      timestamp,
      secretType,
      passwordFormat: password,
    });

    try {
      if (secretType === 'bcrypt') {
        // Use bcrypt salt method - 네이버 커머스 API는 bcrypt salt를 사용
        const hashed = bcrypt.hashSync(password, this.authConfig.clientSecret);
        const signature = Buffer.from(hashed).toString('base64');

        logger.debug('Generated bcrypt signature', {
          signatureLength: signature.length,
          signaturePreview: signature.substring(0, 20) + '...',
        });

        return signature;
      } else {
        // Use HMAC SHA256 method as fallback
        const crypto = await import('crypto');
        const hmac = crypto.createHmac('sha256', this.authConfig.clientSecret);
        hmac.update(password);
        const signature = hmac.digest('base64');

        logger.debug('Generated HMAC signature', {
          signatureLength: signature.length,
          signaturePreview: signature.substring(0, 20) + '...',
        });

        return signature;
      }
    } catch (error) {
      logger.error('Signature generation failed:', error);
      throw new Error(
        `Failed to generate signature: ${(error as Error).message}`
      );
    }
  }

  /**
   * Get access token string only (for backward compatibility)
   */
  async getAccessToken(forceRefresh: boolean = false): Promise<string> {
    const token = await this.getToken(forceRefresh);
    return token.access_token;
  }

  /**
   * Get access token
   */
  async getToken(forceRefresh: boolean = false): Promise<NaverToken> {
    return this.executeWithMetrics(async () => {
      // Check cache first
      if (!forceRefresh) {
        const cached = await this.getCachedToken();
        if (cached) {
          logger.debug('Using cached Naver token');
          return cached;
        }
      }

      // Prevent multiple simultaneous token requests
      if (this.tokenRefreshPromise) {
        logger.debug('Token refresh already in progress, waiting...');
        return await this.tokenRefreshPromise;
      }

      try {
        this.tokenRefreshPromise = this.fetchNewToken();
        const token = await this.tokenRefreshPromise;

        // Cache the token
        await this.cacheToken(token);

        return token;
      } finally {
        this.tokenRefreshPromise = null;
      }
    }, 'getToken');
  }

  /**
   * Fetch new token from Naver API
   */
  private async fetchNewToken(): Promise<NaverToken> {
    const timestamp = Date.now().toString();
    const signature = await this.generateSignature(timestamp);

    const params = new URLSearchParams({
      client_id: this.authConfig.clientId,
      timestamp: timestamp,
      client_secret_sign: signature,
      grant_type: 'client_credentials',
      type: 'SELF',
    });

    logger.info('Requesting new Naver access token');

    try {
      const response = await this.axiosInstance.post(
        '/external/v1/oauth2/token',
        params.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      const token: NaverToken = {
        ...response.data,
        issued_at: Date.now(),
      };

      logger.info('Successfully obtained Naver access token', {
        expiresIn: token.expires_in,
        tokenType: token.token_type,
      });

      this.emit('token:obtained', { expiresIn: token.expires_in });

      return token;
    } catch (error) {
      const axiosError = error as AxiosError;

      logger.error('Failed to obtain Naver access token', {
        status: axiosError.response?.status,
        data: axiosError.response?.data,
        message: axiosError.message,
      });

      this.emit('token:failed', { error: axiosError.message });
      
      // 더 자세한 에러 메시지 제공
      const errorDetail = axiosError.response?.data?.message || 
                         axiosError.response?.data?.error || 
                         axiosError.response?.data || 
                         axiosError.message;

      throw new Error(
        `Naver authentication failed: ${JSON.stringify(errorDetail)}`
      );
    }
  }

  /**
   * Get cached token
   */
  private async getCachedToken(): Promise<NaverToken | null> {
    if (!this.redis) return null;

    try {
      const cached = await this.redis.get(this.tokenCacheKey);
      if (!cached) return null;

      const token: NaverToken = JSON.parse(cached);

      // Check if token is still valid
      if (this.isTokenValid(token)) {
        return token;
      }

      // Token expired, clear cache
      await this.clearCachedToken();
      return null;
    } catch (error) {
      logger.error('Error getting cached token:', error);
      return null;
    }
  }

  /**
   * Cache token
   */
  private async cacheToken(token: NaverToken): Promise<void> {
    if (!this.redis) return;

    try {
      const ttl = Math.min(
        token.expires_in - 600, // Expire 10 minutes before actual expiry
        this.authConfig.tokenCacheTTL!
      );

      await this.redis.setex(this.tokenCacheKey, ttl, JSON.stringify(token));

      logger.debug(`Cached Naver token with TTL ${ttl}s`);
    } catch (error) {
      logger.error('Error caching token:', error);
    }
  }

  /**
   * Clear cached token
   */
  private async clearCachedToken(): Promise<void> {
    if (!this.redis) return;

    try {
      await this.redis.del(this.tokenCacheKey);
      logger.debug('Cleared cached Naver token');
    } catch (error) {
      logger.error('Error clearing cached token:', error);
    }
  }

  /**
   * Check if token is valid
   */
  private isTokenValid(token: NaverToken): boolean {
    if (!token || !token.access_token) return false;

    // Check if token has expired
    if (token.issued_at && token.expires_in) {
      const expiresAt = token.issued_at + token.expires_in * 1000;
      const now = Date.now();
      const bufferTime = 60000; // 1 minute buffer

      return now < expiresAt - bufferTime;
    }

    // If no issued_at, assume token is valid (will be refreshed on 401)
    return true;
  }

  /**
   * Create authenticated axios instance
   */
  async createAuthenticatedClient(): Promise<AxiosInstance> {
    const token = await this.getToken();

    const client = axios.create({
      baseURL: this.authConfig.apiBaseUrl,
      timeout: this.authConfig.timeout,
      headers: {
        Authorization: `Bearer ${token.access_token}`,
        'Content-Type': 'application/json',
      },
    });

    // Add response interceptor for auto-retry on 401
    client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as AxiosRequestConfig & {
          _retry?: boolean;
        };

        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;

          // Get new token
          const newToken = await this.getToken(true);

          // Retry with new token
          if (originalRequest.headers) {
            originalRequest.headers['Authorization'] =
              `Bearer ${newToken.access_token}`;
          }

          return client(originalRequest);
        }

        throw error;
      }
    );

    return client;
  }

  /**
   * Get health details
   */
  protected override async getHealthDetails(): Promise<any> {
    const cachedToken = await this.getCachedToken();

    return {
      hasValidToken: cachedToken !== null && this.isTokenValid(cachedToken),
      clientId: this.authConfig.clientId,
      apiBaseUrl: this.authConfig.apiBaseUrl,
      storeId: this.authConfig.storeId,
      secretType: this.detectSecretType(),
    };
  }
}
