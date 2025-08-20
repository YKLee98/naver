// packages/backend/src/config/cors.ts
import { CorsOptions } from 'cors';
import { config } from './index.js';

// 환경변수에서 ngrok URL 가져오기
const getNgrokUrl = (): string | null => {
  const ngrokUrl = process.env.ngrok_url || 
                   process.env.NGROK_URL || 
                   process.env.NGROK_DOMAIN;
  
  if (ngrokUrl) {
    const cleanUrl = ngrokUrl.trim().replace(/\/$/, '');
    console.log(`CORS: Ngrok URL from env: ${cleanUrl}`);
    return cleanUrl;
  }
  return null;
};

export const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    // origin이 없는 경우 (같은 origin에서의 요청, Postman 등)
    if (!origin) {
      return callback(null, true);
    }

    // 환경변수에서 ngrok URL 확인
    const ngrokUrl = getNgrokUrl();
    if (ngrokUrl) {
      // ngrok URL과 정확히 일치하는지 확인
      if (origin === ngrokUrl || 
          origin === ngrokUrl.replace('https://', 'http://') ||
          origin === ngrokUrl.replace('http://', 'https://')) {
        console.log(`CORS: Allowing ngrok origin from env: ${origin}`);
        return callback(null, true);
      }
    }

    // 환경변수로 설정된 origin들
    const allowedOrigins = config.misc.corsOrigin;
    
    // 배열인 경우
    if (Array.isArray(allowedOrigins)) {
      // 정규표현식 또는 문자열 매칭
      const isAllowed = allowedOrigins.some(allowed => {
        if (allowed instanceof RegExp) {
          return allowed.test(origin);
        }
        return allowed === origin;
      });
      
      if (isAllowed) {
        return callback(null, true);
      }
    }
    
    // 문자열인 경우
    if (typeof allowedOrigins === 'string') {
      if (allowedOrigins === '*' || allowedOrigins === origin) {
        return callback(null, true);
      }
    }
    
    // ngrok 도메인 자동 허용 (패턴 매칭)
    if (origin.match(/https?:\/\/[a-z0-9-]+\.ngrok-free\.app$/) || 
        origin.match(/https?:\/\/[a-z0-9-]+\.ngrok\.io$/) ||
        origin.match(/https?:\/\/[a-z0-9-]+\.ngrok\.app$/)) {
      console.log(`CORS: Allowing ngrok pattern: ${origin}`);
      return callback(null, true);
    }
    
    // 개발 환경에서는 모든 localhost 허용
    if (config.isDevelopment) {
      // localhost:5173 (Vite 기본 포트) 명시적 허용
      if (origin === 'http://localhost:5173' || 
          origin === 'http://127.0.0.1:5173' ||
          origin.includes('localhost') || 
          origin.includes('127.0.0.1')) {
        return callback(null, true);
      }
      
      // 개발 환경에서는 경고만 하고 모든 origin 허용
      console.warn(`CORS: Development mode - allowing origin: ${origin}`);
      return callback(null, true);
    }
    
    console.warn(`CORS: Blocking origin: ${origin}`);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'X-Request-ID', 
    'ngrok-skip-browser-warning',
    'X-Requested-With',
    'Accept',
    'Origin'
  ],
  exposedHeaders: ['X-Request-ID', 'X-Total-Count', 'X-Page', 'X-Page-Size'],
};
