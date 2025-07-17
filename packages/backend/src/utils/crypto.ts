import crypto from 'crypto';
import bcrypt from 'bcrypt';

/**
 * SHA256 해시 생성
 */
export function sha256(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * HMAC-SHA256 서명 생성
 */
export function hmacSha256(data: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

/**
 * Base64 인코딩
 */
export function base64Encode(data: string): string {
  return Buffer.from(data).toString('base64');
}

/**
 * Base64 디코딩
 */
export function base64Decode(data: string): string {
  return Buffer.from(data, 'base64').toString('utf-8');
}

/**
 * 랜덤 문자열 생성
 */
export function generateRandomString(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * UUID v4 생성
 */
export function generateUUID(): string {
  return crypto.randomUUID();
}

/**
 * 비밀번호 해싱 (bcrypt)
 */
export async function hashPassword(password: string, rounds: number = 10): Promise<string> {
  return bcrypt.hash(password, rounds);
}

/**
 * 비밀번호 검증 (bcrypt)
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * 네이버 전자서명 생성
 */
export async function generateNaverSignature(
  clientId: string,
  clientSecret: string,
  timestamp: string
): Promise<string> {
  const password = `${clientId}_${timestamp}`;
  const hashed = await bcrypt.hash(password, clientSecret);
  return base64Encode(hashed);
}

/**
 * Shopify 웹훅 서명 검증
 */
export function verifyShopifyWebhook(
  rawBody: string,
  signature: string,
  secret: string
): boolean {
  const hash = hmacSha256(rawBody, secret);
  const expectedSignature = base64Encode(hash);
  
  // 타이밍 공격 방지를 위한 안전한 비교
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * API 키 생성
 */
export function generateApiKey(): string {
  const prefix = 'sk_live_';
  const randomPart = generateRandomString(24);
  return `${prefix}${randomPart}`;
}

/**
 * 민감한 정보 마스킹
 */
export function maskSensitiveData(data: string, visibleChars: number = 4): string {
  if (data.length <= visibleChars * 2) {
    return '*'.repeat(data.length);
  }
  
  const start = data.slice(0, visibleChars);
  const end = data.slice(-visibleChars);
  const middle = '*'.repeat(data.length - visibleChars * 2);
  
  return `${start}${middle}${end}`;
}

