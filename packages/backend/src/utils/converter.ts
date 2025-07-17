
/**
 * 네이버 가격을 Shopify 가격으로 변환
 */
export function convertNaverPriceToShopify(
  naverPrice: number,
  exchangeRate: number,
  margin: number = 1.15
): number {
  const usdPrice = naverPrice / exchangeRate;
  const finalPrice = usdPrice * margin;
  // 소수점 2자리로 반올림
  return Math.round(finalPrice * 100) / 100;
}

/**
 * Shopify 가격을 네이버 가격으로 변환
 */
export function convertShopifyPriceToNaver(
  shopifyPrice: number,
  exchangeRate: number,
  margin: number = 1.15
): number {
  const usdPrice = shopifyPrice / margin;
  const krwPrice = usdPrice * exchangeRate;
  // 원화는 정수로 반올림
  return Math.round(krwPrice);
}

/**
 * Shopify GraphQL ID를 숫자 ID로 변환
 */
export function extractNumericId(gid: string): string {
  // gid://shopify/Product/1234567890 -> 1234567890
  const parts = gid.split('/');
  return parts[parts.length - 1];
}

/**
 * 숫자 ID를 Shopify GraphQL ID로 변환
 */
export function createGraphQLId(resource: string, id: string): string {
  return `gid://shopify/${resource}/${id}`;
}

/**
 * ISO 날짜 문자열을 Date 객체로 변환
 */
export function parseISODate(dateString: string): Date {
  return new Date(dateString);
}

/**
 * Date 객체를 ISO 날짜 문자열로 변환
 */
export function toISOString(date: Date): string {
  return date.toISOString();
}

/**
 * 네이버 날짜 형식 변환
 */
export function formatNaverDate(date: Date): string {
  // YYYY-MM-DD HH:mm:ss
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * 재고 수량 정규화
 */
export function normalizeQuantity(quantity: any): number {
  const parsed = parseInt(quantity, 10);
  return isNaN(parsed) || parsed < 0 ? 0 : parsed;
}

/**
 * SKU 정규화
 */
export function normalizeSku(sku: string): string {
  return sku.trim().toUpperCase().replace(/\s+/g, '-');
}

/**
 * 전화번호 정규화
 */
export function normalizePhoneNumber(phone: string): string {
  // 숫자만 추출
  const numbers = phone.replace(/\D/g, '');
  
  // 한국 전화번호 형식으로 변환
  if (numbers.startsWith('82')) {
    return `+${numbers}`;
  } else if (numbers.startsWith('0')) {
    return `+82${numbers.substring(1)}`;
  }
  
  return numbers;
}

/**
 * 바이트 크기를 읽기 쉬운 형식으로 변환
 */
export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * 퍼센트 계산
 */
export function calculatePercentage(value: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((value / total) * 100 * 100) / 100;
}

/**
 * 배열을 청크로 분할
 */
export function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  
  return chunks;
}

/**
 * 객체에서 null과 undefined 값 제거
 */
export function removeNullish<T extends object>(obj: T): Partial<T> {
  return Object.entries(obj).reduce((acc, [key, value]) => {
    if (value !== null && value !== undefined) {
      acc[key as keyof T] = value;
    }
    return acc;
  }, {} as Partial<T>);
}


