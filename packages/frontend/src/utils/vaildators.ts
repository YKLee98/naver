// packages/frontend/src/utils/validators.ts

/**
 * SKU 유효성 검사
 */
export const validateSKU = (sku: string): boolean => {
  if (!sku) return false;
  
  // SKU 패턴: 영문, 숫자, 하이픈(-), 언더바(_)만 허용
  const skuPattern = /^[A-Z0-9_-]+$/i;
  return skuPattern.test(sku);
};

/**
 * 이메일 유효성 검사
 */
export const validateEmail = (email: string): boolean => {
  if (!email) return false;
  
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailPattern.test(email);
};

/**
 * 전화번호 유효성 검사
 */
export const validatePhone = (phone: string): boolean => {
  if (!phone) return false;
  
  // 한국 전화번호 패턴
  const phonePattern = /^(010|011|016|017|018|019)-?\d{3,4}-?\d{4}$/;
  return phonePattern.test(phone.replace(/\s/g, ''));
};

/**
 * 숫자 범위 검증
 */
export const validateNumberRange = (value: number, min: number, max: number): boolean => {
  return !isNaN(value) && value >= min && value <= max;
};

/**
 * 양수 검증
 */
export const validatePositiveNumber = (value: number): boolean => {
  return !isNaN(value) && value > 0;
};

/**
 * 0 이상의 정수 검증
 */
export const validateNonNegativeInteger = (value: number): boolean => {
  return !isNaN(value) && value >= 0 && Number.isInteger(value);
};

/**
 * 퍼센트 값 검증 (0-100)
 */
export const validatePercent = (value: number): boolean => {
  return validateNumberRange(value, 0, 100);
};

/**
 * URL 유효성 검사
 */
export const validateUrl = (url: string): boolean => {
  if (!url) return false;
  
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

/**
 * 날짜 유효성 검사
 */
export const validateDate = (date: string | Date): boolean => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return !isNaN(dateObj.getTime());
};

/**
 * 날짜 범위 검증
 */
export const validateDateRange = (startDate: Date, endDate: Date): boolean => {
  return validateDate(startDate) && validateDate(endDate) && startDate <= endDate;
};

/**
 * 파일 확장자 검증
 */
export const validateFileExtension = (filename: string, allowedExtensions: string[]): boolean => {
  if (!filename) return false;
  
  const extension = filename.split('.').pop()?.toLowerCase();
  return allowedExtensions.includes(extension || '');
};

/**
 * 파일 크기 검증 (바이트 단위)
 */
export const validateFileSize = (size: number, maxSize: number): boolean => {
  return size > 0 && size <= maxSize;
};

/**
 * 상품 ID 검증 (네이버/Shopify)
 */
export const validateProductId = (id: string): boolean => {
  if (!id) return false;
  
  // 네이버: 숫자, Shopify: gid://shopify/Product/숫자 또는 숫자
  const naverPattern = /^\d+$/;
  const shopifyPattern = /^(gid:\/\/shopify\/Product\/)?\d+$/;
  
  return naverPattern.test(id) || shopifyPattern.test(id);
};

/**
 * 마진율 검증
 */
export const validateMargin = (margin: number): boolean => {
  // 마진율은 -50% ~ 200% 사이로 제한
  return validateNumberRange(margin, -50, 200);
};

/**
 * 재고 수량 검증
 */
export const validateStock = (stock: number): boolean => {
  return validateNonNegativeInteger(stock) && stock <= 999999;
};

/**
 * 비밀번호 강도 검증
 */
export const validatePasswordStrength = (password: string): {
  isValid: boolean;
  errors: string[];
} => {
  const errors: string[] = [];
  
  if (password.length < 8) {
    errors.push('비밀번호는 8자 이상이어야 합니다');
  }
  
  if (!/[A-Z]/.test(password)) {
    errors.push('대문자를 포함해야 합니다');
  }
  
  if (!/[a-z]/.test(password)) {
    errors.push('소문자를 포함해야 합니다');
  }
  
  if (!/[0-9]/.test(password)) {
    errors.push('숫자를 포함해야 합니다');
  }
  
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push('특수문자를 포함해야 합니다');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * 검색어 검증 및 정제
 */
export const sanitizeSearchTerm = (term: string): string => {
  if (!term) return '';
  
  // 특수문자 제거 (일부 허용)
  return term.replace(/[^a-zA-Z0-9가-힣\s\-_]/g, '').trim();
};

/**
 * 배치 작업 크기 검증
 */
export const validateBatchSize = (size: number): boolean => {
  // 배치 작업은 1-1000개로 제한
  return validateNumberRange(size, 1, 1000);
};

/**
 * API 키 형식 검증
 */
export const validateApiKey = (key: string): boolean => {
  if (!key) return false;
  
  // 일반적인 API 키 패턴 (32-128자의 영숫자)
  return /^[a-zA-Z0-9]{32,128}$/.test(key);
};

/**
 * 시간대 검증
 */
export const validateTimezone = (timezone: string): boolean => {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
};

/**
 * 언어 코드 검증 (ISO 639-1)
 */
export const validateLanguageCode = (code: string): boolean => {
  return /^[a-z]{2}(-[A-Z]{2})?$/.test(code);
};

/**
 * 통화 코드 검증 (ISO 4217)
 */
export const validateCurrencyCode = (code: string): boolean => {
  const validCurrencies = ['KRW', 'USD', 'EUR', 'JPY', 'CNY', 'GBP'];
  return validCurrencies.includes(code);
};