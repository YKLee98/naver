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
  loading: false,
  error: null,
};

// Async thunks
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

export const startFullSync = createAsyncThunk(
  'sync/startFull',
  async () => {
    const response = await syncApi.startFullSync();
    return response;
  }
);

export const startInventorySync = createAsyncThunk(
  'sync/startInventory',
  async (skus?: string[]) => {
    const response = await syncApi.startInventorySync(skus);
    return response;
  }
);

export const startPriceSync = createAsyncThunk(
  'sync/startPrice',
  async (skus?: string[]) => {
    const response = await syncApi.startPriceSync(skus);
    return response;
  }
);

export const startMappingSync = createAsyncThunk(
  'sync/startMapping',
  async () => {
    const response = await syncApi.startMappingSync();
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
      .addCase(startFullSync.pending, (state) => {
        state.status.isRunning = true;
      })
      .addCase(startFullSync.fulfilled, (state, action) => {
        state.currentJob = action.payload;
        state.jobs.unshift(action.payload);
      })
      .addCase(startInventorySync.pending, (state) => {
        state.status.isRunning = true;
      })
      .addCase(startInventorySync.fulfilled, (state, action) => {
        state.currentJob = action.payload;
        state.jobs.unshift(action.payload);
      })
      .addCase(startPriceSync.pending, (state) => {
        state.status.isRunning = true;
      })
      .addCase(startPriceSync.fulfilled, (state, action) => {
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

export const { clearError, setCurrentJob, updateJobProgress } = syncSlice.actions;
export default syncSlice.reducer;