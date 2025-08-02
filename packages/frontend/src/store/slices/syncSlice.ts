// packages/frontend/src/store/slices/syncSlice.ts
import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { syncApi } from '@/services/api/sync.service';
import { SyncJob } from '@/types/models';

interface SyncState {
  jobs: SyncJob[];
  currentJob: SyncJob | null;
  status: {
    isRunning: boolean;
    lastSync?: {
      type: string;
      completedAt: string;
      status: string;
      stats: {
        processed: number;
        success: number;
        failed: number;
      };
    };
    nextScheduledSync?: {
      type: string;
      scheduledAt: string;
    };
  };
  schedules: any[];
  syncProgress: {
    current: number;
    total: number;
    percentage: number;
    message?: string;
  };
  loading: boolean;
  error: string | null;
}

const initialState: SyncState = {
  jobs: [],
  currentJob: null,
  status: {
    isRunning: false,
  },
  schedules: [],
  syncProgress: {
    current: 0,
    total: 0,
    percentage: 0,
  },
  loading: false,
  error: null,
};

// Async thunks - 기존 이름 유지하면서 alias 추가
export const fetchSyncJobs = createAsyncThunk(
  'sync/fetchJobs',
  async (params?: Parameters<typeof syncApi.getSyncJobs>[0]) => {
    const response = await syncApi.getSyncJobs(params);
    return response;
  }
);

export const fetchSyncStatus = createAsyncThunk(
  'sync/fetchStatus',
  async () => {
    const response = await syncApi.getSyncStatus();
    return response;
  }
);

// Renamed async thunks to match index.ts expectations
export const performFullSync = createAsyncThunk(
  'sync/performFull',
  async () => {
    const response = await syncApi.startFullSync();
    return response;
  }
);

export const performInventorySync = createAsyncThunk(
  'sync/performInventory',
  async (skus?: string[]) => {
    const response = await syncApi.startInventorySync(skus);
    return response;
  }
);

export const performPriceSync = createAsyncThunk(
  'sync/performPrice',
  async (skus?: string[]) => {
    const response = await syncApi.startPriceSync(skus);
    return response;
  }
);

export const syncSingleProduct = createAsyncThunk(
  'sync/singleProduct',
  async (sku: string) => {
    const response = await syncApi.startInventorySync([sku]);
    return response;
  }
);

export const cancelSyncJob = createAsyncThunk(
  'sync/cancelJob',
  async (id: string) => {
    const response = await syncApi.cancelSyncJob(id);
    return { id, response };
  }
);

export const retrySyncJob = createAsyncThunk(
  'sync/retryJob',
  async (id: string) => {
    const response = await syncApi.retrySyncJob(id);
    return response;
  }
);

export const fetchSyncSchedules = createAsyncThunk(
  'sync/fetchSchedules',
  async () => {
    const response = await syncApi.getSyncSchedules();
    return response;
  }
);

export const updateSyncSchedule = createAsyncThunk(
  'sync/updateSchedule',
  async (data: Parameters<typeof syncApi.setSyncSchedule>[0]) => {
    const response = await syncApi.setSyncSchedule(data);
    return response;
  }
);

const syncSlice = createSlice({
  name: 'sync',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    // 필요한 동기 액션들 추가
    startSync: (state) => {
      state.status.isRunning = true;
      state.error = null;
      state.syncProgress = {
        current: 0,
        total: 0,
        percentage: 0,
      };
    },
    syncSuccess: (state, action: PayloadAction<{
      type: string;
      stats: { processed: number; success: number; failed: number };
    }>) => {
      state.status.isRunning = false;
      state.status.lastSync = {
        type: action.payload.type,
        completedAt: new Date().toISOString(),
        status: 'success',
        stats: action.payload.stats,
      };
      state.syncProgress.percentage = 100;
    },
    syncFailure: (state, action: PayloadAction<string>) => {
      state.status.isRunning = false;
      state.error = action.payload;
      state.status.lastSync = {
        type: 'unknown',
        completedAt: new Date().toISOString(),
        status: 'failed',
        stats: {
          processed: 0,
          success: 0,
          failed: 0,
        },
      };
    },
    updateSyncProgress: (state, action: PayloadAction<{
      current: number;
      total: number;
      message?: string;
    }>) => {
      state.syncProgress = {
        current: action.payload.current,
        total: action.payload.total,
        percentage: action.payload.total > 0 
          ? Math.round((action.payload.current / action.payload.total) * 100)
          : 0,
        message: action.payload.message,
      };
    },
    cancelSync: (state) => {
      state.status.isRunning = false;
      state.currentJob = null;
      state.syncProgress = {
        current: 0,
        total: 0,
        percentage: 0,
      };
    },
    setCurrentJob: (state, action: PayloadAction<SyncJob | null>) => {
      state.currentJob = action.payload;
    },
    updateJobProgress: (state, action: PayloadAction<{ id: string; progress: number }>) => {
      const job = state.jobs.find(j => j._id === action.payload.id);
      if (job) {
        job.progress = action.payload.progress;
      }
      if (state.currentJob?._id === action.payload.id) {
        state.currentJob.progress = action.payload.progress;
      }
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch sync jobs
      .addCase(fetchSyncJobs.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchSyncJobs.fulfilled, (state, action) => {
        state.loading = false;
        state.jobs = action.payload.data;
      })
      .addCase(fetchSyncJobs.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || '동기화 작업 조회에 실패했습니다.';
      })
      // Fetch sync status
      .addCase(fetchSyncStatus.fulfilled, (state, action) => {
        state.status = action.payload;
        state.currentJob = action.payload.currentJob || null;
      })
      // Start sync jobs
      .addCase(performFullSync.pending, (state) => {
        state.status.isRunning = true;
      })
      .addCase(performFullSync.fulfilled, (state, action) => {
        state.currentJob = action.payload;
        state.jobs.unshift(action.payload);
      })
      .addCase(performInventorySync.pending, (state) => {
        state.status.isRunning = true;
      })
      .addCase(performInventorySync.fulfilled, (state, action) => {
        state.currentJob = action.payload;
        state.jobs.unshift(action.payload);
      })
      .addCase(performPriceSync.pending, (state) => {
        state.status.isRunning = true;
      })
      .addCase(performPriceSync.fulfilled, (state, action) => {
        state.currentJob = action.payload;
        state.jobs.unshift(action.payload);
      })
      // Cancel job
      .addCase(cancelSyncJob.fulfilled, (state, action) => {
        const job = state.jobs.find(j => j._id === action.payload.id);
        if (job) {
          job.status = 'cancelled';
        }
        if (state.currentJob?._id === action.payload.id) {
          state.currentJob = null;
          state.status.isRunning = false;
        }
      })
      // Fetch schedules
      .addCase(fetchSyncSchedules.fulfilled, (state, action) => {
        state.schedules = action.payload;
      });
  },
});

export const { 
  clearError, 
  startSync,
  syncSuccess,
  syncFailure,
  updateSyncProgress,
  cancelSync,
  setCurrentJob, 
  updateJobProgress 
} = syncSlice.actions;

export default syncSlice.reducer;