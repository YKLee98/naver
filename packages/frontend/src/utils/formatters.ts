// ===== 1. packages/frontend/src/utils/formatters.ts =====
/**
 * 날짜/시간 포맷팅
 */
export const formatDateTime = (date: string | Date | null | undefined): string => {
  if (!date) return '-';
  
  try {
    const d = new Date(date);
    
    // Invalid Date 체크
    if (isNaN(d.getTime())) {
      return '-';
    }
    
    return d.toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch (error) {
    console.error('Date formatting error:', error);
    return '-';
  }
};

/**
 * 날짜만 포맷팅
 */
export const formatDate = (date: string | Date | null | undefined): string => {
  if (!date) return '-';
  
  try {
    const d = new Date(date);
    
    if (isNaN(d.getTime())) {
      return '-';
    }
    
    return d.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch (error) {
    console.error('Date formatting error:', error);
    return '-';
  }
};

/**
 * 상대 시간 포맷팅 (예: 5분 전, 2시간 전)
 */
export const formatRelativeTime = (date: string | Date | null | undefined): string => {
  if (!date) return '-';
  
  try {
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) {
      return `${days}일 전`;
    } else if (hours > 0) {
      return `${hours}시간 전`;
    } else if (minutes > 0) {
      return `${minutes}분 전`;
    } else {
      return '방금 전';
    }
  } catch (error) {
    return '-';
  }
};

/**
 * 통화 포맷팅
 */
export const formatCurrency = (
  amount: number | string | null | undefined,
  currency: 'KRW' | 'USD' = 'KRW'
): string => {
  if (amount === null || amount === undefined) return '-';
  
  try {
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    
    if (isNaN(numAmount)) {
      return '-';
    }
    
    return new Intl.NumberFormat('ko-KR', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: currency === 'KRW' ? 0 : 2,
      maximumFractionDigits: currency === 'KRW' ? 0 : 2,
    }).format(numAmount);
  } catch (error) {
    console.error('Currency formatting error:', error);
    return '-';
  }
};

/**
 * 숫자 포맷팅 (천단위 콤마)
 */
export const formatNumber = (
  value: number | string | null | undefined,
  decimals: number = 0
): string => {
  if (value === null || value === undefined) return '-';
  
  try {
    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    
    if (isNaN(numValue)) {
      return '-';
    }
    
    return new Intl.NumberFormat('ko-KR', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(numValue);
  } catch (error) {
    console.error('Number formatting error:', error);
    return '-';
  }
};

/**
 * 퍼센트 포맷팅
 */
export const formatPercent = (
  value: number | string | null | undefined,
  decimals: number = 0
): string => {
  if (value === null || value === undefined) return '-';
  
  try {
    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    
    if (isNaN(numValue)) {
      return '-';
    }
    
    return `${numValue.toFixed(decimals)}%`;
  } catch (error) {
    console.error('Percent formatting error:', error);
    return '-';
  }
};

/**
 * 파일 크기 포맷팅
 */
export const formatFileSize = (bytes: number): string => {
  if (!bytes || bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

/**
 * SKU 포맷팅 (대문자 변환)
 */
export const formatSKU = (sku: string | null | undefined): string => {
  if (!sku) return '-';
  return sku.toUpperCase().trim();
};
