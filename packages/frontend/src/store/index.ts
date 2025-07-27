// packages/frontend/src/store/index.ts
import { configureStore } from '@reduxjs/toolkit';
import { apiSlice } from './api/apiSlice';
import inventoryReducer from './slices/inventorySlice';
import pricingReducer from './slices/pricingSlice';
import mappingReducer from './slices/mappingSlice';
import settingsReducer from './slices/settingsSlice';
import dashboardReducer from './slices/dashboardSlice';
import notificationReducer from './slices/notificationSlice';
import websocketReducer from './slices/websocketSlice';
import syncReducer from './slices/syncSlice';
import authReducer from './slices/authSlice';
import uiReducer from './slices/uiSlice';

export const store = configureStore({
  reducer: {
    [apiSlice.reducerPath]: apiSlice.reducer,
    inventory: inventoryReducer,
    pricing: pricingReducer,
    mapping: mappingReducer,
    settings: settingsReducer,
    dashboard: dashboardReducer,
    notification: notificationReducer,
    notifications: notificationReducer, // alias
    websocket: websocketReducer,
    sync: syncReducer,
    auth: authReducer,
    ui: uiReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ['notification/addNotification'],
        ignoredPaths: ['notification.notifications'],
      },
    }).concat(apiSlice.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;