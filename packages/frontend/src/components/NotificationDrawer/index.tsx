// packages/frontend/src/components/NotificationDrawer/index.tsx
import React from 'react';
import {
  Drawer,
  Box,
  Typography,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Avatar,
  Divider,
  Button,
  Badge,
} from '@mui/material';
import {
  Close,
  CheckCircle,
  Error,
  Warning,
  Info,
  Delete,
  DoneAll,
} from '@mui/icons-material';
import { useAppSelector, useAppDispatch } from '@/hooks';
import {
  toggleNotificationDrawer,
  markAsRead,
  markAllAsRead,
  removeNotification,
  clearNotifications,
} from '@/store/slices/notificationSlice';
import { formatDateTime } from '@/utils/formatters';

const NotificationDrawer: React.FC = () => {
  const dispatch = useAppDispatch();
  const { isDrawerOpen, notifications } = useAppSelector((state) => state.notifications);

  const handleClose = () => {
    dispatch(toggleNotificationDrawer());
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'success':
        return <CheckCircle color="success" />;
      case 'error':
        return <Error color="error" />;
      case 'warning':
        return <Warning color="warning" />;
      default:
        return <Info color="info" />;
    }
  };

  return (
    <Drawer
      anchor="right"
      open={isDrawerOpen}
      onClose={handleClose}
      sx={{
        '& .MuiDrawer-paper': {
          width: 360,
        },
      }}
    >
      <Box sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">알림</Typography>
          <Box>
            <IconButton
              size="small"
              onClick={() => dispatch(markAllAsRead())}
              disabled={notifications.every(n => n.read)}
            >
              <DoneAll />
            </IconButton>
            <IconButton
              size="small"
              onClick={() => dispatch(clearNotifications())}
              disabled={notifications.length === 0}
            >
              <Delete />
            </IconButton>
            <IconButton size="small" onClick={handleClose}>
              <Close />
            </IconButton>
          </Box>
        </Box>

        {notifications.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <Typography color="textSecondary">
              새로운 알림이 없습니다
            </Typography>
          </Box>
        ) : (
          <List>
            {notifications.map((notification, index) => (
              <React.Fragment key={notification.id}>
                <ListItem
                  alignItems="flex-start"
                  sx={{
                    bgcolor: notification.read ? 'transparent' : 'action.hover',
                    cursor: 'pointer',
                  }}
                  onClick={() => !notification.read && dispatch(markAsRead(notification.id))}
                >
                  <ListItemAvatar>
                    <Avatar sx={{ bgcolor: 'transparent' }}>
                      {getIcon(notification.type)}
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={notification.title}
                    secondary={
                      <>
                        <Typography variant="body2" color="text.primary">
                          {notification.message}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {formatDateTime(notification.timestamp)}
                        </Typography>
                      </>
                    }
                  />
                  <IconButton
                    edge="end"
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      dispatch(removeNotification(notification.id));
                    }}
                  >
                    <Close fontSize="small" />
                  </IconButton>
                </ListItem>
                {index < notifications.length - 1 && <Divider variant="inset" component="li" />}
              </React.Fragment>
            ))}
          </List>
        )}
      </Box>
    </Drawer>
  );
};

export default NotificationDrawer;
