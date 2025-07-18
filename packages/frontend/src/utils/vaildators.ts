// 이메일 검증
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// SKU 검증
export function isValidSKU(sku: string): boolean {
  const skuRegex = /^[A-Za-z0-9\-_]+$/;
  return skuRegex.test(sku) && sku.length >= 3 && sku.length <= 50;
}

// 가격 검증
export function isValidPrice(price: number): boolean {
  return price > 0 && Number.isFinite(price);
}

// 재고 수량 검증
export function isValidQuantity(quantity: number): boolean {
  return Number.isInteger(quantity) && quantity >= 0;
}

// 마진율 검증
export function isValidMargin(margin: number): boolean {
  return margin >= 1 && margin <= 5; // 100% ~ 500%
}

// 네이버 상품 ID 검증
export function isValidNaverProductId(id: string): boolean {
  return /^\d+$/.test(id);
}

// Shopify ID 검증
export function isValidShopifyId(id: string | number): boolean {
  return /^\d+$/.test(id.toString());
}

// 날짜 범위 검증
export function isValidDateRange(startDate: string, endDate: string): boolean {
  const start = new Date(startDate);
  const end = new Date(endDate);
  return start <= end;
}

// 필수 필드 검증
export function validateRequired<T extends Record<string, any>>(
  data: T,
  requiredFields: (keyof T)[]
): { isValid: boolean; errors: Record<keyof T, string> } {
  const errors: any = {};
  let isValid = true;

  requiredFields.forEach((field) => {
    if (!data[field]) {
      errors[field] = '필수 입력 항목입니다.';
      isValid = false;
    }
  });

  return { isValid, errors };
}

// 매핑 데이터 검증
export function validateMappingData(data: any): {
  isValid: boolean;
  errors: Record<string, string>;
} {
  const errors: Record<string, string> = {};

  if (!isValidSKU(data.sku)) {
    errors.sku = '올바른 SKU 형식이 아닙니다.';
  }

  if (!isValidNaverProductId(data.naverProductId)) {
    errors.naverProductId = '올바른 네이버 상품 ID가 아닙니다.';
  }

  if (!isValidShopifyId(data.shopifyProductId)) {
    errors.shopifyProductId = '올바른 Shopify 상품 ID가 아닙니다.';
  }

  if (!isValidShopifyId(data.shopifyVariantId)) {
    errors.shopifyVariantId = '올바른 Shopify Variant ID가 아닙니다.';
  }

  if (data.priceMargin && !isValidMargin(data.priceMargin)) {
    errors.priceMargin = '마진율은 1.0에서 5.0 사이여야 합니다.';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}
