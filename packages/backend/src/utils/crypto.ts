// packages/backend/src/utils/crypto.ts
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { logger } from './logger';

// 암호화 설정
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const ITERATIONS = 100000;

// 환경 변수에서 암호화 키 가져오기
const MASTER_KEY = process.env['ENCRYPTION_MASTER_KEY'] || generateDefaultKey();

// 기본 키 생성 (개발 환경용)
function generateDefaultKey(): string {
  if (process.env['NODE_ENV'] === 'production') {
    throw new Error('ENCRYPTION_MASTER_KEY must be set in production environment');
  }
  logger.warn('Using default encryption key. This should only happen in development.');
  return crypto.randomBytes(32).toString('base64');
}

/**
 * 키 파생 함수 (PBKDF2)
 */
function deriveKey(password: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, 'sha256');
}

/**
 * 데이터 암호화 (AES-256-GCM)
 */
export function encrypt(text: string): string {
  try {
    const salt = crypto.randomBytes(SALT_LENGTH);
    const key = deriveKey(MASTER_KEY, salt);
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    const encrypted = Buffer.concat([
      cipher.update(text, 'utf8'),
      cipher.final()
    ]);
    
    const tag = cipher.getAuthTag();
    
    // 결합: salt + iv + tag + encrypted
    const combined = Buffer.concat([salt, iv, tag, encrypted]);
    
    return combined.toString('base64');
  } catch (error) {
    logger.error('Encryption failed:', error);
    throw new Error('Failed to encrypt data');
  }
}

/**
 * 데이터 복호화 (AES-256-GCM)
 */
export function decrypt(encryptedText: string): string {
  try {
    const combined = Buffer.from(encryptedText, 'base64');
    
    // 분리: salt + iv + tag + encrypted
    const salt = combined.slice(0, SALT_LENGTH);
    const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const tag = combined.slice(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
    const encrypted = combined.slice(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
    
    const key = deriveKey(MASTER_KEY, salt);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]);
    
    return decrypted.toString('utf8');
  } catch (error) {
    logger.error('Decryption failed:', error);
    throw new Error('Failed to decrypt data');
  }
}

/**
 * SHA256 해시 생성
 */
