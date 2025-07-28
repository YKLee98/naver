// packages/frontend/src/store/slices/dashboardSlice.ts
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { dashboardApi } from '@/services/api/dashboard.service';
import { DashboardStats, Activity, Notification } from '@/types/models';

interface DashboardState {
  stats: DashboardStats | null;
  activities: Activity[];
  notifications: Notification[];
  systemHealth: {
    status: 'healthy' | 'degraded' | 'down';
    services: {
      api: boolean;
      database: boolean;
      redis: boolean;
      naver: boolean;
      shopify: boolean;
    };
    lastChecked: string;
  } | null;
  chartData: {
    sales: any;
    inventory: any;
    sync: any;
  };
  loading: boolean;
  error: string | null;
}

const initialState: DashboardState = {
  stats: null,
  activities: [],
  notifications: [],
  systemHealth: null,
  chartData: {
    sales: null,
    inventory: null,
    sync: null,
  },
  loading: false,
  error: null,
};

// Async thunks
export const fetchDashboardStats = createAsyncThunk(
  'dashboard/fetchStats',
  async () => {
    const response = await dashboardApi.getStats();
    return response;
  }
);

export const fetchRecentActivity = createAsyncThunk(
  'dashboard/fetchActivity',
  async (limit?: number) => {
    const response = await dashboardApi.getRecentActivity(limit);
    return response.data;
  }
);

export const fetchSalesChart = createAsyncThunk(
  'dashboard/fetchSalesChart',
  async (params: Parameters<typeof dashboardApi.getSalesChartData>[0]) => {
    const response = await dashboardApi.getSalesChartData(params);
    return response;
  }
);

export const fetchInventoryChart = createAsyncThunk(
  'dashboard/fetchInventoryChart',
  async () => {
    const response = await dashboardApi.getInventoryChartData();
    return response;
  }
);

export const fetchSyncChart = createAsyncThunk(
  'dashboard/fetchSyncChart',
  async (params: Parameters<typeof dashboardApi.getSyncChartData>[0]) => {
    const response = await dashboardApi.getSyncChartData(params);
    return response;
  }
);

export const fetchNotifications = createAsyncThunk(
  'dashboard/fetchNotifications',
  async (params?: Parameters<typeof dashboardApi.getNotifications>[0]) => {
    const response = await dashboardApi.getNotifications(params);
    return response;
  }
);

export const markNotificationRead = createAsyncThunk(
  'dashboard/markNotificationRead',
  async (id: string) => {
    const response = await dashboardApi.markNotificationAsRead(id);
    return { id, response };
  }
);

export const fetchSystemHealth = createAsyncThunk(
  'dashboard/fetchSystemHealth',
  async () => {
    const response = await dashboardApi.getSystemHealth();
    return response;
  }
);

const dashboardSlice = createSlice({
  name: 'dashboard',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    addNotification: (state, action) => {
      state.notifications.unshift(action.payload);
    },
    removeNotification: (state, action) => {
      state.notifications = state.notifications.filter(n => n.id !== action.payload);
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch stats
      .addCase(fetchDashboardStats.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchDashboardStats.fulfilled, (state, action) => {
        state.loading = false;
        state.stats = action.payload;
      })
      .addCase(fetchDashboardStats.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || '대시보드 통계 조회에 실패했습니다.';
      })
      // Fetch activities
      .addCase(fetchRecentActivity.fulfilled, (state, action) => {
        state.activities = action.payload;
      })
      // Fetch charts
      .addCase(fetchSalesChart.fulfilled, (state, action) => {
        state.chartData.sales = action.payload;
      })
      .addCase(fetchInventoryChart.fulfilled, (state, action) => {
        state.chartData.inventory = action.payload;
      })
      .addCase(fetchSyncChart.fulfilled, (state, action) => {
        state.chartData.sync = action.payload;
      })
      // Notifications
      .addCase(fetchNotifications.fulfilled, (state, action) => {
        state.notifications = action.payload;
      })
      .addCase(markNotificationRead.fulfilled, (state, action) => {
        const notification = state.notifications.find(n => n.id === action.payload.id);
        if (notification) {
          notification.read = true;
        }
      })
      // System health
      .addCase(fetchSystemHealth.fulfilled, (state, action) => {
        state.systemHealth = action.payload;
      });
  },
});

export const { clearError, addNotification, removeNotification } = dashboardSlice.actions;
export default dashboardSlice.reducer;