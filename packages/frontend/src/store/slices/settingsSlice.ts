// packages/frontend/src/store/slices/settingsSlice.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface SettingsState {
  api: {
    naver: {
      clientId: string;
      clientSecret: string;
      storeId: string;
    };
    shopify: {
      shopDomain: string;
      accessToken: string;
    };
  };
  sync: {
    autoSync: boolean;
    syncInterval: number; // minutes
    inventorySync: boolean;
    priceSync: boolean;
    lowStockThreshold: number;
    criticalStockThreshold: number;
  };
  notification: {
    email: boolean;
    browser: boolean;
    sound: boolean;
    lowStockAlert: boolean;
    syncErrorAlert: boolean;
    priceChangeAlert: boolean;
  };
  general: {
    language: 'ko' | 'en';
    timezone: string;
    dateFormat: string;
    currency: string;
  };
  loading: boolean;
  error: string | null;
}

const initialState: SettingsState = {
  api: {
    naver: {
      clientId: '',
      clientSecret: '',
      storeId: '',
    },
    shopify: {
      shopDomain: '',
      accessToken: '',
    },
  },
  sync: {
    autoSync: true,
    syncInterval: 30,
    inventorySync: true,
    priceSync: true,
    lowStockThreshold: 10,
    criticalStockThreshold: 5,
  },
  notification: {
    email: true,
    browser: true,
    sound: true,
    lowStockAlert: true,
    syncErrorAlert: true,
    priceChangeAlert: true,
  },
  general: {
    language: 'ko',
    timezone: 'Asia/Seoul',
    dateFormat: 'YYYY-MM-DD',
    currency: 'KRW',
  },
  loading: false,
  error: null,
};

const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    setSettings: (state, action: PayloadAction<Partial<SettingsState>>) => {
      return { ...state, ...action.payload };
    },
    
    updateApiSettings: (state, action: PayloadAction<Partial<SettingsState['api']>>) => {
      state.api = { ...state.api, ...action.payload };
    },
    
    updateSyncSettings: (state, action: PayloadAction<Partial<SettingsState['sync']>>) => {
      state.sync = { ...state.sync, ...action.payload };
    },
    
    updateNotificationSettings: (state, action: PayloadAction<Partial<SettingsState['notification']>>) => {
      state.notification = { ...state.notification, ...action.payload };
    },
    
    updateGeneralSettings: (state, action: PayloadAction<Partial<SettingsState['general']>>) => {
      state.general = { ...state.general, ...action.payload };
    },
    
    updateSettings: (state, action: PayloadAction<{ category: string; settings: any }>) => {
      const { category, settings } = action.payload;
      if (category in state) {
        (state as any)[category] = { ...(state as any)[category], ...settings };
      }
    },
    
    resetSettings: (state) => {
      return initialState;
    },
    
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
    
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
  },
});

export const {
  setSettings,
  updateApiSettings,
  updateSyncSettings,
  updateNotificationSettings,
  updateGeneralSettings,
  updateSettings,
  resetSettings,
  setLoading,
  setError,
} = settingsSlice.actions;

export default settingsSlice.reducer;