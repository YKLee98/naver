import { format, parseISO, formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';

// 날짜 포맷
export function formatDate(date: string | Date, formatStr: string = 'yyyy-MM-dd'): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, formatStr, { locale: ko });
}

// 날짜/시간 포맷
export function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'yyyy-MM-dd HH:mm:ss', { locale: ko });
}

// 상대 시간 포맷
export function formatRelativeTime(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return formatDistanceToNow(d, { addSuffix: true, locale: ko });
}

// 숫자 포맷 (천 단위 구분)
export function formatNumber(value: number): string {
  return new Intl.NumberFormat('ko-KR').format(value);
}

// 통화 포맷
export function formatCurrency(value: number, currency: string = 'KRW'): string {
  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency,
  }).format(value);
}

// USD 포맷
export function formatUSD(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value);
}

// 퍼센트 포맷
export function formatPercent(value: number, decimals: number = 1): string {
  return `${value.toFixed(decimals)}%`;
}

// 파일 크기 포맷
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

// SKU 포맷
export function formatSKU(sku: string): string {
  return sku.toUpperCase().replace(/\s+/g, '-');
}

// 재고 상태 포맷
export function formatStockStatus(quantity: number): {
  text: string;
  color: 'success' | 'warning' | 'error';
} {
  if (quantity > 10) {
    return { text: '재고 충분', color: 'success' };
  } else if (quantity > 0) {
    return { text: '재고 부족', color: 'warning' };
  } else {
    return { text: '품절', color: 'error' };
  }
}

// 동기화 상태 포맷
export function formatSyncStatus(status: string): {
  text: string;
  color: 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning';
} {
  const statusMap: Record<string, any> = {
    synced: { text: '동기화됨', color: 'success' },
    pending: { text: '대기중', color: 'warning' },
    error: { text: '오류', color: 'error' },
  };
  
  return statusMap[status] || { text: status, color: 'default' };
}

// 가격 차이 포맷
export function formatPriceDifference(naverPrice: number, shopifyPrice: number): {
  difference: number;
  percentage: number;
  text: string;
} {
  const difference = shopifyPrice - naverPrice;
  const percentage = (difference / naverPrice) * 100;
  
  return {
    difference,
    percentage,
    text: `${difference >= 0 ? '+' : ''}${formatCurrency(difference)} (${formatPercent(percentage)})`,
  };
}
