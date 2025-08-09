// packages/backend/src/services/naver/NaverAuthService.ts
import { Redis } from 'ioredis';
import axios, { AxiosError } from 'axios';
import bcrypt from 'bcryptjs';  // ✅ ES 모듈에서 올바른 import 방식
import { config } from '@/config';
import { logger } from '@/utils/logger';

export interface NaverToken {
  access_token: string;
  expires_in: number;
  token_type: string;
}

export class NaverAuthService {
  private redis: Redis;
  private tokenKey = 'naver:auth:token';
  private clientId: string;
  private clientSecret: string;
  private apiBaseUrl: string;

  constructor(redis: Redis) {
    this.redis = redis;
    
    // 환경 변수 직접 읽기 - 하드코딩으로 강제 설정
    this.clientId = '42g71Rui1jMS5KKHDyDhIO';
    this.clientSecret = '$2a$04$dqVRQvyZ./Bu0m4BDZh6eu'; // 전체 값 하드코딩
    this.apiBaseUrl = 'https://api.commerce.naver.com';
    
    logger.warn('Using hardcoded Naver credentials - This is temporary!');
    
    // 환경 변수 검증
    this.validateConfig();
  }

  /**
   * 환경 변수 검증
   */
  private validateConfig(): void {
    if (!this.clientId) {
      throw new Error('NAVER_CLIENT_ID is not configured');
    }
    if (!this.clientSecret) {
      throw new Error('NAVER_CLIENT_SECRET is not configured');
    }
    if (!this.apiBaseUrl) {
      throw new Error('NAVER_API_BASE_URL is not configured');
    }
    
    logger.info('Naver Auth Service initialized', {
      clientId: this.clientId,
      apiBaseUrl: this.apiBaseUrl,
      secretType: this.detectSecretType(),
      secretLength: this.clientSecret.length,
      secretPreview: this.clientSecret.substring(0, 10) + '...'
    });
  }

  /**
   * Client Secret 타입 감지
   */
  private detectSecretType(): string {
    if (this.clientSecret.startsWith('$2a$') || this.clientSecret.startsWith('$2b$')) {
      return 'bcrypt';
    }
    return 'plain';
  }

  /**
   * 네이버 전자서명 생성 - bcrypt salt 방식
   */
  private async generateSignature(timestamp: string): Promise<string> {
    try {
      const password = `${this.clientId}_${timestamp}`;
      
      logger.debug('Generating Naver signature', {
        clientId: this.clientId,
        timestamp: timestamp,
        passwordFormat: `${this.clientId}_${timestamp}`,
        secretType: this.detectSecretType(),
        secretLength: this.clientSecret.length,
        secretPreview: this.clientSecret.substring(0, 15) + '...'
      });
      
      // Client Secret이 bcrypt salt 형식인지 확인
      if (this.clientSecret.startsWith('$2a$') || this.clientSecret.startsWith('$2b$')) {
        logger.info('Using bcrypt signature method with salt');
        
        try {
          // bcrypt.hash 메서드 사용 (ES 모듈 default export)
          const hashed = await bcrypt.hash(password, this.clientSecret);
          
          // Base64 인코딩
          const signature = Buffer.from(hashed, 'utf-8').toString('base64');
          
          logger.debug('Bcrypt signature generated successfully', {
            passwordLength: password.length,
            saltUsed: this.clientSecret.substring(0, 10) + '...',
            hashedLength: hashed.length,
            hashedPreview: hashed.substring(0, 20) + '...',
            signatureLength: signature.length,
            signaturePreview: signature.substring(0, 20) + '...'
          });
          
          return signature;
        } catch (bcryptError: any) {
          logger.error('Bcrypt hashing failed:', {
            error: bcryptError.message,
            secretFormat: this.clientSecret.substring(0, 10),
            secretLength: this.clientSecret.length
          });
          throw new Error(`Bcrypt hashing failed: ${bcryptError.message}`);
        }
      } else {
        // 일반 시크릿인 경우 에러
        logger.error('Invalid client secret format - must be bcrypt salt', {
          secretFormat: this.clientSecret.substring(0, 10),
          expectedFormat: '$2a$04$...'
        });
        throw new Error('Client secret must be in bcrypt salt format ($2a$04$...)');
      }
    } catch (error: any) {
      logger.error('Failed to generate signature:', error);
      throw new Error(`Signature generation failed: ${error.message}`);
    }
  }

  /**
   * 액세스 토큰 발급/갱신
   */
  async getAccessToken(): Promise<string> {
    try {
      // 캐시된 토큰 확인
      const cachedToken = await this.checkCachedToken();
      if (cachedToken) {
        return cachedToken;
      }

      // 새 토큰 발급 - 재시도 로직 포함
      let lastError: any = null;
      const maxRetries = 3;
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const token = await this.requestNewToken(attempt);
          return token;
        } catch (error: any) {
          lastError = error;
          logger.warn(`Token request attempt ${attempt} failed`, {
            error: error.message,
            attempt
          });
          
          if (attempt < maxRetries) {
            // 재시도 전 대기 (exponential backoff)
            await this.sleep(Math.pow(2, attempt) * 1000);
          }
        }
      }
      
