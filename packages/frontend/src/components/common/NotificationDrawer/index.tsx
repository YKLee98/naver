import React from 'react';
import {
  Drawer,
  Box,
  Typography,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Divider,
  Button,
  Chip,
  Stack,
} from '@mui/material';
import {
  Close as CloseIcon,
  Info as InfoIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  CheckCircle as SuccessIcon,
  Delete as DeleteIcon,
  DoneAll as DoneAllIcon,
} from '@mui/icons-material';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '@/store';
import {
  toggleDrawer,
  markAsRead,
  markAllAsRead,
  removeNotification,
  clearNotifications,
} from '@/store/slices/notificationSlice';
import { formatRelativeTime } from '@/utils/formatters';

const NotificationDrawer: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { notifications, isDrawerOpen, unreadCount } = useSelector(
    (state: RootState) => state.notification
  );

  const handleClose = () => {
    dispatch(toggleDrawer());
  };

  const handleMarkAsRead = (id: string) => {
    dispatch(markAsRead(id));
  };

  const handleMarkAllAsRead = () => {
    dispatch(markAllAsRead());
  };

  const handleRemove = (id: string) => {
    dispatch(removeNotification(id));
  };

  const handleClearAll = () => {
    if (window.confirm('모든 알림을 삭제하시겠습니까?')) {
      dispatch(clearNotifications());
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'info':
        return <InfoIcon color="info" />;
      case 'success':
        return <SuccessIcon color="success" />;
      case 'warning':
        return <WarningIcon color="warning" />;
      case 'error':
        return <ErrorIcon color="error" />;
      default:
        return <InfoIcon />;
    }
  };

  return (
    <Drawer
      anchor="right"
      open={isDrawerOpen}
      onClose={handleClose}
      sx={{
        '& .MuiDrawer-paper': {
          width: 400,
          maxWidth: '100%',
        },
      }}
    >
      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Stack direction="row" alignItems="center" spacing={2}>
              <Typography variant="h6">알림</Typography>
              {unreadCount > 0 && (
                <Chip
                  label={`${unreadCount}개 읽지 않음`}
                  color="primary"
                  size="small"
                />
              )}
            </Stack>
            <IconButton onClick={handleClose} size="small">
              <CloseIcon />
            </IconButton>
          </Stack>
          
          {notifications.length > 0 && (
            <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
              <Button
                size="small"
                startIcon={<DoneAllIcon />}
                onClick={handleMarkAllAsRead}
                disabled={unreadCount === 0}
              >
                모두 읽음
              </Button>
              <Button
                size="small"
                color="error"
                startIcon={<DeleteIcon />}
                onClick={handleClearAll}
              >
                모두 삭제
              </Button>
            </Stack>
          )}
        </Box>

        {/* Notification List */}
        <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
          {notifications.length === 0 ? (
            <Box sx={{ p: 4, textAlign: 'center' }}>
              <Typography color="text.secondary">
                알림이 없습니다.
              </Typography>
            </Box>
          ) : (
            <List sx={{ p: 0 }}>
              {notifications.map((notification, index) => (
                <React.Fragment key={notification.id}>
                  <ListItem
                    sx={{
                      bgcolor: notification.read ? 'transparent' : 'action.hover',
                      '&:hover': {
                        bgcolor: 'action.selected',
                      },
                    }}
                    secondaryAction={
                      <IconButton
                        edge="end"
                        size="small"
                        onClick={() => handleRemove(notification.id)}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    }
                    onClick={() => !notification.read && handleMarkAsRead(notification.id)}
                  >
                    <ListItemIcon>{getIcon(notification.type)}</ListItemIcon>
                    <ListItemText
                      primary={notification.title}
                      secondary={
                        <>
                          <Typography
                            component="span"
                            variant="body2"
                            color="text.primary"
                          >
                            {notification.message}
                          </Typography>
                          <br />
                          <Typography
                            component="span"
                            variant="caption"
                            color="text.secondary"
                          >
                            {formatRelativeTime(notification.timestamp)}
                          </Typography>
                        </>
                      }
                    />
                  </ListItem>
                  {index < notifications.length - 1 && <Divider />}
                </React.Fragment>
              ))}
            </List>
          )}
        </Box>
      </Box>
    </Drawer>
  );
};

export default NotificationDrawer;

