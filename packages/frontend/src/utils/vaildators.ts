// packages/frontend/src/utils/validators.ts
import { REGEX_PATTERNS } from './constants';

// SKU 유효성 검사
export function isValidSKU(sku: string): boolean {
  return REGEX_PATTERNS.SKU.test(sku);
}

// 이메일 유효성 검사
export function isValidEmail(email: string): boolean {
  return REGEX_PATTERNS.EMAIL.test(email);
}

// 네이버 상품 ID 유효성 검사
export function isValidNaverProductId(id: string): boolean {
  return REGEX_PATTERNS.NAVER_PRODUCT_ID.test(id);
}

// Shopify ID 유효성 검사
export function isValidShopifyId(id: string): boolean {
  return REGEX_PATTERNS.SHOPIFY_ID.test(id);
}

// 가격 유효성 검사
export function isValidPrice(price: number): boolean {
  return price >= 0 && Number.isFinite(price);
}

// 재고 수량 유효성 검사
export function isValidQuantity(quantity: number): boolean {
  return quantity >= 0 && Number.isInteger(quantity);
}

// 마진율 유효성 검사
export function isValidMargin(margin: number): boolean {
  return margin >= -100 && margin <= 1000;
}

// 날짜 범위 유효성 검사
export function isValidDateRange(startDate: Date, endDate: Date): boolean {
  return startDate <= endDate;
}

// URL 유효성 검사
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

// 필수 필드 검사
export function validateRequired<T extends Record<string, any>>(
  data: T,
  requiredFields: (keyof T)[]
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  requiredFields.forEach(field => {
    if (!data[field] || (typeof data[field] === 'string' && !data[field].trim())) {
      errors.push(`${String(field)}은(는) 필수 항목입니다.`);
    }
  });
  
  return {
    isValid: errors.length === 0,
    errors,
  };
}

// 매핑 데이터 유효성 검사
export function validateMappingData(data: any): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!isValidSKU(data.sku)) {
    errors.push('유효하지 않은 SKU 형식입니다.');
  }
  
  if (!isValidNaverProductId(data.naverProductId)) {
    errors.push('유효하지 않은 네이버 상품 ID입니다.');
  }
  
  if (!isValidShopifyId(data.shopifyProductId)) {
    errors.push('유효하지 않은 Shopify 상품 ID입니다.');
  }
  
  if (!isValidMargin(data.priceMargin)) {
    errors.push('마진율은 -100%에서 1000% 사이여야 합니다.');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
  };
}

// 재고 조정 데이터 유효성 검사
export function validateInventoryAdjustment(data: any): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!data.sku) {
    errors.push('SKU는 필수 항목입니다.');
  }
  
  if (!['naver', 'shopify', 'both'].includes(data.platform)) {
    errors.push('유효하지 않은 플랫폼입니다.');
  }
  
  if (!isValidQuantity(data.quantity)) {
    errors.push('재고 수량은 0 이상의 정수여야 합니다.');
  }
  
  if (!data.reason?.trim()) {
    errors.push('조정 사유를 입력해주세요.');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
  };
}

// 가격 설정 데이터 유효성 검사
export function validatePriceData(data: any): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!data.sku) {
    errors.push('SKU는 필수 항목입니다.');
  }
  
  if (!isValidPrice(data.naverPrice)) {
    errors.push('유효하지 않은 네이버 가격입니다.');
  }
  
  if (!isValidPrice(data.shopifyPrice)) {
    errors.push('유효하지 않은 Shopify 가격입니다.');
  }
  
  if (data.exchangeRate <= 0) {
    errors.push('환율은 0보다 커야 합니다.');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
  };
}