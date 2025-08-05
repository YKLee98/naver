// packages/frontend/src/hooks/useNotification.ts
import { useSnackbar, VariantType } from 'notistack';

export const useNotification = () => {
  const { enqueueSnackbar, closeSnackbar } = useSnackbar();

  const showNotification = (
    message: string,
    variant: VariantType = 'default',
    options?: {
      persist?: boolean;
      preventDuplicate?: boolean;
    }
  ) => {
    return enqueueSnackbar(message, {
      variant,
      autoHideDuration: options?.persist ? null : 3000,
      preventDuplicate: options?.preventDuplicate ?? true,
      anchorOrigin: {
        vertical: 'bottom',
        horizontal: 'right',
      },
    });
  };

  const hideNotification = (key?: string | number) => {
    if (key) {
      closeSnackbar(key);
    } else {
      closeSnackbar();
    }
  };

  return {
    showNotification,
    hideNotification,
    showSuccess: (message: string, options?: any) => 
      showNotification(message, 'success', options),
    showError: (message: string, options?: any) => 
      showNotification(message, 'error', options),
    showWarning: (message: string, options?: any) => 
      showNotification(message, 'warning', options),
    showInfo: (message: string, options?: any) => 
      showNotification(message, 'info', options),
  };
};
