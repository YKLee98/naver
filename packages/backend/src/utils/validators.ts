// packages/backend/src/utils/validators.ts

/**
 * SKU 유효성 검사
 */
export const validateSKU = (sku: string): boolean => {
  if (!sku || typeof sku !== 'string') return false;
  
  // SKU 패턴: 영문(대소문자), 숫자, 하이픈(-), 언더바(_)만 허용
  // 3-50자 길이 제한
  const skuPattern = /^[A-Z0-9_-]{3,50}$/i;
  return skuPattern.test(sku);
};

/**
 * 상품 ID 유효성 검사
 */
export const validateProductId = (id: string, platform: 'naver' | 'shopify'): boolean => {
  if (!id || typeof id !== 'string') return false;
  
  if (platform === 'naver') {
    // 네이버: 숫자만
    return /^\d+$/.test(id);
  } else if (platform === 'shopify') {
    // Shopify: gid://shopify/Product/숫자 또는 숫자만
    return /^(gid:\/\/shopify\/Product\/)?\d+$/.test(id);
  }
  
  return false;
};

/**
 * 마진율 유효성 검사
 */
export const validateMargin = (margin: number): boolean => {
  if (typeof margin !== 'number' || isNaN(margin)) return false;
  
  // 마진율은 -50% ~ 200% 사이로 제한
  return margin >= -50 && margin <= 200;
};

/**
 * 재고 수량 유효성 검사
 */
export const validateStock = (stock: number): boolean => {
  if (typeof stock !== 'number' || isNaN(stock)) return false;
  
  // 0 이상의 정수, 최대 999,999
  return Number.isInteger(stock) && stock >= 0 && stock <= 999999;
};

/**
 * 가격 유효성 검사
 */
export const validatePrice = (price: number): boolean => {
  if (typeof price !== 'number' || isNaN(price)) return false;
  
  // 0 이상, 소수점 2자리까지
  return price >= 0 && Math.round(price * 100) / 100 === price;
};

/**
 * 환율 유효성 검사
 */
export const validateExchangeRate = (rate: number): boolean => {
  if (typeof rate !== 'number' || isNaN(rate)) return false;
  
  // 0.00001 ~ 10000 범위
  return rate >= 0.00001 && rate <= 10000;
};

/**
 * 날짜 문자열 유효성 검사
 */
export const validateDateString = (dateStr: string): boolean => {
  if (!dateStr || typeof dateStr !== 'string') return false;
  
  const date = new Date(dateStr);
  return !isNaN(date.getTime());
};

/**
 * 날짜 범위 유효성 검사
 */
export const validateDateRange = (startDate: string, endDate: string): boolean => {
  if (!validateDateString(startDate) || !validateDateString(endDate)) return false;
  
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  return start <= end;
};

/**
 * API 키 형식 검사
 */
export const validateApiKey = (key: string): boolean => {
  if (!key || typeof key !== 'string') return false;
  
  // 32-128자의 영숫자
  return /^[a-zA-Z0-9]{32,128}$/.test(key);
};

/**
 * 이메일 유효성 검사
 */
export const validateEmail = (email: string): boolean => {
  if (!email || typeof email !== 'string') return false;
  
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailPattern.test(email);
};

/**
 * 페이지네이션 파라미터 검사
 */
export const validatePaginationParams = (page: number, limit: number): boolean => {
  if (typeof page !== 'number' || typeof limit !== 'number') return false;
  
  return page >= 1 && limit >= 1 && limit <= 100;
};

/**
 * 정렬 파라미터 검사
 */
export const validateSortParams = (sortBy: string, order: string, allowedFields: string[]): boolean => {
  if (!sortBy || !order) return false;
  
  return allowedFields.includes(sortBy) && ['asc', 'desc'].includes(order.toLowerCase());
};

/**
 * 동기화 모드 검사
 */
export const validateSyncMode = (mode: string): boolean => {
  const validModes = ['auto', 'manual', 'realtime', 'scheduled'];
  return validModes.includes(mode);
};

/**
 * 플랫폼 검사
 */
export const validatePlatform = (platform: string): boolean => {
  const validPlatforms = ['naver', 'shopify', 'both'];
  return validPlatforms.includes(platform);
};

/**
 * 조정 타입 검사
 */
export const validateAdjustType = (type: string): boolean => {
  const validTypes = ['set', 'add', 'subtract'];
  return validTypes.includes(type);
};

/**
 * 언어 코드 검사
 */
export const validateLanguageCode = (code: string): boolean => {
  return /^[a-z]{2}(-[A-Z]{2})?$/.test(code);
};

/**
 * 통화 코드 검사
 */
export const validateCurrencyCode = (code: string): boolean => {
  const validCurrencies = ['KRW', 'USD'];
  return validCurrencies.includes(code);
};

/**
 * Webhook 이벤트 타입 검사
 */
export const validateWebhookEvent = (event: string): boolean => {
  const validEvents = [
    'orders/create',
    'orders/updated',
    'orders/cancelled',
    'products/create',
    'products/update',
    'products/delete',
    'inventory_levels/update'
  ];
  return validEvents.includes(event);
};

/**
 * 파일 확장자 검사
 */
export const validateFileExtension = (filename: string, allowedExtensions: string[]): boolean => {
  if (!filename) return false;
  
  const extension = filename.split('.').pop()?.toLowerCase();
  return allowedExtensions.includes(extension || '');
};

/**
 * 파일 크기 검사 (바이트)
 */
export const validateFileSize = (size: number, maxSize: number): boolean => {
  return size > 0 && size <= maxSize;
};

/**
 * 배치 크기 검사
 */
export const validateBatchSize = (size: number): boolean => {
  // 1-1000개로 제한
  return Number.isInteger(size) && size >= 1 && size <= 1000;
};

/**
 * 시간대 검사
 */
export const validateTimezone = (timezone: string): boolean => {
  try {
    // Intl API를 사용하여 유효성 검사
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
};

/**
 * Cron 표현식 검사
 */
export const validateCronExpression = (expression: string): boolean => {
  // 간단한 cron 표현식 검사 (5개 필드)
  const cronPattern = /^(\*|([0-9]|[1-5][0-9])) (\*|([0-9]|1[0-9]|2[0-3])) (\*|([1-9]|[12][0-9]|3[01])) (\*|([1-9]|1[0-2])) (\*|[0-6])$/;
  return cronPattern.test(expression);
};

/**
 * IP 주소 검사
 */
export const validateIpAddress = (ip: string): boolean => {
  const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6Pattern = /^([\da-fA-F]{1,4}:){7}[\da-fA-F]{1,4}$/;
  
  if (ipv4Pattern.test(ip)) {
    // IPv4 각 옥텟이 0-255 범위인지 확인
    const octets = ip.split('.');
    return octets.every(octet => parseInt(octet) >= 0 && parseInt(octet) <= 255);
  }
  
  return ipv6Pattern.test(ip);
};

/**
 * URL 검사
 */
export const validateUrl = (url: string): boolean => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

/**
 * 객체 필수 필드 검사
 */
export const validateRequiredFields = <T extends object>(
  obj: T,
  requiredFields: (keyof T)[]
): { isValid: boolean; missingFields: string[] } => {
  const missingFields = requiredFields.filter(field => !obj[field]);
  
  return {
    isValid: missingFields.length === 0,
    missingFields: missingFields as string[]
  };
};