// packages/frontend/src/store/api/apiSlice.ts
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { ApiResponse, PaginatedResponse } from '@/types';
import { 
  Product, 
  InventoryStatus, 
  PriceHistory, 
  Mapping, 
  DashboardStats,
  InventoryTransaction,
  ExchangeRate 
} from '@/types/models';

const baseQuery = fetchBaseQuery({
  baseUrl: '/api/v1',
  prepareHeaders: (headers) => {
    const token = localStorage.getItem('token');
    if (token) {
      headers.set('authorization', `Bearer ${token}`);
    }
    return headers;
  },
});

export const apiSlice = createApi({
  reducerPath: 'api',
  baseQuery,
  tagTypes: ['Product', 'Inventory', 'Price', 'Mapping', 'Settings', 'Dashboard'],
  endpoints: (builder) => ({
    // 상품 엔드포인트
    getProducts: builder.query<PaginatedResponse<Product>, any>({
      query: (params) => ({
        url: '/products',
        params,
      }),
      providesTags: ['Product'],
    }),
    
    getProductBySku: builder.query<Product, string>({
      query: (sku) => `/products/${sku}`,
      providesTags: ['Product'],
    }),
    
    // 재고 엔드포인트
    getInventoryStatus: builder.query<InventoryStatus, string>({
      query: (sku) => `/inventory/${sku}/status`,
      providesTags: ['Inventory'],
    }),
    
    getInventoryHistory: builder.query<PaginatedResponse<InventoryTransaction>, any>({
      query: ({ sku, ...params }) => ({
        url: `/inventory/${sku}/history`,
        params,
      }),
      providesTags: ['Inventory'],
    }),
    
    adjustInventory: builder.mutation<void, any>({
      query: ({ sku, ...body }) => ({
        url: `/inventory/${sku}/adjust`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Inventory', 'Product'],
    }),
    
    bulkUpdateInventory: builder.mutation<void, { items: any[] }>({
      query: (body) => ({
        url: '/inventory/bulk-update',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Inventory', 'Product'],
    }),
    
    getLowStockItems: builder.query<Product[], void>({
      query: () => '/inventory/low-stock',
      providesTags: ['Inventory'],
    }),
    
    // 가격 엔드포인트
    getPriceHistory: builder.query<PaginatedResponse<PriceHistory>, any>({
      query: (params) => ({
        url: '/prices/history',
        params,
      }),
      providesTags: ['Price'],
    }),
    
    updatePrice: builder.mutation<void, any>({
      query: ({ sku, ...body }) => ({
        url: `/prices/${sku}`,
        method: 'PUT',
        body,
      }),
      invalidatesTags: ['Price', 'Product'],
    }),
    
    bulkUpdatePrices: builder.mutation<void, { items: any[] }>({
      query: (body) => ({
        url: '/prices/bulk-update',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Price', 'Product'],
    }),
    
    getExchangeRate: builder.query<ExchangeRate, void>({
      query: () => '/prices/exchange-rate',
      providesTags: ['Price'],
    }),
    
    updateExchangeRate: builder.mutation<ExchangeRate, { rate: number; isManual: boolean }>({
      query: (body) => ({
        url: '/prices/exchange-rate',
        method: 'PUT',
        body,
      }),
      invalidatesTags: ['Price'],
    }),
    
    // 매핑 엔드포인트
    getMappings: builder.query<PaginatedResponse<Mapping>, any>({
      query: (params) => ({
        url: '/mappings',
        params,
      }),
      providesTags: ['Mapping'],
    }),
    
    createMapping: builder.mutation<Mapping, Partial<Mapping>>({
      query: (body) => ({
        url: '/mappings',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Mapping'],
    }),
    
    updateMapping: builder.mutation<Mapping, { id: string; data: Partial<Mapping> }>({
      query: ({ id, data }) => ({
        url: `/mappings/${id}`,
        method: 'PUT',
        body: data,
      }),
      invalidatesTags: ['Mapping'],
    }),
    
    deleteMapping: builder.mutation<void, string>({
      query: (id) => ({
        url: `/mappings/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Mapping'],
    }),
    
    autoDiscoverMappings: builder.mutation<{ discovered: number; created: number }, void>({
      query: () => ({
        url: '/mappings/auto-discover',
        method: 'POST',
      }),
      invalidatesTags: ['Mapping'],
    }),
    
    // 동기화 엔드포인트
    performFullSync: builder.mutation<void, void>({
      query: () => ({
        url: '/sync/full',
        method: 'POST',
      }),
      invalidatesTags: ['Product', 'Inventory', 'Price'],
    }),
    
    syncInventory: builder.mutation<void, { sku?: string }>({
      query: (params) => ({
        url: '/sync/inventory',
        method: 'POST',
        body: params,
      }),
      invalidatesTags: ['Inventory'],
    }),
    
    syncPrices: builder.mutation<void, { sku?: string }>({
      query: (params) => ({
        url: '/sync/prices',
        method: 'POST',
        body: params,
      }),
      invalidatesTags: ['Price'],
    }),
    
    // 대시보드 엔드포인트
    getDashboardStats: builder.query<DashboardStats, void>({
      query: () => '/dashboard/stats',
      providesTags: ['Dashboard'],
    }),
    
    // 설정 엔드포인트
    getSettings: builder.query<any, string>({
      query: (category) => `/settings/${category}`,
      providesTags: ['Settings'],
    }),
    
    updateSettings: builder.mutation<void, { category: string; settings: any }>({
      query: ({ category, settings }) => ({
        url: `/settings/${category}`,
        method: 'PUT',
        body: settings,
      }),
      invalidatesTags: ['Settings'],
    }),
    
    testConnection: builder.mutation<{ success: boolean; message: string }, { platform: string; config: any }>({
      query: (body) => ({
        url: '/settings/test-connection',
        method: 'POST',
        body,
      }),
    }),
    
    // 리포트 엔드포인트
    generateReport: builder.mutation<Blob, { type: string; params: any }>({
      query: ({ type, params }) => ({
        url: `/reports/${type}`,
        method: 'POST',
        body: params,
        responseHandler: (response) => response.blob(),
      }),
    }),
    
    // 활동 로그
    getActivities: builder.query<any[], any>({
      query: (params) => ({
        url: '/activities',
        params,
      }),
    }),
  }),
});

// Export hooks for usage in functional components
export const {
  // Products
  useGetProductsQuery,
  useGetProductBySkuQuery,
  
  // Inventory
  useGetInventoryStatusQuery,
  useGetInventoryHistoryQuery,
  useAdjustInventoryMutation,
  useBulkUpdateInventoryMutation,
  useGetLowStockItemsQuery,
  
  // Prices
  useGetPriceHistoryQuery,
  useUpdatePriceMutation,
  useBulkUpdatePricesMutation,
  useGetExchangeRateQuery,
  useUpdateExchangeRateMutation,
  
  // Mappings
  useGetMappingsQuery,
  useCreateMappingMutation,
  useUpdateMappingMutation,
  useDeleteMappingMutation,
  useAutoDiscoverMappingsMutation,
  
  // Sync
  usePerformFullSyncMutation,
  useSyncInventoryMutation,
  useSyncPricesMutation,
  
  // Dashboard
  useGetDashboardStatsQuery,
  
  // Settings
  useGetSettingsQuery,
  useUpdateSettingsMutation,
  useTestConnectionMutation,
  
  // Reports
  useGenerateReportMutation,
  
  // Activities
  useGetActivitiesQuery,
} = apiSlice;

// 별칭 export 추가
export const useUpdatePricingMutation = useUpdatePriceMutation;