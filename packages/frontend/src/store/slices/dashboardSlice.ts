// packages/frontend/src/store/slices/dashboardSlice.ts
import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import apiService from '@/services/api';
import { DashboardStats, Activity, Notification } from '@/types/models';

interface ChartData {
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
    borderColor?: string;
    backgroundColor?: string;
    fill?: boolean;
  }>;
}

interface SystemHealth {
  status: 'healthy' | 'degraded' | 'down';
  services: {
    api: boolean;
    database: boolean;
    redis: boolean;
    naver: boolean;
    shopify: boolean;
  };
  lastChecked: string;
}

interface DashboardState {
  stats: DashboardStats | null;
  activities: Activity[];
  notifications: Notification[];
  systemHealth: SystemHealth | null;
  chartData: {
    sales: ChartData | null;
    inventory: ChartData | null;
    sync: ChartData | null;
  };
  selectedDateRange: {
    startDate: string;
    endDate: string;
  };
  refreshInterval: number;
  isAutoRefreshEnabled: boolean;
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
  selectedDateRange: {
    startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    endDate: new Date().toISOString(),
  },
  refreshInterval: 30000, // 30초
  isAutoRefreshEnabled: true,
  loading: false,
  error: null,
};

// Async thunks
export const fetchDashboardStats = createAsyncThunk(
  'dashboard/fetchStats',
  async () => {
    try {
      const response = await apiService.getDashboardStats();
      return response;
    } catch (error: any) {
      console.error('Dashboard stats error:', error);
      throw error;
    }
  }
);

export const fetchRecentActivity = createAsyncThunk(
  'dashboard/fetchActivity',
  async (limit: number = 10) => {
    try {
      // API에서 limit 파라미터를 지원한다면
      const response = await apiService.getRecentActivity();
      return response;
    } catch (error: any) {
      console.error('Recent activity error:', error);
      throw error;
    }
  }
);

export const fetchSalesChart = createAsyncThunk(
  'dashboard/fetchSalesChart',
  async (params: { startDate: string; endDate: string; interval?: string }) => {
    try {
      // 실제 API 호출로 변경
      const response = await apiService.getSalesChartData(params);
      
      // API 응답을 ChartData 형식으로 변환
      const chartData: ChartData = {
        labels: response.map((item: any) => item._id || item.date),
        datasets: [
          {
            label: '매출',
            data: response.map((item: any) => item.totalQuantity || 0),
            borderColor: 'rgb(75, 192, 192)',
            backgroundColor: 'rgba(75, 192, 192, 0.2)',
            fill: true,
          }
        ]
      };
      
      return chartData;
    } catch (error: any) {
      console.error('Sales chart error:', error);
      // 에러 시 빈 데이터 반환
      return {
        labels: [],
        datasets: [{
          label: '매출',
          data: [],
          borderColor: 'rgb(75, 192, 192)',
          backgroundColor: 'rgba(75, 192, 192, 0.2)',
          fill: true,
        }]
      };
    }
  }
);

export const fetchInventoryChart = createAsyncThunk(
  'dashboard/fetchInventoryChart',
  async () => {
    try {
      const response = await apiService.getInventoryChartData();
      
      // API 응답을 ChartData 형식으로 변환
      const byStatus = response.byStatus || [];
      const chartData: ChartData = {
        labels: byStatus.map((item: any) => {
          switch(item._id) {
            case 'inStock': return '정상 재고';
            case 'lowStock': return '부족';
            case 'outOfStock': return '품절';
            default: return item._id;
          }
        }),
        datasets: [
          {
            label: '재고 현황',
            data: byStatus.map((item: any) => item.count),
            backgroundColor: [
              'rgba(75, 192, 192, 0.8)',
              'rgba(255, 206, 86, 0.8)',
              'rgba(255, 99, 132, 0.8)',
            ],
          }
        ]
      };
      
      return chartData;
    } catch (error: any) {
      console.error('Inventory chart error:', error);
      // 에러 시 빈 데이터 반환
      return {
        labels: ['정상 재고', '부족', '품절'],
        datasets: [{
          label: '재고 현황',
          data: [0, 0, 0],
          backgroundColor: [
            'rgba(75, 192, 192, 0.8)',
            'rgba(255, 206, 86, 0.8)',
            'rgba(255, 99, 132, 0.8)',
          ],
        }]
      };
    }
  }
);

