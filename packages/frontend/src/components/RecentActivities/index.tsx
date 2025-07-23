// packages/frontend/src/components/RecentActivities/index.tsx
import React from 'react';
import {
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Avatar,
  Typography,
  Box,
  Chip,
} from '@mui/material';
import {
  Sync,
  Add,
  Edit,
  Delete,
  Warning,
  CheckCircle,
  Error,
} from '@mui/icons-material';
import { formatDateTime } from '@/utils/formatters';
import { useAppSelector } from '@/hooks';

interface Activity {
  id: string;
  type: 'sync' | 'create' | 'update' | 'delete' | 'error';
  title: string;
  description: string;
  timestamp: string;
  status?: 'success' | 'error' | 'warning';
  metadata?: any;
}

const RecentActivities: React.FC = () => {
  const activities = useAppSelector((state) => state.dashboard.activities);

  const getIcon = (type: string) => {
    switch (type) {
      case 'sync':
        return <Sync />;
      case 'create':
        return <Add />;
      case 'update':
        return <Edit />;
      case 'delete':
        return <Delete />;
      case 'error':
        return <Error />;
      default:
        return <CheckCircle />;
    }
  };

  const getColor = (type: string) => {
    switch (type) {
      case 'sync':
        return 'primary';
      case 'create':
        return 'success';
      case 'update':
        return 'info';
      case 'delete':
        return 'error';
      case 'error':
        return 'error';
      default:
        return 'default';
    }
  };

  if (!activities || activities.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 4 }}>
        <Typography color="textSecondary">
          최근 활동이 없습니다
        </Typography>
      </Box>
    );
  }

  return (
    <List>
      {activities.map((activity: Activity, index: number) => (
        <ListItem
          key={activity.id}
          divider={index < activities.length - 1}
          sx={{
            '&:hover': {
              backgroundColor: 'action.hover',
            },
          }}
        >
          <ListItemAvatar>
            <Avatar sx={{ bgcolor: `${getColor(activity.type)}.light` }}>
              {getIcon(activity.type)}
            </Avatar>
          </ListItemAvatar>
          <ListItemText
            primary={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body1">{activity.title}</Typography>
                {activity.status && (
                  <Chip
                    label={activity.status}
                    size="small"
                    color={
                      activity.status === 'success'
                        ? 'success'
                        : activity.status === 'error'
                        ? 'error'
                        : 'warning'
                    }
                  />
                )}
              </Box>
            }
            secondary={
              <Box>
                <Typography variant="body2" color="textSecondary">
                  {activity.description}
                </Typography>
                <Typography variant="caption" color="textSecondary">
                  {formatDateTime(activity.timestamp)}
                </Typography>
              </Box>
            }
          />
        </ListItem>
      ))}
    </List>
  );
};

export default RecentActivities;
