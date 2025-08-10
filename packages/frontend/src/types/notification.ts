// packages/frontend/src/types/notification.ts
export interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

export interface NotificationPayload {
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
}

export interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  drawerOpen: boolean;
  soundEnabled: boolean;
}