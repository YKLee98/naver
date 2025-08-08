// packages/backend/src/utils/logger.ts
import winston from 'winston';
import path from 'path';
import fs from 'fs';

// 로그 디렉토리 생성
const logDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// 순환 참조를 안전하게 처리하는 stringify 함수
function safeStringify(obj: any): string {
  const seen = new WeakSet();
  return JSON.stringify(obj, (key, value) => {
    // undefined, function, symbol은 건너뛰기
    if (value === undefined || typeof value === 'function' || typeof value === 'symbol') {
      return undefined;
    }
    
    // 에러 객체 특별 처리
    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: value.stack
      };
    }
    
    // 순환 참조 처리
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return '[Circular Reference]';
      }
      seen.add(value);
      
      // 특정 객체 타입 단순화
      if (value.constructor && value.constructor.name) {
        const className = value.constructor.name;
        if (['TLSSocket', 'Socket', 'ClientRequest', 'IncomingMessage', 'HTTPParser'].includes(className)) {
          return `[${className} Object]`;
        }
      }
    }
    
    return value;
  }, 2);
}

// 커스텀 포맷
const customFormat = winston.format.printf((info) => {
  const { timestamp, level, message, ...meta } = info;
  const time = timestamp ? new Date(timestamp).toISOString().replace('T', ' ').split('.')[0] : new Date().toISOString().replace('T', ' ').split('.')[0];
  
  let logMessage = `${time} [${level}]: ${message}`;
  
  // 메타데이터가 있으면 추가 (순환 참조 안전하게 처리)
  if (Object.keys(meta).length > 0) {
    try {
      logMessage += ` ${safeStringify(meta)}`;
    } catch (error) {
      logMessage += ` [Failed to stringify metadata]`;
    }
  }
  
  return logMessage;
});

// 로거 생성
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    customFormat
  ),
  transports: [
    // 콘솔 출력
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        customFormat
      )
    }),
    // 파일 출력 (에러)
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error'
    }),
    // 파일 출력 (전체)
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log')
    })
  ]
});

// 개발 환경에서 더 자세한 로그
if (process.env.NODE_ENV === 'development') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      customFormat
    )
  }));
}

// 안전한 로깅 헬퍼 함수
export function logSafe(level: string, message: string, meta?: any) {
  try {
    if (meta) {
      logger.log(level, message, meta);
    } else {
      logger.log(level, message);
    }
  } catch (error) {
    // 로깅 실패 시 기본 콘솔 사용
    console.error('Logger failed:', error);
    console.log(`[${level}] ${message}`);
  }
}

export default logger;