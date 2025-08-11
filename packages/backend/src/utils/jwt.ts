// packages/backend/src/utils/jwt.ts
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { logger } from './logger.js';

export interface JWTPayload {
  id: string;
  email?: string;
  role?: string;
  type?: 'access' | 'refresh';
  [key: string]: any;
}

export interface JWTOptions {
  expiresIn?: string | number;
  issuer?: string;
  audience?: string;
  subject?: string;
}

/**
 * Generate JWT token
 */
export function generateToken(
  payload: JWTPayload,
  options?: JWTOptions
): string {
  try {
    const defaultOptions: jwt.SignOptions = {
      expiresIn: config.jwt.expiresIn as string | number,
      issuer: 'hallyu-fomaholic',
      audience: 'hallyu-fomaholic-api',
      ...options,
    };

    return jwt.sign(payload, config.jwt.secret, defaultOptions);
  } catch (error) {
    logger.error('Error generating token:', error);
    throw new Error('Failed to generate token');
  }
}

/**
 * Verify JWT token
 */
export function verifyToken(token: string): JWTPayload {
  try {
    const decoded = jwt.verify(token, config.jwt.secret, {
      issuer: 'hallyu-fomaholic',
      audience: 'hallyu-fomaholic-api',
    }) as JWTPayload;

    return decoded;
  } catch (error: any) {
    logger.error('Error verifying token:', error.message);
    throw error;
  }
}

/**
 * Decode JWT token without verification
 */
export function decodeToken(token: string): JWTPayload | null {
  try {
    const decoded = jwt.decode(token) as JWTPayload;
    return decoded;
  } catch (error) {
    logger.error('Error decoding token:', error);
    return null;
  }
}

/**
 * Check if token is expired
 */
export function isTokenExpired(token: string): boolean {
  try {
    const decoded = jwt.decode(token) as any;

    if (!decoded || !decoded.exp) {
      return true;
    }

    const currentTime = Math.floor(Date.now() / 1000);
    return decoded.exp < currentTime;
  } catch (error) {
    logger.error('Error checking token expiration:', error);
    return true;
  }
}

/**
 * Get token expiration time
 */
export function getTokenExpiration(token: string): Date | null {
  try {
    const decoded = jwt.decode(token) as any;

    if (!decoded || !decoded.exp) {
      return null;
    }

    return new Date(decoded.exp * 1000);
  } catch (error) {
    logger.error('Error getting token expiration:', error);
    return null;
  }
}

/**
 * Generate access token
 */
export function generateAccessToken(payload: Omit<JWTPayload, 'type'>): string {
  return generateToken(
    { ...payload, type: 'access' } as JWTPayload,
    { expiresIn: config.jwt.expiresIn as string | number }
  );
}

/**
 * Generate refresh token
 */
export function generateRefreshToken(
  payload: Omit<JWTPayload, 'type'>
): string {
  return generateToken(
    { ...payload, type: 'refresh' } as JWTPayload,
    { expiresIn: config.jwt.refreshExpiresIn as string | number }
  );
}

/**
 * Validate token type
 */
export function validateTokenType(
  token: string,
  expectedType: 'access' | 'refresh'
): boolean {
  try {
    const decoded = verifyToken(token);
    return decoded.type === expectedType;
  } catch (error) {
    return false;
  }
}

export default {
  generateToken,
  verifyToken,
  decodeToken,
  isTokenExpired,
  getTokenExpiration,
  generateAccessToken,
  generateRefreshToken,
  validateTokenType,
};
