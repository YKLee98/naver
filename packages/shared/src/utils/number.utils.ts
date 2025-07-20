// packages/shared/src/utils/number.utils.ts
export function formatNumber(num: number, decimals: number = 0): string {
  return new Intl.NumberFormat('ko-KR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
}

export function formatCurrency(amount: number, currency: string = 'KRW'): string {
  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency,
  }).format(amount);
}

export function formatPercent(value: number, decimals: number = 1): string {
  return `${value.toFixed(decimals)}%`;
}

export function calculateMargin(cost: number, price: number): number {
  if (cost === 0) return 0;
  return ((price - cost) / cost) * 100;
}

export function calculatePrice(cost: number, marginPercent: number): number {
  return cost * (1 + marginPercent / 100);
}

