import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { DashboardStats } from '@/types';

interface Activity {
  id: string;
  type: 'inventory' | 'order' | 'price' | 'sync';
  action: string;
  sku?: string;
  details: any;
  timestamp: string;
}

interface DashboardState {
  stats: DashboardStats | null;
  activities: Activity[];
  selectedDateRange: {
    startDate: string;
    endDate: string;
  };
  refreshInterval: number;
  isAutoRefreshEnabled: boolean;
}

const initialState: DashboardState = {
  stats: null,
  activities: [],
  selectedDateRange: {
    startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    endDate: new Date().toISOString(),
  },
  refreshInterval: 30000, // 30초
  isAutoRefreshEnabled: true,
};

const dashboardSlice = createSlice({
  name: 'dashboard',
  initialState,
  reducers: {
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
});

export const {
  setDashboardStats,
  setActivities,
  addActivity,
  setDateRange,
  toggleAutoRefresh,
  setRefreshInterval,
} = dashboardSlice.actions;

export default dashboardSlice.reducer;