      throw lastError || new Error('Failed to obtain access token after retries');
    } catch (error: any) {
      logger.error('Failed to get access token', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * 캐시된 토큰 확인
   */
  private async checkCachedToken(): Promise<string | null> {
    try {
      const cachedToken = await this.redis.get(this.tokenKey);
      
      if (cachedToken) {
        const tokenData: NaverToken = JSON.parse(cachedToken);
        const ttl = await this.redis.ttl(this.tokenKey);
        
        // 토큰 유효시간이 30분 이상 남은 경우 재사용
        if (ttl > 1800) {
          logger.debug('Using cached Naver token', { ttl });
          return tokenData.access_token;
        }
      }
      
      return null;
    } catch (error) {
      logger.warn('Failed to check cached token', error);
      return null;
    }
  }

  /**
   * 새 토큰 요청
   */
  private async requestNewToken(attempt: number = 1): Promise<string> {
    const timestamp = Date.now().toString();
    const signature = await this.generateSignature(timestamp);

    // URL 인코딩된 폼 데이터 생성
    const formData = new URLSearchParams();
    formData.append('client_id', this.clientId);
    formData.append('timestamp', timestamp);
    formData.append('client_secret_sign', signature);
    formData.append('grant_type', 'client_credentials');
    formData.append('type', 'SELF');

    logger.info(`Requesting Naver access token (attempt ${attempt})`, {
      url: `${this.apiBaseUrl}/external/v1/oauth2/token`,
      clientId: this.clientId,
      timestamp: timestamp,
      formDataLength: formData.toString().length,
      signaturePreview: signature.substring(0, 20) + '...'
    });

    try {
      const response = await axios.post(
        `${this.apiBaseUrl}/external/v1/oauth2/token`,
        formData.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json',
            'User-Agent': 'Hallyu-Sync/1.0'
          },
          timeout: 30000,
          maxRedirects: 5,
          validateStatus: (status) => status < 500
        }
      );

      logger.debug('Naver API response received', {
        status: response.status,
        statusText: response.statusText,
        hasData: !!response.data,
        hasAccessToken: !!response.data?.access_token
      });

      // 응답 처리
      if (response.status === 200 && response.data?.access_token) {
        const tokenData = response.data;
        
        // 토큰 캐싱 (만료 시간의 90%만 캐싱)
        const expiresIn = tokenData.expires_in || 10800;
        const cacheDuration = Math.floor(expiresIn * 0.9);
        
        // Redis 캐싱
        try {
          await this.redis.setex(
            this.tokenKey,
            cacheDuration,
            JSON.stringify(tokenData)
          );
        } catch (cacheError) {
          logger.warn('Failed to cache token, but continuing:', cacheError);
        }

        logger.info('Naver token obtained successfully', {
          tokenType: tokenData.token_type,
          expiresIn: expiresIn,
          cachedFor: cacheDuration
        });
        
        return tokenData.access_token;
      }

      // 에러 처리
      this.handleTokenError(response);
      
      throw new Error(`Unexpected response: ${response.status} ${response.statusText}`);
      
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        this.handleAxiosError(error);
      }
      throw error;
    }
  }

  /**
   * 토큰 응답 에러 처리
   */
  private handleTokenError(response: any): void {
    const status = response.status;
    const data = response.data;
    
    logger.error('Naver API token request failed', {
      status,
      data,
      clientId: this.clientId,
      clientSecretFormat: this.clientSecret.substring(0, 10) + '...'
    });
    
    switch (status) {
      case 400:
        if (data?.code === 'INVALID_SIGNATURE') {
          throw new Error('Invalid signature. Check NAVER_CLIENT_SECRET');
        }
        throw new Error(`Bad request: ${data?.message || 'Invalid parameters'}`);
      case 401:
        throw new Error('Authentication failed');
      case 403:
        throw new Error('Access forbidden');
      case 404:
        throw new Error('Token endpoint not found');
      case 429:
        throw new Error('Rate limit exceeded');
      default:
        throw new Error(`Token request failed: ${status}`);
    }
  }

  /**
   * Axios 에러 처리
   */
  private handleAxiosError(error: AxiosError): void {
    if (error.code === 'ECONNREFUSED') {
      throw new Error('Cannot connect to Naver API');
    } else if (error.code === 'ETIMEDOUT') {
      throw new Error('Request timeout');
    } else if (error.response) {
      this.handleTokenError(error.response);
    } else {
      throw new Error(`Network error: ${error.message}`);
    }
  }

  /**
   * 대기 헬퍼 함수
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 토큰 캐시 삭제 (디버깅용)
   */
  async clearTokenCache(): Promise<void> {
    await this.redis.del(this.tokenKey);
    logger.info('Naver token cache cleared');
  }
}