import React from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Chip,
  LinearProgress,
  Stack,
  Button,
  Tooltip,
} from '@mui/material';
import {
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
  Sync as SyncIcon,
  Schedule as ScheduleIcon,
} from '@mui/icons-material';
import { SyncStatus as SyncStatusType } from '@/types';
import { formatDateTime, formatRelativeTime } from '@/utils/formatters';
import { usePerformFullSyncMutation } from '@/store/api/apiSlice';

interface SyncStatusProps {
  status: SyncStatusType | null;
  loading?: boolean;
}

const SyncStatus: React.FC<SyncStatusProps> = ({ status, loading }) => {
  const [performFullSync, { isLoading: isSyncing }] = usePerformFullSyncMutation();

  const handleSync = async () => {
    try {
      await performFullSync().unwrap();
    } catch (error) {
      console.error('Sync failed:', error);
    }
  };

  if (loading || !status) {
    return (
      <Card>
        <CardContent>
          <LinearProgress />
        </CardContent>
      </Card>
    );
  }

  const getSyncStatusChip = () => {
    if (status.isRunning) {
      return (
        <Chip
          icon={<SyncIcon className="loading-spinner" />}
          label="동기화 중"
          color="primary"
          size="small"
        />
      );
    }

    const { syncedMappings, totalMappings } = status.statistics;
    const syncRate = totalMappings > 0 ? (syncedMappings / totalMappings) * 100 : 0;

    if (syncRate === 100) {
      return (
        <Chip
          icon={<CheckIcon />}
          label="완전 동기화"
          color="success"
          size="small"
        />
      );
    } else if (syncRate >= 80) {
      return (
        <Chip
          icon={<WarningIcon />}
          label="부분 동기화"
          color="warning"
          size="small"
        />
      );
    } else {
      return (
        <Chip
          icon={<ErrorIcon />}
          label="동기화 필요"
          color="error"
          size="small"
        />
      );
    }
  };

  return (
    <Card>
      <CardContent>
        <Stack spacing={3}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6" component="div">
              동기화 상태
            </Typography>
            {getSyncStatusChip()}
          </Box>

          {status.lastSync && (
            <Box>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                마지막 동기화
              </Typography>
              <Stack direction="row" spacing={1} alignItems="center">
                <ScheduleIcon fontSize="small" color="action" />
                <Tooltip title={formatDateTime(status.lastSync)}>
                  <Typography variant="body1">
                    {formatRelativeTime(status.lastSync)}
                  </Typography>
                </Tooltip>
              </Stack>
            </Box>
          )}

          <Box>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              동기화 진행률
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
              <Box sx={{ width: '100%', mr: 1 }}>
                <LinearProgress
                  variant="determinate"
                  value={(status.statistics.syncedMappings / status.statistics.totalMappings) * 100}
                  sx={{ height: 8, borderRadius: 4 }}
                />
              </Box>
              <Box sx={{ minWidth: 35 }}>
                <Typography variant="body2" color="text.secondary">
                  {`${Math.round((status.statistics.syncedMappings / status.statistics.totalMappings) * 100)}%`}
                </Typography>
              </Box>
            </Box>
          </Box>

          <Stack spacing={1}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body2" color="text.secondary">
                전체 매핑
              </Typography>
              <Typography variant="body2">
                {status.statistics.totalMappings}개
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body2" color="text.secondary">
                동기화 완료
              </Typography>
              <Typography variant="body2" color="success.main">
                {status.statistics.syncedMappings}개
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body2" color="text.secondary">
                대기중
              </Typography>
              <Typography variant="body2" color="warning.main">
                {status.statistics.pendingMappings}개
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body2" color="text.secondary">
                오류
              </Typography>
              <Typography variant="body2" color="error.main">
                {status.statistics.errorMappings}개
              </Typography>
            </Box>
          </Stack>

          <Button
            fullWidth
            variant="contained"
            startIcon={<SyncIcon />}
            onClick={handleSync}
            disabled={status.isRunning || isSyncing}
          >
            {status.isRunning ? '동기화 중...' : '전체 동기화 실행'}
          </Button>
        </Stack>
      </CardContent>
    </Card>
  );
};

export default SyncStatus;
