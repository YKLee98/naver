// packages/frontend/src/components/SyncStatusCard/index.tsx
import React from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  LinearProgress,
  Chip,
  Button,
  Alert,
} from '@mui/material';
import { Sync, CheckCircle, Error, Schedule } from '@mui/icons-material';
import { formatDateTime } from '@/utils/formatters';

interface SyncStatusCardProps {
  status: {
    isRunning: boolean;
    lastSync?: string;
    nextSync?: string;
    progress?: number;
    error?: string;
    successCount?: number;
    failureCount?: number;
    totalCount?: number;
  };
  onManualSync?: () => void;
}

const SyncStatusCard: React.FC<SyncStatusCardProps> = ({ status, onManualSync }) => {
  const getStatusIcon = () => {
    if (status.isRunning) return <Sync className="rotating" />;
    if (status.error) return <Error color="error" />;
    return <CheckCircle color="success" />;
  };

  const getStatusLabel = () => {
    if (status.isRunning) return '동기화 진행 중';
    if (status.error) return '동기화 오류';
    return '정상';
  };

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {getStatusIcon()}
            <Box>
              <Typography variant="h6">동기화 상태</Typography>
              <Chip
                label={getStatusLabel()}
                size="small"
                color={status.error ? 'error' : status.isRunning ? 'warning' : 'success'}
              />
            </Box>
          </Box>
          {onManualSync && (
            <Button
              variant="outlined"
              startIcon={<Sync />}
              onClick={onManualSync}
              disabled={status.isRunning}
            >
              수동 동기화
            </Button>
          )}
        </Box>

        {status.isRunning && status.progress !== undefined && (
          <Box sx={{ mb: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="body2">진행률</Typography>
              <Typography variant="body2">{status.progress}%</Typography>
            </Box>
            <LinearProgress variant="determinate" value={status.progress} />
          </Box>
        )}

        {status.error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {status.error}
          </Alert>
        )}

        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
          <Box>
            <Typography variant="body2" color="textSecondary">
              마지막 동기화
            </Typography>
            <Typography variant="body2">
              {status.lastSync ? formatDateTime(status.lastSync) : '-'}
            </Typography>
          </Box>
          <Box>
            <Typography variant="body2" color="textSecondary">
              다음 동기화
            </Typography>
            <Typography variant="body2">
              {status.nextSync ? formatDateTime(status.nextSync) : '-'}
            </Typography>
          </Box>
        </Box>

        {status.totalCount && (
          <Box sx={{ mt: 2, pt: 2, borderTop: 1, borderColor: 'divider' }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2 }}>
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="h6" color="primary">
                  {status.successCount || 0}
                </Typography>
                <Typography variant="caption" color="textSecondary">
                  성공
                </Typography>
              </Box>
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="h6" color="error">
                  {status.failureCount || 0}
                </Typography>
                <Typography variant="caption" color="textSecondary">
                  실패
                </Typography>
              </Box>
              <Box sx={{ textAlign: 'center' }}>
                <Typography variant="h6">
                  {status.totalCount}
                </Typography>
                <Typography variant="caption" color="textSecondary">
                  전체
                </Typography>
              </Box>
            </Box>
          </Box>
        )}
      </CardContent>
    </Card>
  );
};

export default SyncStatusCard;