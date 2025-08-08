// ===== 1. packages/backend/src/utils/validators.ts =====
/**
 * SKU 유효성 검사 (유연한 규칙)
 * @param sku SKU 문자열
 * @returns 유효한 SKU인지 여부
 */
export function validateSKU(sku: string): boolean {
  if (!sku || typeof sku !== 'string') return false;
  
  // 기본적인 검증만 수행
  // - 최소 1자 이상
  // - 최대 100자 이하
  // - 공백만으로 이루어지지 않음
  const trimmedSku = sku.trim();
  
  if (trimmedSku.length < 1 || trimmedSku.length > 100) {
    return false;
  }
  
  // 거의 모든 문자 허용 (영문, 숫자, 한글, 특수문자 등)
  // 단, 제어 문자나 줄바꿈 문자는 제외
  const invalidCharsRegex = /[\x00-\x1F\x7F\r\n\t]/;
  if (invalidCharsRegex.test(trimmedSku)) {
    return false;
  }
  
  return true;
}

/**
 * 네이버 상품 ID 유효성 검사
 * @param id 네이버 상품 ID
 * @returns 유효한 ID인지 여부
 */
export function validateNaverProductId(id: string): boolean {
  if (!id || typeof id !== 'string') return false;
  
  // 네이버 상품 ID는 숫자 문자열
  const idRegex = /^\d+$/;
  return idRegex.test(id);
}

/**
 * Shopify 상품 ID 유효성 검사
 * @param id Shopify 상품 ID
 * @returns 유효한 ID인지 여부
 */
export function validateShopifyProductId(id: string): boolean {
  if (!id || typeof id !== 'string') return false;
  
  // Shopify 상품 ID 형식: gid://shopify/Product/숫자 또는 숫자만
  const gidRegex = /^gid:\/\/shopify\/Product\/\d+$/;
  const numericRegex = /^\d+$/;
  
  return gidRegex.test(id) || numericRegex.test(id);
}

/**
 * Shopify Variant ID 유효성 검사
 * @param id Shopify Variant ID
 * @returns 유효한 ID인지 여부
 */
export function validateShopifyVariantId(id: string): boolean {
  if (!id || typeof id !== 'string') return false;
  
  // Shopify Variant ID 형식: gid://shopify/ProductVariant/숫자 또는 숫자만
  const gidRegex = /^gid:\/\/shopify\/ProductVariant\/\d+$/;
  const numericRegex = /^\d+$/;
  
  return gidRegex.test(id) || numericRegex.test(id);
}

/**
 * 이메일 유효성 검사
 * @param email 이메일 주소
 * @returns 유효한 이메일인지 여부
 */
export function validateEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * 가격 마진 유효성 검사
 * @param margin 마진율 (0.0 ~ 1.0 또는 0 ~ 100)
 * @returns 유효한 마진율인지 여부
 */
export function validatePriceMargin(margin: number): boolean {
  if (typeof margin !== 'number' || isNaN(margin)) return false;
  
  // 0.0 ~ 1.0 범위 (소수) 또는 0 ~ 100 범위 (퍼센트)
  return (margin >= 0 && margin <= 1) || (margin >= 0 && margin <= 100);
}

/**
 * 재고 수량 유효성 검사
 * @param quantity 재고 수량
 * @returns 유효한 수량인지 여부
 */
export function validateQuantity(quantity: number): boolean {
  if (typeof quantity !== 'number' || isNaN(quantity)) return false;
  
  // 음수가 아닌 정수
  return quantity >= 0 && Number.isInteger(quantity);
}

/**
 * URL 유효성 검사
 * @param url URL 문자열
 * @returns 유효한 URL인지 여부
 */
export function validateURL(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * 날짜 유효성 검사
 * @param date 날짜 문자열 또는 Date 객체
 * @returns 유효한 날짜인지 여부
 */
export function validateDate(date: string | Date): boolean {
  if (!date) return false;
  
  const d = date instanceof Date ? date : new Date(date);
  return !isNaN(d.getTime());
}

/**
 * 전화번호 유효성 검사 (한국)
 * @param phone 전화번호
 * @returns 유효한 전화번호인지 여부
 */
export function validatePhoneNumber(phone: string): boolean {
  if (!phone || typeof phone !== 'string') return false;
  
  // 한국 전화번호 형식 (휴대폰, 일반 전화)
  const phoneRegex = /^(01[0-9]{1}|02|0[3-9]{1}[0-9]{1})-?[0-9]{3,4}-?[0-9]{4}$/;
  return phoneRegex.test(phone.replace(/\s/g, ''));
}

/**
 * 벤더명 유효성 검사
 * @param vendor 벤더명
 * @returns 유효한 벤더명인지 여부
 */
export function validateVendor(vendor: string): boolean {
  if (!vendor || typeof vendor !== 'string') return false;
  
  // 영문, 숫자, 한글, 공백, 하이픈, 언더스코어 허용
  // 최소 1자, 최대 100자
  const vendorRegex = /^[A-Za-z0-9가-힣\s_-]{1,100}$/;
  return vendorRegex.test(vendor);
}

/**
 * 배치 크기 유효성 검사
 * @param size 배치 크기
 * @returns 유효한 배치 크기인지 여부
 */
export function validateBatchSize(size: number): boolean {
  if (typeof size !== 'number' || isNaN(size)) return false;
  
  // 1 ~ 1000 사이의 정수
  return size >= 1 && size <= 1000 && Number.isInteger(size);
}
