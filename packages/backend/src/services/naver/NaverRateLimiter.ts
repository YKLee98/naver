// packages/backend/src/services/naver/NaverRateLimiter.ts
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { logger } from '@/utils/logger';

export class NaverRateLimiter {
  private rateLimiter: RateLimiterMemory;

  constructor() {
    // 네이버 API는 초당 2회 제한
    this.rateLimiter = new RateLimiterMemory({
      points: 2, // 초당 요청 수
      duration: 1, // 초
      blockDuration: 1, // 차단 시간 (초)
    });
  }

  /**
   * Rate limit 체크 및 소비
   */
  async consume(key = 'naver-api'): Promise<void> {
    try {
      await this.rateLimiter.consume(key);
    } catch (error) {
      logger.warn('Naver API rate limit exceeded, waiting...');
      // 500ms 대기 후 재시도
      await new Promise(resolve => setTimeout(resolve, 500));
      await this.rateLimiter.consume(key);
    }
  }

  /**
   * 남은 포인트 확인
   */
  async getRemaining(key = 'naver-api'): Promise<number> {
    const res = await this.rateLimiter.get(key);
    return res ? this.rateLimiter.points - res.consumedPoints : this.rateLimiter.points;
  }
}
