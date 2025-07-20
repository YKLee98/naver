// packages/shared/src/utils/validation.utils.ts
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function isValidSKU(sku: string): boolean {
  const skuRegex = /^[A-Za-z0-9\-_]+$/;
  return skuRegex.test(sku);
}

export function isValidProductId(id: string, platform: 'naver' | 'shopify'): boolean {
  if (platform === 'naver') {
    return /^\d+$/.test(id);
  }
  return /^\d+$/.test(id);
}

export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

