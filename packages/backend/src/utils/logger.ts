// packages/backend/src/utils/logger.ts
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { config } from '../config/index.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  verbose: 4,
  debug: 5,
  silly: 6,
};

// Log colors
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  verbose: 'cyan',
  debug: 'blue',
  silly: 'grey',
};

winston.addColors(colors);

// Custom format
const customFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;

    if (Object.keys(meta).length > 0) {
      try {
        // 순환 참조를 방지하는 안전한 JSON 변환
        const safeStringify = (obj: any, indent = 2) => {
          const seen = new WeakSet();
          return JSON.stringify(obj, (key, value) => {
            // 순환 참조 체크
            if (typeof value === 'object' && value !== null) {
              if (seen.has(value)) {
                return '[Circular]';
              }
              seen.add(value);
              
              // Axios 요청/응답 객체 처리
              if (value.config || value.request || value.response) {
                return {
                  status: value.status,
                  statusText: value.statusText,
                  data: value.data,
                  message: value.message,
                  url: value.config?.url
                };
              }
              
              // Node.js 스트림 객체 필터링
              if (value.constructor && (
                value.constructor.name === 'ClientRequest' ||
                value.constructor.name === 'IncomingMessage' ||
                value.constructor.name === 'Socket' ||
                value.constructor.name === 'TLSSocket'
              )) {
                return '[Stream Object]';
              }
            }
            return value;
          }, indent);
        };
        
        msg += ` ${safeStringify(meta)}`;
      } catch (err) {
        // JSON 변환 실패 시 기본 메시지만 출력
        msg += ` [Meta stringify error: ${err.message}]`;
      }
    }

    return msg;
  })
);

// Create log directory
const logDir = path.resolve(__dirname, '../../', config.misc.logDir);

// Transport configurations
const transports: winston.transport[] = [];

// Console transport
if (config.isDevelopment || config.isTest) {
  transports.push(
    new winston.transports.Console({
      format: consoleFormat,
      level: config.misc.logLevel,
    })
  );
}

// File transports for production
if (config.isProduction) {
  // Error log file
  transports.push(
    new DailyRotateFile({
      filename: path.join(logDir, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '30d',
      level: 'error',
      format: customFormat,
    })
  );

  // Combined log file
  transports.push(
    new DailyRotateFile({
      filename: path.join(logDir, 'combined-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d',
      format: customFormat,
    })
  );

  // Console for production (less verbose)
  transports.push(
    new winston.transports.Console({
      format: winston.format.simple(),
      level: 'info',
    })
  );
}

// Create logger instance
const logger = winston.createLogger({
  level: config.misc.logLevel || 'debug',
  levels,
  format: customFormat,
  transports,
  exitOnError: false,
});

// Stream for Morgan
export const stream = {
  write: (message: string) => {
    logger.http(message.trim());
  },
};

// Extend logger with custom methods
export class Logger {
  static error(message: string, meta?: any): void {
    logger.error(message, meta);
  }

  static warn(message: string, meta?: any): void {
    logger.warn(message, meta);
  }

  static info(message: string, meta?: any): void {
    logger.info(message, meta);
  }

  static http(message: string, meta?: any): void {
    logger.http(message, meta);
  }

  static verbose(message: string, meta?: any): void {
    logger.verbose(message, meta);
  }

  static debug(message: string, meta?: any): void {
    logger.debug(message, meta);
  }

  static silly(message: string, meta?: any): void {
    logger.silly(message, meta);
  }

  // Performance logging
  static performance(operation: string, duration: number, meta?: any): void {
    logger.info(`Performance: ${operation} took ${duration}ms`, meta);
  }

  // Audit logging
  static audit(action: string, user: string, details?: any): void {
    logger.info(`Audit: ${action} by ${user}`, details);
  }

  // Security logging
  static security(event: string, details?: any): void {
    logger.warn(`Security: ${event}`, details);
  }
}

export { logger, Logger as default };
