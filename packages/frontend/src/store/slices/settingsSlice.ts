// packages/frontend/src/store/slices/settingsSlice.ts
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { settingsApi } from '@/services/api/settings.service';
import { Settings } from '@/types/models';

interface SettingsState {
  settings: Settings[];
  apiSettings: any;
  syncSettings: any;
  notificationSettings: any;
  loading: boolean;
  error: string | null;
  connectionStatus: {
    naver: boolean;
    shopify: boolean;
  };
}

const initialState: SettingsState = {
  settings: [],
  apiSettings: null,
  syncSettings: null,
  notificationSettings: null,
  loading: false,
  error: null,
  connectionStatus: {
    naver: false,
    shopify: false,
  },
};

// Async thunks
export const fetchSettings = createAsyncThunk(
  'settings/fetchAll',
  async (category?: string) => {
    const response = await settingsApi.getSettings(category);
    return response;
  }
);

export const fetchApiSettings = createAsyncThunk(
  'settings/fetchApi',
  async () => {
    const response = await settingsApi.getApiSettings();
    return response;
  }
);

export const updateApiSettings = createAsyncThunk(
  'settings/updateApi',
  async (data: Parameters<typeof settingsApi.updateApiSettings>[0]) => {
    const response = await settingsApi.updateApiSettings(data);
    return response;
  }
);

export const fetchSyncSettings = createAsyncThunk(
  'settings/fetchSync',
  async () => {
    const response = await settingsApi.getSyncSettings();
    return response;
  }
);

export const updateSyncSettings = createAsyncThunk(
  'settings/updateSync',
  async (data: Parameters<typeof settingsApi.updateSyncSettings>[0]) => {
    const response = await settingsApi.updateSyncSettings(data);
    return response;
  }
);

export const fetchNotificationSettings = createAsyncThunk(
  'settings/fetchNotifications',
  async () => {
    const response = await settingsApi.getNotificationSettings();
    return response;
  }
);

export const updateNotificationSettings = createAsyncThunk(
  'settings/updateNotifications',
  async (data: Parameters<typeof settingsApi.updateNotificationSettings>[0]) => {
    const response = await settingsApi.updateNotificationSettings(data);
    return response;
  }
);

export const testApiConnection = createAsyncThunk(
  'settings/testConnection',
  async (platform: 'naver' | 'shopify') => {
    const response = await settingsApi.testApiConnection(platform);
    return { platform, success: response.success };
  }
);

export const exportSettings = createAsyncThunk(
  'settings/export',
  async () => {
    const response = await settingsApi.exportSettings();
    return response;
  }
);

export const importSettings = createAsyncThunk(
  'settings/import',
  async (file: File) => {
    const response = await settingsApi.importSettings(file);
    return response;
  }
);

export const resetSettings = createAsyncThunk(
  'settings/reset',
  async (category?: string) => {
    const response = await settingsApi.resetSettings(category);
    return response;
  }
);

const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    setConnectionStatus: (state, action) => {
      state.connectionStatus = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch settings
      .addCase(fetchSettings.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchSettings.fulfilled, (state, action) => {
        state.loading = false;
        state.settings = action.payload;
      })
      .addCase(fetchSettings.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || '설정 조회에 실패했습니다.';
      })
      // API settings
      .addCase(fetchApiSettings.fulfilled, (state, action) => {
        state.apiSettings = action.payload;
      })
      .addCase(updateApiSettings.fulfilled, (state, action) => {
        state.apiSettings = action.payload;
      })
      // Sync settings
      .addCase(fetchSyncSettings.fulfilled, (state, action) => {
        state.syncSettings = action.payload;
      })
      .addCase(updateSyncSettings.fulfilled, (state, action) => {
        state.syncSettings = action.payload;
      })
      // Notification settings
      .addCase(fetchNotificationSettings.fulfilled, (state, action) => {
        state.notificationSettings = action.payload;
      })
      .addCase(updateNotificationSettings.fulfilled, (state, action) => {
        state.notificationSettings = action.payload;
      })
      // Test connection
      .addCase(testApiConnection.fulfilled, (state, action) => {
        state.connectionStatus[action.payload.platform] = action.payload.success;
      });
  },
});

export const { clearError, setConnectionStatus } = settingsSlice.actions;
export default settingsSlice.reducer;