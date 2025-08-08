// packages/backend/src/services/naver/NaverAuthService.ts
import { Redis } from 'ioredis';
import axios, { AxiosError } from 'axios';
import * as bcrypt from 'bcryptjs';
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
    
    // 환경 변수 직접 읽기 (config가 제대로 안 되는 경우 대비)
    this.clientId = config.naver?.clientId || process.env.NAVER_CLIENT_ID || '';
    
    // ⚠️ 중요: config에서 제대로 못 읽어오면 직접 환경변수에서 읽기
    // $2a$04$로 시작하는 전체 값 확인
    const configSecret = config.naver?.clientSecret || '';
    const envSecret = process.env.NAVER_CLIENT_SECRET || '';
    
    // config 값이 잘려있으면 환경변수 직접 사용
    if (configSecret && !configSecret.startsWith('$2a$')) {
      // 잘려있는 경우 전체 값 재구성
      this.clientSecret = '$2a$04$dqVRQvyZ./Bu0m4BDZh6eu';  // 전체 값 하드코딩 (임시)
      logger.warn('Client secret was truncated, using hardcoded value temporarily');
    } else if (envSecret.startsWith('$2a$')) {
      this.clientSecret = envSecret;
    } else {
      // 둘 다 실패하면 하드코딩된 값 사용 (임시 해결책)
      this.clientSecret = '$2a$04$dqVRQvyZ./Bu0m4BDZh6eu';
      logger.warn('Using hardcoded client secret temporarily');
    }
    
    this.apiBaseUrl = config.naver?.apiBaseUrl || process.env.NAVER_API_BASE_URL || 'https://api.commerce.naver.com';
    
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
   * 네이버 Commerce API는 client_secret을 bcrypt salt로 사용합니다
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
          // bcrypt로 해싱 - client_secret을 salt로 사용
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
          validateStatus: (status) => status < 500 // 500 미만의 상태 코드는 에러로 처리하지 않음
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
        
        // Redis 캐싱 (MockRedis와 실제 Redis 모두 지원)
        try {
          await this.redis.setex(
            this.tokenKey,
            cacheDuration,
            JSON.stringify(tokenData)
          );
        } catch (cacheError) {
          logger.warn('Failed to cache token, but continuing:', cacheError);
          // 캐싱 실패는 무시하고 토큰은 반환
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
      
      // 이 지점에 도달하면 예상치 못한 응답
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
    
    // 상태 코드별 구체적인 에러 메시지
    switch (status) {
      case 400:
        if (data?.code === 'INVALID_SIGNATURE' || 
            (data?.invalidInputs && data.invalidInputs.some((input: any) => input.name === 'client_secret_sign'))) {
          logger.error('Signature validation failed. Debug info:', {
            clientSecretType: this.detectSecretType(),
            clientSecretLength: this.clientSecret.length,
            clientSecretStart: this.clientSecret.substring(0, 15),
            expectedFormat: '$2a$04$...',
            issue1: 'Verify client secret is complete ($2a$04$dqVRQvyZ./Bu0m4BDZh6eu)',
            issue2: 'Check if .env file is properly loaded',
            issue3: 'Ensure no quotes around the secret in .env'
          });
          throw new Error('Invalid signature. Check that NAVER_CLIENT_SECRET=$2a$04$dqVRQvyZ./Bu0m4BDZh6eu (no quotes)');
        } else if (data?.code === 'INVALID_TIMESTAMP') {
          throw new Error('Invalid timestamp. Server time may be out of sync.');
        } else if (data?.invalidInputs) {
          const invalidInputs = data.invalidInputs
            .map((input: any) => `${input.name}: ${input.message}`)
            .join(', ');
          throw new Error(`Invalid request: ${invalidInputs}`);
        }
        throw new Error(`Bad request: ${data?.message || 'Invalid parameters'}`);
        
      case 401:
        throw new Error('Authentication failed. Check client_id and client_secret.');
        
      case 403:
        throw new Error('Access forbidden. Check API permissions and IP whitelist.');
        
      case 404:
        throw new Error('Token endpoint not found. Check API base URL.');
        
      case 429:
        throw new Error('Rate limit exceeded. Please try again later.');
        
      default:
        throw new Error(`Token request failed: ${data?.message || `HTTP ${status}`}`);
    }
  }

  /**
   * Axios 에러 처리
   */
  private handleAxiosError(error: AxiosError): void {
    if (error.response) {
      // 서버가 응답했지만 에러 상태 코드
      this.handleTokenError(error.response);
    } else if (error.request) {
      // 요청이 전송되었지만 응답 없음
      logger.error('No response from Naver API', {
        code: error.code,
        message: error.message
      });
      throw new Error(`Network error: ${error.message}`);
    } else {
      // 요청 설정 중 에러
      logger.error('Request configuration error', {
        message: error.message
      });
      throw new Error(`Request error: ${error.message}`);
    }
  }

  /**
   * Sleep 유틸리티 함수
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * API 요청용 인증 헤더 생성
   */
  async getAuthHeaders(): Promise<Record<string, string>> {
    const accessToken = await this.getAccessToken();
    
    return {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'Hallyu-Sync/1.0'
    };
  }

  /**
   * 토큰 유효성 검증
   */
  async validateToken(): Promise<boolean> {
    try {
      const cachedToken = await this.redis.get(this.tokenKey);
      
      if (!cachedToken) {
        return false;
      }

      const ttl = await this.redis.ttl(this.tokenKey);
      
      // TTL이 5분 이상 남아있으면 유효
      return ttl > 300;
    } catch (error) {
      logger.error('Failed to validate token:', error);
      return false;
    }
  }

  /**
   * 토큰 강제 갱신
   */
  async refreshToken(): Promise<string> {
    // 캐시된 토큰 삭제
    await this.redis.del(this.tokenKey);
    
    // 새 토큰 발급
    return this.getAccessToken();
  }

  /**
   * 토큰 삭제 (로그아웃)
   */
  async revokeToken(): Promise<void> {
    await this.redis.del(this.tokenKey);
    logger.info('Naver token revoked');
  }

  /**
   * 연결 테스트
   */
  async testConnection(): Promise<boolean> {
    try {
      const token = await this.getAccessToken();
      return !!token;
    } catch (error) {
      logger.error('Connection test failed:', error);
      return false;
    }
  }
}