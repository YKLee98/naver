// ===== 3. packages/frontend/src/hooks/useNotification.tsx =====
import { useSnackbar, VariantType, OptionsObject } from 'notistack';
import { useCallback } from 'react';

interface NotificationOptions extends Omit<OptionsObject, 'variant'> {
  persist?: boolean;
}

/**
 * 알림 메시지 훅
 */
export const useNotification = () => {
  const { enqueueSnackbar, closeSnackbar } = useSnackbar();

  /**
   * 알림 표시
   */
  const showNotification = useCallback(
    (
      message: string,
      variant: VariantType = 'info',
      options?: NotificationOptions
    ) => {
      const { persist, ...otherOptions } = options || {};
      
      return enqueueSnackbar(message, {
        variant,
        autoHideDuration: persist ? null : 5000,
        preventDuplicate: true,
        anchorOrigin: {
          vertical: 'bottom',
          horizontal: 'right',
        },
        ...otherOptions,
      });
    },
    [enqueueSnackbar]
  );

  /**
   * 성공 알림
   */
  const showSuccess = useCallback(
    (message: string, options?: NotificationOptions) => {
      return showNotification(message, 'success', options);
    },
    [showNotification]
  );

  /**
   * 오류 알림
   */
  const showError = useCallback(
    (message: string, options?: NotificationOptions) => {
      return showNotification(message, 'error', options);
    },
    [showNotification]
  );

  /**
   * 경고 알림
   */
  const showWarning = useCallback(
    (message: string, options?: NotificationOptions) => {
      return showNotification(message, 'warning', options);
    },
    [showNotification]
  );

  /**
   * 정보 알림
   */
  const showInfo = useCallback(
    (message: string, options?: NotificationOptions) => {
      return showNotification(message, 'info', options);
    },
    [showNotification]
  );

  /**
   * 알림 닫기
   */
  const hideNotification = useCallback(
    (key?: string | number) => {
      closeSnackbar(key);
    },
    [closeSnackbar]
  );

  return {
    showNotification,
    showSuccess,
    showError,
    showWarning,
    showInfo,
    hideNotification,
  };
};

