// packages/frontend/src/utils/formatters.ts
import { format, formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';

/**
 * 숫자 포맷팅 (천 단위 구분)
 */
export const formatNumber = (value: number | string): string => {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '0';
  
  return new Intl.NumberFormat('ko-KR').format(num);
};

/**
 * 통화 포맷팅
 */
export const formatCurrency = (value: number | string, currency: 'KRW' | 'USD' = 'KRW'): string => {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return currency === 'KRW' ? '₩0' : '$0';
  
  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: currency === 'KRW' ? 0 : 2,
    maximumFractionDigits: currency === 'KRW' ? 0 : 2,
  }).format(num);
};

/**
 * 날짜 포맷팅
 */
export const formatDate = (date: string | Date, formatString: string = 'yyyy-MM-dd'): string => {
  if (!date) return '-';
  
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(dateObj.getTime())) return '-';
  
  return format(dateObj, formatString, { locale: ko });
};

/**
 * 날짜/시간 포맷팅
 */
export const formatDateTime = (date: string | Date, formatString: string = 'yyyy-MM-dd HH:mm:ss'): string => {
  if (!date) return '-';
  
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(dateObj.getTime())) return '-';
  
  return format(dateObj, formatString, { locale: ko });
};

/**
 * 상대 시간 포맷팅 (예: 3분 전, 2시간 전)
 */
export const formatRelativeTime = (date: string | Date): string => {
  if (!date) return '-';
  
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(dateObj.getTime())) return '-';
  
  return formatDistanceToNow(dateObj, { addSuffix: true, locale: ko });
};

/**
 * 퍼센트 포맷팅
 */
export const formatPercent = (value: number, decimals: number = 1): string => {
  if (isNaN(value)) return '0%';
  
  return `${value.toFixed(decimals)}%`;
};

/**
 * 바이트 크기 포맷팅
 */
export const formatBytes = (bytes: number, decimals: number = 2): string => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

/**
 * SKU 포맷팅
 */
export const formatSku = (sku: string): string => {
  if (!sku) return '-';
  return sku.toUpperCase();
};

/**
 * 상태 라벨 변환
 */
export const formatStatus = (status: string): string => {
  const statusMap: Record<string, string> = {
    'active': '활성',
    'inactive': '비활성',
    'pending': '대기중',
    'success': '성공',
    'error': '오류',
    'warning': '경고',
    'normal': '정상',
    'synced': '동기화됨',
    'not_synced': '미동기화',
  };
  
  return statusMap[status.toLowerCase()] || status;
};

/**
 * 플랫폼 이름 변환
 */
export const formatPlatform = (platform: string): string => {
  const platformMap: Record<string, string> = {
    'naver': '네이버',
    'shopify': 'Shopify',
    'both': '양쪽',
  };
  
  return platformMap[platform.toLowerCase()] || platform;
};

/**
 * 전화번호 포맷팅
 */
export const formatPhone = (phone: string): string => {
  if (!phone) return '-';
  
  const cleaned = phone.replace(/\D/g, '');
  const match = cleaned.match(/^(\d{3})(\d{3,4})(\d{4})$/);
  
  if (match) {
    return `${match[1]}-${match[2]}-${match[3]}`;
  }
  
  return phone;
};

/**
 * 가격 차이 계산 및 포맷팅
 */
export const formatPriceDifference = (price1: number, price2: number): string => {
  const diff = price1 - price2;
  const percent = price2 !== 0 ? (diff / price2) * 100 : 0;
  
  const sign = diff > 0 ? '+' : '';
  return `${sign}${formatCurrency(diff)} (${sign}${formatPercent(percent)})`;
};

/**
 * 재고 상태 텍스트
 */
export const getStockStatusText = (stock: number, threshold: number = 10): string => {
  if (stock === 0) return '품절';
  if (stock < threshold) return '재고 부족';
  return '정상';
};

/**
 * 재고 상태 색상
 */
export const getStockStatusColor = (stock: number, threshold: number = 10): string => {
  if (stock === 0) return 'error';
  if (stock < threshold) return 'warning';
  return 'success';
};