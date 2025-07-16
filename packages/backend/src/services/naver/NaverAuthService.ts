// packages/backend/src/services/naver/NaverAuthService.ts
import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { Redis } from 'ioredis';
import { logger } from '@/utils/logger';
import { SystemLog } from '@/models';

interface NaverTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

export class NaverAuthService {
  private clientId: string;
  private clientSecret: string;
  private apiBaseUrl: string;
  private redis: Redis;
  private tokenKey = 'naver:access_token';

  constructor(redis: Redis) {
    this.clientId = process.env.NAVER_CLIENT_ID!;
    this.clientSecret = process.env.NAVER_CLIENT_SECRET!;
    this.apiBaseUrl = process.env.NAVER_API_BASE_URL!;
    this.redis = redis;
  }

  /**
   * 네이버 API 액세스 토큰 획득
   */
  async getAccessToken(): Promise<string> {
    try {
      // Redis에서 캐시된 토큰 확인
      const cachedToken = await this.redis.get(this.tokenKey);
      if (cachedToken) {
        return cachedToken;
      }

      // 새 토큰 발급
      const token = await this.requestNewToken();
      
      // Redis에 토큰 캐시 (만료 30분 전까지)
      const ttl = 10800 - 1800; // 3시간 - 30분
      await this.redis.setex(this.tokenKey, ttl, token.access_token);

      logger.info('Naver API token issued successfully');
      
      return token.access_token;
    } catch (error) {
      logger.error('Failed to get Naver access token', error);
      await SystemLog.create({
        level: 'error',
        category: 'naver-auth',
        message: 'Failed to get access token',
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
      });
      throw error;
    }
  }

  /**
   * 새 토큰 요청
   */
  private async requestNewToken(): Promise<NaverTokenResponse> {
    const timestamp = Date.now().toString();
    const signature = await this.generateSignature(timestamp);

    const params = new URLSearchParams({
      client_id: this.clientId,
      timestamp,
      client_secret_sign: signature,
      grant_type: 'client_credentials',
      type: 'SELF',
    });

    const response = await axios.post(
      `${this.apiBaseUrl}/external/v1/oauth2/token`,
      params,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    return response.data;
  }

  /**
   * 전자서명 생성 (bcrypt 방식)
   */
  private async generateSignature(timestamp: string): Promise<string> {
    const password = `${this.clientId}_${timestamp}`;
    const hashed = await bcrypt.hash(password, this.clientSecret);
    return Buffer.from(hashed).toString('base64');
  }

  /**
   * API 요청용 헤더 생성
   */
  async getAuthHeaders(): Promise<Record<string, string>> {
    const token = await this.getAccessToken();
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }
}
