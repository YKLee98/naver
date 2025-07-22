// packages/frontend/src/components/settings/NotificationSettings/index.tsx
import React from 'react';
import {
  Card,
  CardContent,
  Typography,
  FormControlLabel,
  Switch,
  Stack,
  TextField,
  Box,
  Divider,
  Chip,
} from '@mui/material';

interface NotificationSettingsProps {
  settings: {
    emailNotifications: boolean;
    notificationEmail: string;
    lowStockAlert: boolean;
    lowStockThreshold: number;
    syncErrorAlert: boolean;
    dailyReport: boolean;
  };
  onChange: (field: string, value: any) => void;
}

const NotificationSettings: React.FC<NotificationSettingsProps> = ({ settings, onChange }) => {
  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          알림 설정
        </Typography>

        <Stack spacing={3}>
          <FormControlLabel
            control={
              <Switch
                checked={settings.emailNotifications}
                onChange={(e) => onChange('emailNotifications', e.target.checked)}
              />
            }
            label="이메일 알림 활성화"
          />

          <TextField
            type="email"
            label="알림 수신 이메일"
            value={settings.notificationEmail}
            onChange={(e) => onChange('notificationEmail', e.target.value)}
            fullWidth
            disabled={!settings.emailNotifications}
            helperText="중요한 알림을 받을 이메일 주소"
          />

          <Divider />

          <Typography variant="subtitle1">알림 유형</Typography>

          <Box>
            <FormControlLabel
              control={
                <Switch
                  checked={settings.lowStockAlert}
                  onChange={(e) => onChange('lowStockAlert', e.target.checked)}
                  disabled={!settings.emailNotifications}
                />
              }
              label="재고 부족 알림"
            />
            <TextField
              type="number"
              label="재고 부족 임계값"
              value={settings.lowStockThreshold}
              onChange={(e) => onChange('lowStockThreshold', Number(e.target.value))}
              size="small"
              sx={{ ml: 2, width: 120 }}
              disabled={!settings.emailNotifications || !settings.lowStockAlert}
            />
          </Box>

          <FormControlLabel
            control={
              <Switch
                checked={settings.syncErrorAlert}
                onChange={(e) => onChange('syncErrorAlert', e.target.checked)}
                disabled={!settings.emailNotifications}
              />
            }
            label="동기화 오류 알림"
          />

          <FormControlLabel
            control={
              <Switch
                checked={settings.dailyReport}
                onChange={(e) => onChange('dailyReport', e.target.checked)}
                disabled={!settings.emailNotifications}
              />
            }
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                일일 리포트 수신
                <Chip label="매일 오전 9시" size="small" />
              </Box>
            }
          />
        </Stack>
      </CardContent>
    </Card>
  );
};

export default NotificationSettings;
