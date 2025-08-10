// packages/frontend/src/store/slices/dashboardSlice.ts
import { createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit';
import { dashboardService } from '@/services/api/dashboard.service';

interface DashboardState {
  stats: any | null;
  activities: any[];
  salesChart: any | null;
  inventoryChart: any | null;
  syncChart: any | null;
  notifications: any[];
  dateRange: {
    start: string;
    end: string;
  };
  autoRefresh: boolean;
  refreshInterval: number;
  loading: boolean;
  error: string | null;
}

const initialState: DashboardState = {
  stats: null,
  activities: [],
  salesChart: null,
  inventoryChart: null,
  syncChart: null,
  notifications: [],
  dateRange: {
    start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    end: new Date().toISOString(),
  },
  autoRefresh: true,
  refreshInterval: 60000, // 1 minute
  loading: false,
  error: null,
};

// Async thunks
export const fetchDashboardStats = createAsyncThunk(
  'dashboard/fetchStats',
  async () => {
    const response = await dashboardService.getStatistics();
    return response.data.data;
  }
);

export const fetchRecentActivity = createAsyncThunk(
  'dashboard/fetchActivity',
  async (params?: { limit?: number; offset?: number; type?: string }) => {
    const response = await dashboardService.getRecentActivities(params);
    return response.data.data;
  }
);

export const fetchSalesChart = createAsyncThunk(
  'dashboard/fetchSalesChart',
  async (params?: { period?: string; platform?: string }) => {
    const response = await dashboardService.getSalesChartData(params);
    return response.data.data;
  }
);

export const fetchInventoryChart = createAsyncThunk(
  'dashboard/fetchInventoryChart',
  async (params?: { period?: string; sku?: string }) => {
    const response = await dashboardService.getInventoryChartData(params);
    return response.data.data;
  }
);

export const fetchSyncChart = createAsyncThunk(
  'dashboard/fetchSyncChart',
  async (params?: { period?: string }) => {
    const response = await dashboardService.getSyncChartData(params);
    return response.data.data;
  }
);

export const fetchNotifications = createAsyncThunk(
  'dashboard/fetchNotifications',
  async (params?: { status?: string; severity?: string }) => {
    const response = await dashboardService.getAlerts(params);
    return response.data.data;
  }
);

export const markNotificationRead = createAsyncThunk(
  'dashboard/markNotificationRead',
  async (id: string) => {
    const response = await dashboardService.acknowledgeAlert(id);
    return response.data.data;
  }
);

export const fetchSystemHealth = createAsyncThunk(
  'dashboard/fetchSystemHealth',
  async () => {
    // This would call a system health endpoint
    return { status: 'healthy' };
  }
);

const dashboardSlice = createSlice({
  name: 'dashboard',
  initialState,
  reducers: {
    setDashboardStats: (state, action: PayloadAction<any>) => {
      state.stats = action.payload;
    },
    setActivities: (state, action: PayloadAction<any[]>) => {
      state.activities = action.payload;
    },
    addActivity: (state, action: PayloadAction<any>) => {
      state.activities.unshift(action.payload);
      // Keep only last 100 activities
      if (state.activities.length > 100) {
        state.activities = state.activities.slice(0, 100);
      }
    },
    setDateRange: (state, action: PayloadAction<{ start: string; end: string }>) => {
      state.dateRange = action.payload;
    },
    toggleAutoRefresh: (state) => {
      state.autoRefresh = !state.autoRefresh;
    },
    setRefreshInterval: (state, action: PayloadAction<number>) => {
      state.refreshInterval = action.payload;
    },
    addNotification: (state, action: PayloadAction<any>) => {
      state.notifications.unshift(action.payload);
    },
    removeNotification: (state, action: PayloadAction<string>) => {
      state.notifications = state.notifications.filter(n => n.id !== action.payload);
    },
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    // Fetch dashboard stats
    builder
      .addCase(fetchDashboardStats.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchDashboardStats.fulfilled, (state, action) => {
        state.loading = false;
        state.stats = action.payload;
      })
      .addCase(fetchDashboardStats.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to fetch dashboard stats';
      })
      // Fetch recent activity
      .addCase(fetchRecentActivity.fulfilled, (state, action) => {
        state.activities = action.payload.activities;
      })
      // Fetch sales chart
      .addCase(fetchSalesChart.fulfilled, (state, action) => {
        state.salesChart = action.payload;
      })
      // Fetch inventory chart
      .addCase(fetchInventoryChart.fulfilled, (state, action) => {
        state.inventoryChart = action.payload;
      })
      // Fetch sync chart
      .addCase(fetchSyncChart.fulfilled, (state, action) => {
        state.syncChart = action.payload;
      })
      // Fetch notifications
      .addCase(fetchNotifications.fulfilled, (state, action) => {
        state.notifications = action.payload;
      });
  },
});

export const {
  setDashboardStats,
  setActivities,
  addActivity,
  setDateRange,
  toggleAutoRefresh,
  setRefreshInterval,
  addNotification: addDashboardNotification,
  removeNotification: removeDashboardNotification,
  clearError: clearDashboardError,
} = dashboardSlice.actions;

export default dashboardSlice.reducer;