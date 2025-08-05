// packages/backend/src/utils/logger.ts
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import fs from 'fs';
import config from '../config';

// 로그 디렉토리 생성
const logDir = config.logging.dir;
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// 로그 포맷 정의
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, ...metadata }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    
    if (Object.keys(metadata).length > 0) {
      msg += ` ${JSON.stringify(metadata)}`;
    }
    
    return msg;
  })
);

// 콘솔 출력용 컬러 포맷
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...metadata }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    
    if (Object.keys(metadata).length > 0) {
      msg += ` ${JSON.stringify(metadata, null, 2)}`;
    }
    
    return msg;
  })
);

// 트랜스포트 설정
const transports: winston.transport[] = [
  // 콘솔 출력
  new winston.transports.Console({
    format: consoleFormat,
    level: config.env === 'production' ? 'info' : 'debug',
  }),
];

// 프로덕션 환경에서는 파일로도 저장
if (config.env === 'production') {
  // 일반 로그 파일
  transports.push(
    new DailyRotateFile({
      filename: path.join(logDir, 'application-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '30d',
      level: 'info',
      format: logFormat,
    })
  );

  // 에러 로그 파일
  transports.push(
    new DailyRotateFile({
      filename: path.join(logDir, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '30d',
      level: 'error',
      format: logFormat,
    })
  );
}

// Logger 인스턴스 생성
export const logger = winston.createLogger({
  level: config.logging.level,
  format: logFormat,
  transports,
  exitOnError: false,
});

// 스트림 인터페이스 (Morgan과 연동용)
export const stream = {
  write: (message: string) => {
    logger.info(message.trim());
  },
};

// 개발 환경에서 디버그 정보 출력
if (config.env !== 'production') {
  logger.debug('Logger initialized in development mode');
}