export function sha256(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * SHA512 해시 생성
 */
export function sha512(data: string): string {
  return crypto.createHash('sha512').update(data).digest('hex');
}

/**
 * HMAC-SHA256 서명 생성
 */
export function hmacSha256(data: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

/**
 * HMAC-SHA256 서명 검증
 */
export function verifyHmacSha256(data: string, signature: string, secret: string): boolean {
  const expectedSignature = hmacSha256(data, secret);
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * Base64 인코딩
 */
export function base64Encode(data: string | Buffer): string {
  const buffer = typeof data === 'string' ? Buffer.from(data) : data;
  return buffer.toString('base64');
}

/**
 * Base64 디코딩
 */
export function base64Decode(data: string): string {
  return Buffer.from(data, 'base64').toString('utf-8');
}

/**
 * Base64 URL-safe 인코딩
 */
export function base64UrlEncode(data: string | Buffer): string {
  return base64Encode(data)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Base64 URL-safe 디코딩
 */
export function base64UrlDecode(data: string): string {
  const base64 = data
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(data.length + (4 - data.length % 4) % 4, '=');
  return base64Decode(base64);
}

/**
 * 랜덤 문자열 생성
 */
export function generateRandomString(length: number = 32): string {
  return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
}

/**
 * 보안 랜덤 토큰 생성
 */
export function generateSecureToken(length: number = 32): string {
  return base64UrlEncode(crypto.randomBytes(length));
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
export async function hashPassword(password: string, rounds: number = 12): Promise<string> {
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
  const hash = crypto
    .createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('base64');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(hash)
  );
}

/**
 * JWT 스타일 서명 생성
 */
export function createSignature(payload: string, secret: string): string {
  return hmacSha256(payload, secret);
}

/**
 * JWT 스타일 서명 검증
 */
export function verifySignature(payload: string, signature: string, secret: string): boolean {
  return verifyHmacSha256(payload, signature, secret);
}

/**
 * API 키 생성
 */
export function generateApiKey(prefix: string = 'sk_live'): string {
  const timestamp = Date.now().toString(36);
  const randomPart = generateSecureToken(24);
  return `${prefix}_${timestamp}_${randomPart}`;
}

/**
 * API 키 검증 패턴
 */
export function validateApiKeyFormat(apiKey: string): boolean {
  const pattern = /^(sk_live|sk_test|pk_live|pk_test)_[a-z0-9]+_[A-Za-z0-9_-]+$/;
  return pattern.test(apiKey);
}

/**
 * 민감한 정보 마스킹
 */
export function maskSensitiveData(
  data: string, 
  options: {
    visibleStart?: number;
    visibleEnd?: number;
    maskChar?: string;
    minLength?: number;
  } = {}
): string {
  const {
    visibleStart = 4,
    visibleEnd = 4,
    maskChar = '*',
    minLength = 8
  } = options;

  if (!data || data.length < minLength) {
    return maskChar.repeat(minLength);
  }
  
  if (data.length <= visibleStart + visibleEnd) {
    return maskChar.repeat(data.length);
  }
  
  const start = data.slice(0, visibleStart);
  const end = data.slice(-visibleEnd);
  const middle = maskChar.repeat(data.length - visibleStart - visibleEnd);
  
  return `${start}${middle}${end}`;
}

/**
 * 이메일 마스킹
 */
export function maskEmail(email: string): string {
  const parts = email.split('@');
  if (parts.length !== 2) return maskSensitiveData(email);
  
  const [localPart, domain] = parts;
  if (!localPart || !domain) return maskSensitiveData(email);
  
  const maskedLocal = maskSensitiveData(localPart, { 
    visibleStart: 2, 
    visibleEnd: 0,
    minLength: 3 
  });
  
  return `${maskedLocal}@${domain}`;
}

/**
 * 전화번호 마스킹
 */
export function maskPhoneNumber(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length < 10) return maskSensitiveData(phone);
  
  return maskSensitiveData(cleaned, {
    visibleStart: 3,
    visibleEnd: 4,
    minLength: 10
  });
}

/**
 * 파일 체크섬 생성
 */
export function generateChecksum(data: Buffer | string, algorithm: string = 'sha256'): string {
  const buffer = typeof data === 'string' ? Buffer.from(data) : data;
  return crypto.createHash(algorithm).update(buffer).digest('hex');
}

/**
 * 파일 무결성 검증
 */
export function verifyChecksum(
  data: Buffer | string, 
  expectedChecksum: string, 
  algorithm: string = 'sha256'
): boolean {
  const actualChecksum = generateChecksum(data, algorithm);
  return crypto.timingSafeEqual(
    Buffer.from(actualChecksum),
    Buffer.from(expectedChecksum)
  );
}

/**
 * TOTP 시크릿 생성
 */
export function generateTOTPSecret(): string {
  return base64Encode(crypto.randomBytes(32));
}

/**
 * 암호화 강도 검증
 */
export function validatePasswordStrength(password: string): {
  isValid: boolean;
  score: number;
  issues: string[];
} {
  const issues: string[] = [];
  let score = 0;

  // 최소 길이
  if (password.length >= 8) score += 1;
  else issues.push('Password must be at least 8 characters long');

  // 대문자 포함
  if (/[A-Z]/.test(password)) score += 1;
  else issues.push('Password must contain at least one uppercase letter');

  // 소문자 포함
  if (/[a-z]/.test(password)) score += 1;
  else issues.push('Password must contain at least one lowercase letter');

  // 숫자 포함
  if (/\d/.test(password)) score += 1;
  else issues.push('Password must contain at least one number');

  // 특수문자 포함
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  else issues.push('Password must contain at least one special character');

  return {
    isValid: score >= 4,
    score,
    issues
  };
}

/**
 * 보안 비교 (타이밍 공격 방지)
 */
export function secureCompare(a: string | Buffer, b: string | Buffer): boolean {
  const bufferA = typeof a === 'string' ? Buffer.from(a) : a;
  const bufferB = typeof b === 'string' ? Buffer.from(b) : b;
  
  if (bufferA.length !== bufferB.length) {
    return false;
  }
  
  return crypto.timingSafeEqual(bufferA, bufferB);
}

/**
 * 크립토 유틸리티 자체 테스트
 */
export async function selfTest(): Promise<boolean> {
  try {
    // 암호화/복호화 테스트
    const testData = 'Test encryption data';
    const encrypted = encrypt(testData);
    const decrypted = decrypt(encrypted);
    if (decrypted !== testData) return false;

    // 해시 테스트
    const hash = sha256(testData);
    if (hash !== sha256(testData)) return false;

    // 비밀번호 해싱 테스트
    const password = 'testPassword123!';
    const hashed = await hashPassword(password);
    const verified = await verifyPassword(password, hashed);
    if (!verified) return false;

    return true;
  } catch (error) {
    logger.error('Crypto self-test failed:', error);
    return false;
  }
}