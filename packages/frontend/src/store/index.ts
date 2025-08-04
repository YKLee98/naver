// packages/frontend/src/store/index.ts
import { configureStore } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice';
import dashboardReducer from './slices/dashboardSlice';
import inventoryReducer from './slices/inventorySlice';
import productReducer from './slices/productSlice';
import notificationReducer from './slices/notificationSlice';
import settingsReducer from './slices/settingsSlice';
import syncReducer from './slices/syncSlice';
import pricingReducer from './slices/pricingSlice';
import websocketReducer from './slices/websocketSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    dashboard: dashboardReducer,
    inventory: inventoryReducer,
    products: productReducer,
    notification: notificationReducer,  // 'notifications'에서 'notification'으로 변경
    settings: settingsReducer,
    sync: syncReducer,
    pricing: pricingReducer,
    websocket: websocketReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ['websocket/connect', 'websocket/disconnect'],
        ignoredPaths: ['websocket.socket'],
      },
    }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;