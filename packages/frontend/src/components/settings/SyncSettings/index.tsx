
// packages/frontend/src/components/settings/SyncSettings/index.tsx
import React from 'react';
import {
  Card,
  CardContent,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Switch,
  Stack,
  TextField,
  InputAdornment,
  Box,
  Divider,
} from '@mui/material';
import { SYNC_INTERVALS } from '@/utils/constants';

interface SyncSettingsProps {
  settings: {
    syncInterval: number;
    autoSync: boolean;
    syncInventory: boolean;
    syncPrice: boolean;
    priceMargin: number;
    conflictResolution: 'naver' | 'shopify' | 'manual';
  };
  onChange: (field: string, value: any) => void;
}

const SyncSettings: React.FC<SyncSettingsProps> = ({ settings, onChange }) => {
  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          동기화 설정
        </Typography>

        <Stack spacing={3}>
          <FormControl fullWidth>
            <InputLabel>동기화 주기</InputLabel>
            <Select
              value={settings.syncInterval}
              onChange={(e) => onChange('syncInterval', e.target.value)}
              label="동기화 주기"
            >
              {SYNC_INTERVALS.map((interval) => (
                <MenuItem key={interval.value} value={interval.value}>
                  {interval.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControlLabel
            control={
              <Switch
                checked={settings.autoSync}
                onChange={(e) => onChange('autoSync', e.target.checked)}
              />
            }
            label="자동 동기화 활성화"
          />

          <Divider />

          <Typography variant="subtitle1">동기화 항목</Typography>

          <FormControlLabel
            control={
              <Switch
                checked={settings.syncInventory}
                onChange={(e) => onChange('syncInventory', e.target.checked)}
              />
            }
            label="재고 동기화"
          />

          <FormControlLabel
            control={
              <Switch
                checked={settings.syncPrice}
                onChange={(e) => onChange('syncPrice', e.target.checked)}
              />
            }
            label="가격 동기화"
          />

          <Divider />

          <TextField
            type="number"
            label="기본 마진율"
            value={settings.priceMargin}
            onChange={(e) => onChange('priceMargin', Number(e.target.value))}
            fullWidth
            InputProps={{
              endAdornment: <InputAdornment position="end">%</InputAdornment>,
            }}
            helperText="네이버 가격에서 Shopify 가격 계산 시 적용할 기본 마진율"
          />

          <FormControl fullWidth>
            <InputLabel>충돌 해결 방식</InputLabel>
            <Select
              value={settings.conflictResolution}
              onChange={(e) => onChange('conflictResolution', e.target.value)}
              label="충돌 해결 방식"
            >
              <MenuItem value="naver">네이버 우선</MenuItem>
              <MenuItem value="shopify">Shopify 우선</MenuItem>
              <MenuItem value="manual">수동 해결</MenuItem>
            </Select>
          </FormControl>
        </Stack>
      </CardContent>
    </Card>
  );
};

export default SyncSettings;

