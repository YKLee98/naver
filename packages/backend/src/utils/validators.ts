// packages/backend/src/utils/validators.ts

/**
 * SKU 유효성 검사 (유연한 규칙)
 * @param sku SKU 문자열
 * @returns 유효한 SKU인지 여부
 */
export const validateSKU = (sku: string): boolean => {
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
};

/**
 * 상품 ID 유효성 검사
 */
export const validateProductId = (
  id: string,
  platform: 'naver' | 'shopify'
): boolean => {
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
 * 네이버 상품 ID 유효성 검사
 * @param id 네이버 상품 ID
 * @returns 유효한 ID인지 여부
 */
export const validateNaverProductId = (id: string): boolean => {
  if (!id || typeof id !== 'string') return false;

  // 네이버 상품 ID는 숫자 문자열
  const idRegex = /^\d+$/;
  return idRegex.test(id);
};

/**
 * Shopify 상품 ID 유효성 검사
 * @param id Shopify 상품 ID
 * @returns 유효한 ID인지 여부
 */
export const validateShopifyProductId = (id: string): boolean => {
  if (!id || typeof id !== 'string') return false;

  // Shopify 상품 ID 형식: gid://shopify/Product/숫자 또는 숫자만
  const gidRegex = /^gid:\/\/shopify\/Product\/\d+$/;
  const numericRegex = /^\d+$/;

  return gidRegex.test(id) || numericRegex.test(id);
};

/**
 * Shopify Variant ID 유효성 검사
 * @param id Shopify Variant ID
 * @returns 유효한 ID인지 여부
 */
export const validateShopifyVariantId = (id: string): boolean => {
  if (!id || typeof id !== 'string') return false;

  // Shopify Variant ID 형식: gid://shopify/ProductVariant/숫자 또는 숫자만
  const gidRegex = /^gid:\/\/shopify\/ProductVariant\/\d+$/;
  const numericRegex = /^\d+$/;

  return gidRegex.test(id) || numericRegex.test(id);
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
export const validateDateRange = (
  startDate: string,
  endDate: string
): boolean => {
  if (!validateDateString(startDate) || !validateDateString(endDate))
    return false;

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
 * URL 유효성 검사
 */
export const validateUrl = (url: string): boolean => {
  if (!url || typeof url !== 'string') return false;

  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

/**
 * 전화번호 유효성 검사 (한국)
 */
export const validatePhoneNumber = (phone: string): boolean => {
  if (!phone || typeof phone !== 'string') return false;

  // 한국 전화번호 형식: 010-xxxx-xxxx, 02-xxxx-xxxx 등
  const phonePattern = /^0\d{1,2}-?\d{3,4}-?\d{4}$/;
  return phonePattern.test(phone.replace(/\s/g, ''));
};

/**
 * 우편번호 유효성 검사 (한국)
 */
export const validatePostalCode = (code: string): boolean => {
  if (!code || typeof code !== 'string') return false;

  // 한국 우편번호: 5자리 숫자
  const postalPattern = /^\d{5}$/;
  return postalPattern.test(code.replace(/\s/g, ''));
};

/**
 * 사업자등록번호 유효성 검사
 */
export const validateBusinessNumber = (number: string): boolean => {
  if (!number || typeof number !== 'string') return false;

  // 사업자등록번호: xxx-xx-xxxxx
  const bizPattern = /^\d{3}-?\d{2}-?\d{5}$/;
  return bizPattern.test(number.replace(/\s/g, ''));
};
