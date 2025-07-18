import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { SyncSettings } from '@/types';

interface SettingsState {
  syncSettings: SyncSettings | null;
  isAutoSyncEnabled: boolean;
  selectedInterval: number;
  priceMargin: number;
  theme: 'light' | 'dark';
  language: 'ko' | 'en';
}

const initialState: SettingsState = {
  syncSettings: null,
  isAutoSyncEnabled: true,
  selectedInterval: 30,
  priceMargin: 1.15,
  theme: 'light',
  language: 'ko',
};

const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    setSyncSettings: (state, action: PayloadAction<SyncSettings>) => {
      state.syncSettings = action.payload;
      state.isAutoSyncEnabled = action.payload.autoSync;
      state.selectedInterval = parseInt(action.payload.syncInterval);
      state.priceMargin = parseFloat(action.payload.priceMargin);
    },
    toggleAutoSync: (state) => {
      state.isAutoSyncEnabled = !state.isAutoSyncEnabled;
    },
    setSelectedInterval: (state, action: PayloadAction<number>) => {
      state.selectedInterval = action.payload;
    },
    setPriceMargin: (state, action: PayloadAction<number>) => {
      state.priceMargin = action.payload;
    },
    setTheme: (state, action: PayloadAction<'light' | 'dark'>) => {
      state.theme = action.payload;
    },
    setLanguage: (state, action: PayloadAction<'ko' | 'en'>) => {
      state.language = action.payload;
    },
  },
});

export const {
  setSyncSettings,
  toggleAutoSync,
  setSelectedInterval,
  setPriceMargin,
  setTheme,
  setLanguage,
} = settingsSlice.actions;

export default settingsSlice.reducer;

