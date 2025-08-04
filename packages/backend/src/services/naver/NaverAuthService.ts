// packages/backend/src/services/naver/NaverAuthService.ts
import { Redis } from 'ioredis';
import axios from 'axios';
import crypto from 'crypto';
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
    this.clientId = config.naver.clientId;
    this.clientSecret = config.naver.clientSecret;
    this.apiBaseUrl = config.naver.apiBaseUrl;
  }

  /**
   * 네이버 전자서명 생성
   * 네이버 API는 HMAC-SHA256을 Base64로 인코딩한 서명을 사용합니다
   */
  private generateSignature(timestamp: string): string {
    try {
      const message = `${this.clientId}_${timestamp}`;
      
      // HMAC-SHA256으로 서명 생성
      const signature = crypto
        .createHmac('sha256', this.clientSecret)
        .update(message)
        .digest('base64');
      
      logger.debug('Generated signature for Naver API');
      return signature;
    } catch (error) {
      logger.error('Failed to generate signature:', error);
      throw new Error('Signature generation failed');
    }
  }

  /**
   * 액세스 토큰 발급/갱신
   */
  async getAccessToken(): Promise<string> {
    try {
      // 캐시된 토큰 확인
      const cachedToken = await this.redis.get(this.tokenKey);
      
      if (cachedToken) {
        const tokenData: NaverToken = JSON.parse(cachedToken);
        const ttl = await this.redis.ttl(this.tokenKey);
        
        // 토큰 유효시간이 30분 이상 남은 경우 재사용
        if (ttl > 1800) {
          logger.debug('Using cached Naver token');
          return tokenData.access_token;
        }
      }

      // 새 토큰 발급
      const timestamp = Date.now().toString();
      const signature = this.generateSignature(timestamp);

      const params = new URLSearchParams({
        client_id: this.clientId,
        timestamp,
        client_secret_sign: signature,
        grant_type: 'client_credentials',
        type: 'SELF'
      });

      logger.debug('Requesting new Naver access token');

      const response = await axios.post(
        `${this.apiBaseUrl}/external/v1/oauth2/token`,
        params,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout: 10000,
        }
      );

      const tokenData: NaverToken = response.data;

      // 토큰 캐싱 (만료 시간의 90%만 캐싱)
      const cacheDuration = Math.floor(tokenData.expires_in * 0.9);
      await this.redis.setex(
        this.tokenKey,
        cacheDuration,
        JSON.stringify(tokenData)
      );

      logger.info('Naver token refreshed successfully');
      return tokenData.access_token;
    } catch (error: any) {
      logger.error('Failed to get Naver access token:', error.response?.data || error.message);
      
      // 더 자세한 에러 메시지 제공
      if (error.response) {
        const errorMsg = `Naver API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`;
        throw new Error(errorMsg);
      }
      
      throw new Error('Failed to authenticate with Naver API');
    }
  }

  /**
   * API 요청용 인증 헤더 생성
   */
  async getAuthHeaders(): Promise<Record<string, string>> {
    const accessToken = await this.getAccessToken();
    
    return {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
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
}