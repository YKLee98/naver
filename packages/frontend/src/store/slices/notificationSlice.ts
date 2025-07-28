// packages/frontend/src/store/slices/notificationSlice.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Notification } from '@/types/models';

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  isDrawerOpen: boolean;
}

const initialState: NotificationState = {
  notifications: [],
  unreadCount: 0,
  isDrawerOpen: false,
};

const notificationSlice = createSlice({
  name: 'notification',
  initialState,
  reducers: {
    toggleDrawer: (state) => {
      state.isDrawerOpen = !state.isDrawerOpen;
    },
    openDrawer: (state) => {
      state.isDrawerOpen = true;
    },
    closeDrawer: (state) => {
      state.isDrawerOpen = false;
    },
    addNotification: (state, action: PayloadAction<Notification>) => {
      state.notifications.unshift(action.payload);
      if (!action.payload.read) {
        state.unreadCount++;
      }
    },
    removeNotification: (state, action: PayloadAction<string>) => {
      const index = state.notifications.findIndex(n => n.id === action.payload);
      if (index !== -1) {
        if (!state.notifications[index].read) {
          state.unreadCount--;
        }
        state.notifications.splice(index, 1);
      }
    },
    markAsRead: (state, action: PayloadAction<string>) => {
      const notification = state.notifications.find(n => n.id === action.payload);
      if (notification && !notification.read) {
        notification.read = true;
        state.unreadCount--;
      }
    },
    markAllAsRead: (state) => {
      state.notifications.forEach(n => {
        n.read = true;
      });
      state.unreadCount = 0;
    },
    clearNotifications: (state) => {
      state.notifications = [];
      state.unreadCount = 0;
    },
    setNotifications: (state, action: PayloadAction<Notification[]>) => {
      state.notifications = action.payload;
      state.unreadCount = action.payload.filter(n => !n.read).length;
    },
  },
});

export const {
  toggleDrawer,
  openDrawer,
  closeDrawer,
  addNotification,
  removeNotification,
  markAsRead,
  markAllAsRead,
  clearNotifications,
  setNotifications,
} = notificationSlice.actions;

export default notificationSlice.reducer;