export const fetchSyncChart = createAsyncThunk(
  'dashboard/fetchSyncChart',
  async (params: { startDate: string; endDate: string }) => {
    try {
      const response = await apiService.getSyncChartData(params);
      
      // API 응답을 ChartData 형식으로 변환
      const chartData: ChartData = {
        labels: response.map((item: any) => item._id),
        datasets: [
          {
            label: '동기화 건수',
            data: response.map((item: any) => item.totalCount),
            backgroundColor: 'rgba(75, 192, 192, 0.8)',
          }
        ]
      };
      
      return chartData;
    } catch (error: any) {
      console.error('Sync chart error:', error);
      // 에러 시 빈 데이터 반환
      return {
        labels: [],
        datasets: [{
          label: '동기화 건수',
          data: [],
          backgroundColor: 'rgba(75, 192, 192, 0.8)',
        }]
      };
    }
  }
);

export const fetchNotifications = createAsyncThunk(
  'dashboard/fetchNotifications',
  async (params?: { unreadOnly?: boolean; limit?: number }) => {
    try {
      const response = await apiService.getNotifications(params);
      return response;
    } catch (error: any) {
      console.error('Notifications error:', error);
      return [];
    }
  }
);

export const markNotificationRead = createAsyncThunk(
  'dashboard/markNotificationRead',
  async (id: string) => {
    try {
      await apiService.markNotificationAsRead(id);
      return { id };
    } catch (error: any) {
      console.error('Mark notification error:', error);
      throw error;
    }
  }
);

export const fetchSystemHealth = createAsyncThunk(
  'dashboard/fetchSystemHealth',
  async () => {
    try {
      const response = await apiService.getSystemHealth();
      return response;
    } catch (error: any) {
      console.error('System health error:', error);
      // 에러 발생 시 기본값 반환
      return {
        status: 'degraded' as const,
        services: {
          api: true,
          database: true,
          redis: true,
          naver: false,
          shopify: false,
        },
        lastChecked: new Date().toISOString(),
      };
    }
  }
);

const dashboardSlice = createSlice({
  name: 'dashboard',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    setDashboardStats: (state, action: PayloadAction<DashboardStats>) => {
      state.stats = action.payload;
    },
    setActivities: (state, action: PayloadAction<Activity[]>) => {
      state.activities = action.payload;
    },
    addActivity: (state, action: PayloadAction<Activity>) => {
      state.activities.unshift(action.payload);
      if (state.activities.length > 100) {
        state.activities.pop();
      }
    },
    addNotification: (state, action: PayloadAction<Notification>) => {
      state.notifications.unshift(action.payload);
    },
    removeNotification: (state, action: PayloadAction<string>) => {
      state.notifications = state.notifications.filter(n => n.id !== action.payload);
    },
    setDateRange: (state, action: PayloadAction<typeof initialState.selectedDateRange>) => {
      state.selectedDateRange = action.payload;
    },
    toggleAutoRefresh: (state) => {
      state.isAutoRefreshEnabled = !state.isAutoRefreshEnabled;
    },
    setRefreshInterval: (state, action: PayloadAction<number>) => {
      state.refreshInterval = action.payload;
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
        state.error = null;
      })
      .addCase(fetchDashboardStats.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || '대시보드 통계 조회에 실패했습니다.';
      })
      // Fetch activities
      .addCase(fetchRecentActivity.pending, (state) => {
        // 활동 로딩은 별도 표시 없음
      })
      .addCase(fetchRecentActivity.fulfilled, (state, action) => {
        state.activities = action.payload || [];
      })
      .addCase(fetchRecentActivity.rejected, (state, action) => {
        console.error('Failed to fetch activities:', action.error);
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
        state.notifications = action.payload || [];
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
      })
      .addCase(fetchSystemHealth.rejected, (state) => {
        state.systemHealth = {
          status: 'down',
          services: {
            api: false,
            database: false,
            redis: false,
            naver: false,
            shopify: false,
          },
          lastChecked: new Date().toISOString(),
        };
      });
  },
});

export const { 
  clearError, 
  setDashboardStats,
  setActivities,
  addActivity,
  addNotification, 
  removeNotification,
  setDateRange,
  toggleAutoRefresh,
  setRefreshInterval,
} = dashboardSlice.actions;

export default dashboardSlice.reducer;