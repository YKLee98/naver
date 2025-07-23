import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { ApiResponse, PaginatedResponse } from '@/types';
import { Product, InventoryStatus, PriceHistory, Mapping, DashboardStats } from '@/types/models';
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
    getProducts: builder.query({
      query: (params) => ({
        url: '/products',
        params,
      }),
      providesTags: ['Product'],
    }),
    
    getProductBySku: builder.query({
      query: (sku) => `/products/${sku}`,
      providesTags: ['Product'],
    }),
    
    // 재고 엔드포인트
    getInventoryStatus: builder.query({
      query: (sku) => `/inventory/${sku}/status`,
      providesTags: ['Inventory'],
    }),
    
    getInventoryHistory: builder.query({
      query: ({ sku, ...params }) => ({
        url: `/inventory/${sku}/history`,
        params,
      }),
      providesTags: ['Inventory'],
    }),
    
    adjustInventory: builder.mutation({
      query: ({ sku, ...body }) => ({
        url: `/inventory/${sku}/adjust`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Inventory'],
    }),
    
    getLowStockProducts: builder.query({
      query: (params) => ({
        url: '/inventory/low-stock',
        params,
      }),
      providesTags: ['Inventory'],
    }),
    
    // 동기화 엔드포인트
    performFullSync: builder.mutation({
      query: () => ({
        url: '/sync/full',
        method: 'POST',
      }),
      invalidatesTags: ['Product', 'Inventory', 'Price'],
    }),
    
    syncSingleSku: builder.mutation({
      query: (sku) => ({
        url: `/sync/sku/${sku}`,
        method: 'POST',
      }),
      invalidatesTags: ['Product', 'Inventory', 'Price'],
    }),
    
    getSyncStatus: builder.query({
      query: () => '/sync/status',
      providesTags: ['Settings'],
    }),
    
    getSyncSettings: builder.query({
      query: () => '/sync/settings',
      providesTags: ['Settings'],
    }),
    
    updateSyncSettings: builder.mutation({
      query: (body) => ({
        url: '/sync/settings',
        method: 'PUT',
        body,
      }),
      invalidatesTags: ['Settings'],
    }),
    
    // 매핑 엔드포인트
    createMapping: builder.mutation({
      query: (body) => ({
        url: '/mappings',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Mapping'],
    }),
    
    updateMapping: builder.mutation({
      query: ({ id, ...body }) => ({
        url: `/mappings/${id}`,
        method: 'PUT',
        body,
      }),
      invalidatesTags: ['Mapping'],
    }),
    
    deleteMapping: builder.mutation({
      query: (id) => ({
        url: `/mappings/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Mapping'],
    }),
    
    autoDiscoverMappings: builder.mutation({
      query: () => ({
        url: '/mappings/auto-discover',
        method: 'POST',
      }),
    }),
    
    validateMapping: builder.mutation({
      query: (id) => ({
        url: `/mappings/${id}/validate`,
        method: 'POST',
      }),
    }),
    
    bulkUploadMappings: builder.mutation({
      query: (body) => ({
        url: '/mappings/bulk',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Mapping'],
    }),
    
    // 대시보드 엔드포인트
    getDashboardStats: builder.query({
      query: () => '/dashboard/statistics',
      providesTags: ['Dashboard'],
    }),
    
    getRecentActivities: builder.query({
      query: (params) => ({
        url: '/dashboard/activities',
        params,
      }),
      providesTags: ['Dashboard'],
    }),
    
    getPriceChartData: builder.query({
      query: (params) => ({
        url: '/dashboard/charts/price',
        params,
      }),
      providesTags: ['Price'],
    }),
    
    getInventoryChartData: builder.query({
      query: (params) => ({
        url: '/dashboard/charts/inventory',
        params,
      }),
      providesTags: ['Inventory'],
    }),
    
    // Naver 상품 검색
    searchNaverProducts: builder.query({
      query: (params) => ({
        url: '/products/search/naver',
        params,
      }),
    }),
    
    // Shopify 상품 검색
    searchShopifyProducts: builder.query({
      query: (params) => ({
        url: '/products/search/shopify',
        params,
      }),
    }),
  }),
});

export const {
  useGetProductsQuery,
  useGetProductBySkuQuery,
  useGetInventoryStatusQuery,
  useGetInventoryHistoryQuery,
  useAdjustInventoryMutation,
  useGetLowStockProductsQuery,
  usePerformFullSyncMutation,
  useSyncSingleSkuMutation,
  useGetSyncStatusQuery,
  useGetSyncSettingsQuery,
  useUpdateSyncSettingsMutation,
  useCreateMappingMutation,
  useUpdateMappingMutation,
  useDeleteMappingMutation,
  useAutoDiscoverMappingsMutation,
  useValidateMappingMutation,
  useBulkUploadMappingsMutation,
  useGetDashboardStatsQuery,
  useGetRecentActivitiesQuery,
  useGetPriceChartDataQuery,
  useGetInventoryChartDataQuery,
  useSearchNaverProductsQuery,
  useSearchShopifyProductsQuery,
} = apiSlice;
