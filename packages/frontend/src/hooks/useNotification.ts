// packages/frontend/src/hooks/useNotification.ts
import { useDispatch } from 'react-redux';
import { AppDispatch } from '@store';
import { addNotification } from '@store/slices/notificationSlice';

export function useNotification() {
  const dispatch = useDispatch<AppDispatch>();

  const notify = {
    success: (title: string, message: string) => {
      dispatch(addNotification({ type: 'success', title, message }));
    },
    error: (title: string, message: string) => {
      dispatch(addNotification({ type: 'error', title, message }));
    },
    warning: (title: string, message: string) => {
      dispatch(addNotification({ type: 'warning', title, message }));
    },
    info: (title: string, message: string) => {
      dispatch(addNotification({ type: 'info', title, message }));
    },
  };

  return notify;
}
