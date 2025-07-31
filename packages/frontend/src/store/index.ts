// packages/frontend/src/store/index.ts
import { configureStore } from '@reduxjs/toolkit';
import { apiSlice } from './api/apiSlice';
import authReducer from './slices/authSlice';
import productReducer from './slices/productSlice';
import inventoryReducer from './slices/inventorySlice';
import priceReducer from './slices/pricingSlice';
import syncReducer from './slices/syncSlice';
import dashboardReducer from './slices/dashboardSlice';
import settingsReducer from './slices/settingsSlice';
import notificationReducer from './slices/notificationSlice';

export const store = configureStore({
  reducer: {
    // RTK Query API reducer 추가
    [apiSlice.reducerPath]: apiSlice.reducer,
    auth: authReducer,
    product: productReducer,
    inventory: inventoryReducer,
    price: priceReducer,
    sync: syncReducer,
    dashboard: dashboardReducer,
    settings: settingsReducer,
    notification: notificationReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // Ignore these action types
        ignoredActions: [
          'notification/addNotification',
          // RTK Query actions 추가
          'api/executeMutation/rejected',
          'api/executeMutation/fulfilled',
          'api/executeMutation/pending',
        ],
        // Ignore these field paths in all actions
        ignoredActionPaths: ['meta.arg', 'payload.timestamp', 'meta.baseQueryMeta'],
        // Ignore these paths in the state
        ignoredPaths: ['items.dates', 'api.queries', 'api.mutations'],
      },
    }).concat(apiSlice.middleware), // RTK Query 미들웨어 추가
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;