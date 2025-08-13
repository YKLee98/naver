// packages/frontend/src/services/api/price.service.ts
import apiClient from './config';
import { PriceHistory, ExchangeRate } from '@/types/models';

export const priceApi = {
  // 가격 이력 조회
  getPriceHistory: async (params?: {
    sku?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }) => {
    const response = await apiClient.get<{
      data: PriceHistory[];
      total: number;
      page: number;
      totalPages: number;
    }>('/prices/history', { params });
    return response.data;
  },

  // 현재 가격 조회
  getCurrentPrices: async (sku?: string) => {
    const endpoint = sku ? `/prices/current/${sku}` : '/prices/current';
    const response = await apiClient.get(endpoint);
    return response.data;
  },

  // 가격 업데이트
  updatePrice: async (data: {
    sku: string;
    shopifyPrice: number;
    reason?: string;
  }) => {
    const response = await apiClient.post('/prices/update', data);
    return response.data;
  },

  // 일괄 가격 업데이트
  bulkUpdatePrices: async (data: {
    skus?: string[];
    marginPercent?: number;
    fixedMargin?: number;
    applyToAll?: boolean;
  }) => {
    const response = await apiClient.post('/prices/bulk-update', data);
    return response.data;
  },

  // 환율 조회
  getExchangeRates: async () => {
    const response = await apiClient.get<{
      data: ExchangeRate[];
    }>('/exchange-rates');
    return response.data;
  },

  // 현재 환율 조회
  getCurrentExchangeRate: async () => {
    const response = await apiClient.get<ExchangeRate>('/exchange-rates/current');
    return response.data;
  },

  // 환율 업데이트
  updateExchangeRate: async (data: {
    rate: number;
    isManual: boolean;
    validUntil?: string;
  }) => {
    const response = await apiClient.post('/exchange-rates/update', data);
    return response.data;
  },

  // 가격 계산 시뮬레이션
  simulatePriceCalculation: async (data: {
    naverPrice: number;
    exchangeRate?: number;
    marginPercent?: number;
  }) => {
    const response = await apiClient.post<{
      naverPrice: number;
      exchangeRate: number;
      marginPercent: number;
      calculatedPrice: number;
      finalPrice: number;
    }>('/prices/simulate', data);
    return response.data;
  },

  // 가격 규칙 설정
  setPricingRules: async (data: {
    defaultMargin: number;
    minMargin?: number;
    maxMargin?: number;
    roundingRule?: 'none' | 'up' | 'down' | 'nearest';
    roundingDigits?: number;
  }) => {
    const response = await apiClient.post('/prices/rules', data);
    return response.data;
  },

  // 가격 규칙 조회
  getPricingRules: async () => {
    const response = await apiClient.get('/prices/rules');
    return response.data;
  },

  // 가격 동기화
  syncPrices: async () => {
    const response = await apiClient.post('/sync/prices');
    return response.data;
  },
};