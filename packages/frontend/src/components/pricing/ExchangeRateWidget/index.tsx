import React, { useEffect } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Chip,
  CircularProgress,
  Alert,
  Stack,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  TrendingFlat as TrendingFlatIcon,
  Refresh as RefreshIcon,
  Schedule as ScheduleIcon,
} from '@mui/icons-material';
import { useGetExchangeRateQuery } from '@/store/api/apiSlice';
import { formatCurrency, formatPercent, formatDateTime } from '@/utils/formatters';

const ExchangeRateWidget: React.FC = () => {
  const { data: exchangeRate, isLoading, refetch } = useGetExchangeRateQuery(undefined, {
    pollingInterval: 3600000, // 1시간마다 자동 갱신
  });

  const getTrendIcon = () => {
    if (!exchangeRate?.change) return <TrendingFlatIcon />;
    if (exchangeRate.change > 0) return <TrendingUpIcon />;
    return <TrendingDownIcon />;
  };

  const getTrendColor = () => {
    if (!exchangeRate?.change) return 'default';
    return exchangeRate.change > 0 ? 'error' : 'success';
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
            <CircularProgress size={24} />
          </Box>
        </CardContent>
      </Card>
    );
  }

  if (!exchangeRate) {
    return (
      <Card>
        <CardContent>
          <Alert severity="error">환율 정보를 불러올 수 없습니다.</Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
          <Typography variant="h6" component="div">
            실시간 환율
          </Typography>
          <Tooltip title="환율 새로고침">
            <IconButton size="small" onClick={() => refetch()}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        </Box>

        <Stack spacing={2}>
          <Box>
            <Typography variant="h4" component="div" sx={{ fontWeight: 'bold' }}>
              ₩{formatCurrency(exchangeRate.rate, 'KRW')}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              1 USD = {exchangeRate.rate} KRW
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Chip
              icon={getTrendIcon()}
              label={`${exchangeRate.change > 0 ? '+' : ''}${formatPercent(exchangeRate.changePercent)}`}
              color={getTrendColor() as any}
              size="small"
            />
            <Typography variant="body2" color="text.secondary">
              전일 대비 {Math.abs(exchangeRate.change)}원
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <ScheduleIcon fontSize="small" color="action" />
            <Typography variant="caption" color="text.secondary">
              마지막 업데이트: {formatDateTime(exchangeRate.updatedAt)}
            </Typography>
          </Box>

          {exchangeRate.source && (
            <Typography variant="caption" color="text.secondary">
              출처: {exchangeRate.source}
            </Typography>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
};

export default ExchangeRateWidget;
