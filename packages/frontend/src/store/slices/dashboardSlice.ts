// packages/frontend/src/store/slices/dashboardSlice.ts
import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { DashboardStats, Activity } from '@/types/models';
import { apiSlice } from '@/store/api/apiSlice';

interface DashboardState {
  stats: DashboardStats | null;
  activities: Activity[];
  inventoryChartData: any[];
  salesChartData: any[];
  loading: boolean;
  error: string | null;
}

const initialState: DashboardState = {
  stats: null,
  activities: [],
  inventoryChartData: [],
  salesChartData: [],
  loading: false,
  error: null,
};

// Async thunks
export const fetchInventoryChartData = createAsyncThunk(
  'dashboard/fetchInventoryChart',
  async () => {
    // Simulated data - replace with actual API call
    return [
      { category: '앨범', naver: 120, shopify: 118, difference: 2 },
      { category: '굿즈', naver: 80, shopify: 75, difference: 5 },
      { category: '포토북', naver: 45, shopify: 45, difference: 0 },
      { category: '기타', naver: 30, shopify: 28, difference: 2 },
    ];
  }
);

export const fetchSalesChartData = createAsyncThunk(
  'dashboard/fetchSalesChart',
  async () => {
    // Simulated data - replace with actual API call
    const data = [];
    const now = new Date();
    
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      
      data.push({
        date: date.toISOString().split('T')[0],
        naver: Math.floor(Math.random() * 1000000) + 500000,
        shopify: Math.floor(Math.random() * 800000) + 400000,
      });
    }
    
    return data;
  }
);

const dashboardSlice = createSlice({
  name: 'dashboard',
  initialState,
  reducers: {
    setStats: (state, action: PayloadAction<DashboardStats>) => {
      state.stats = action.payload;
    },
    
    updateDashboardStats: (state, action: PayloadAction<Partial<DashboardStats>>) => {
      if (state.stats) {
        state.stats = { ...state.stats, ...action.payload };
      }
    },
    
    setActivities: (state, action: PayloadAction<Activity[]>) => {
      state.activities = action.payload;
    },
    
    addActivity: (state, action: PayloadAction<Activity>) => {
      state.activities.unshift(action.payload);
      // 최대 50개까지만 보관
      if (state.activities.length > 50) {
        state.activities = state.activities.slice(0, 50);
      }
      
      // stats의 recentActivity도 업데이트
      if (state.stats) {
        state.stats.recentActivity.unshift(action.payload);
        if (state.stats.recentActivity.length > 10) {
          state.stats.recentActivity = state.stats.recentActivity.slice(0, 10);
        }
      }
    },
    
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
    
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
    
    clearDashboardState: (state) => {
      return initialState;
    },
  },
  extraReducers: (builder) => {
    builder
      // Inventory Chart
      .addCase(fetchInventoryChartData.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchInventoryChartData.fulfilled, (state, action) => {
        state.inventoryChartData = action.payload;
        state.loading = false;
      })
      .addCase(fetchInventoryChartData.rejected, (state, action) => {
        state.error = action.error.message || 'Failed to fetch inventory chart data';
        state.loading = false;
      })
      // Sales Chart
      .addCase(fetchSalesChartData.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchSalesChartData.fulfilled, (state, action) => {
        state.salesChartData = action.payload;
        state.loading = false;
      })
      .addCase(fetchSalesChartData.rejected, (state, action) => {
        state.error = action.error.message || 'Failed to fetch sales chart data';
        state.loading = false;
      });
  },
});

export const {
  setStats,
  updateDashboardStats,
  setActivities,
  addActivity,
  setLoading,
  setError,
  clearDashboardState,
} = dashboardSlice.actions;

export default dashboardSlice.reducer;