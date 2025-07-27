// packages/frontend/src/store/slices/syncSlice.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface SyncState {
  syncStatus: {
    isRunning: boolean;
    lastSync: string | null;
    progress: number;
  };
  error: string | null;
}

const initialState: SyncState = {
  syncStatus: {
    isRunning: false,
    lastSync: null,
    progress: 0,
  },
  error: null,
};

const syncSlice = createSlice({
  name: 'sync',
  initialState,
  reducers: {
    setSyncRunning: (state, action: PayloadAction<boolean>) => {
      state.syncStatus.isRunning = action.payload;
      if (!action.payload) {
        state.syncStatus.progress = 0;
      }
    },
    setSyncProgress: (state, action: PayloadAction<number>) => {
      state.syncStatus.progress = action.payload;
    },
    setSyncComplete: (state) => {
      state.syncStatus.isRunning = false;
      state.syncStatus.lastSync = new Date().toISOString();
      state.syncStatus.progress = 100;
      state.error = null;
    },
    setSyncError: (state, action: PayloadAction<string>) => {
      state.error = action.payload;
      state.syncStatus.isRunning = false;
      state.syncStatus.progress = 0;
    },
  },
});

export const { setSyncRunning, setSyncProgress, setSyncComplete, setSyncError } = syncSlice.actions;
export default syncSlice.reducer;