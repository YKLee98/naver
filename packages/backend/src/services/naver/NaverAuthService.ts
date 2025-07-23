// packages/backend/src/services/naver/NaverAuthService.ts
import { Redis } from 'ioredis';
import axios from 'axios';
import bcrypt from 'bcrypt';
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
   * 전자서명 생성 - bcrypt를 사용하여 client_secret을 salt로 활용
   */
  private async generateSignature(timestamp: string): Promise<string> {
    try {
      const password = `${this.clientId}_${timestamp}`;
      // client_secret을 salt로 사용하여 bcrypt hash 생성
      const hashed = await bcrypt.hash(password, this.clientSecret);
      // Base64 인코딩
      return Buffer.from(hashed).toString('base64');
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
      const signature = await this.generateSignature(timestamp);

      const params = new URLSearchParams({
        client_id: this.clientId,
        timestamp,
        client_secret_sign: signature,
        grant_type: 'client_credentials',
        type: 'SELF'
      });

      const response = await axios.post(
        `${this.apiBaseUrl}/external/v1/oauth2/token`,
        params,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout: 30000,
        }
      );

      const tokenData: NaverToken = response.data;
      
      // 토큰 캐싱 (만료 5분 전까지)
      const cacheDuration = tokenData.expires_in - 300;
      await this.redis.setex(
        this.tokenKey,
        cacheDuration,
        JSON.stringify(tokenData)
      );

      logger.info('New Naver token obtained and cached');
      return tokenData.access_token;

    } catch (error: any) {
      logger.error('Failed to get Naver access token:', {
        error: error.message,
        response: error.response?.data,
      });
      throw new Error(`Naver authentication failed: ${error.message}`);
    }
  }

  /**
   * 토큰 무효화
   */
  async invalidateToken(): Promise<void> {
    await this.redis.del(this.tokenKey);
    logger.info('Naver token invalidated');
  }

  /**
   * API 요청 헤더 생성
   */
  async getAuthHeaders(): Promise<Record<string, string>> {
    const token = await this.getAccessToken();
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }
}