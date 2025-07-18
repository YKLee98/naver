import React from 'react';
import {
  Grid,
  Card,
  CardContent,
  Typography,
  Box,
  LinearProgress,
} from '@mui/material';
import {
  Inventory as InventoryIcon,
  Sync as SyncIcon,
  Error as ErrorIcon,
  ShoppingCart as OrderIcon,
} from '@mui/icons-material';
import { DashboardStats as DashboardStatsType } from '@/types';
import { formatNumber } from '@/utils/formatters';

interface StatsCardProps {
  title: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  subtitle?: string;
  progress?: number;
}

const StatsCard: React.FC<StatsCardProps> = ({
  title,
  value,
  icon,
  color,
  subtitle,
  progress,
}) => {
  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 48,
              height: 48,
              borderRadius: 2,
              bgcolor: `${color}.light`,
              color: `${color}.main`,
              mr: 2,
            }}
          >
            {icon}
          </Box>
          <Box sx={{ flexGrow: 1 }}>
            <Typography color="text.secondary" variant="body2">
              {title}
            </Typography>
            <Typography variant="h5" component="div">
              {formatNumber(value)}
            </Typography>
          </Box>
        </Box>
        {subtitle && (
          <Typography variant="body2" color="text.secondary">
            {subtitle}
          </Typography>
        )}
        {progress !== undefined && (
          <Box sx={{ mt: 1 }}>
            <LinearProgress
              variant="determinate"
              value={progress}
              color={color as any}
              sx={{ height: 6, borderRadius: 3 }}
            />
          </Box>
        )}
      </CardContent>
    </Card>
  );
};

interface DashboardStatsProps {
  stats: DashboardStatsType | null;
  loading?: boolean;
}

const DashboardStats: React.FC<DashboardStatsProps> = ({ stats, loading }) => {
  if (loading || !stats) {
    return (
      <Grid container spacing={3}>
        {[1, 2, 3, 4].map((i) => (
          <Grid item xs={12} sm={6} md={3} key={i}>
            <Card>
              <CardContent>
                <Box sx={{ height: 120 }}>
                  <LinearProgress />
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    );
  }

  const successRate = stats.mappings.total > 0
    ? ((stats.mappings.active / stats.mappings.total) * 100)
    : 0;

  return (
    <Grid container spacing={3}>
      <Grid item xs={12} sm={6} md={3}>
        <StatsCard
          title="전체 매핑"
          value={stats.mappings.total}
          icon={<InventoryIcon />}
          color="primary"
          subtitle={`활성: ${stats.mappings.active}개`}
          progress={successRate}
        />
      </Grid>
      
      <Grid item xs={12} sm={6} md={3}>
        <StatsCard
          title="동기화 대기"
          value={stats.mappings.pending}
          icon={<SyncIcon />}
          color="warning"
          subtitle="처리 대기중"
        />
      </Grid>
      
      <Grid item xs={12} sm={6} md={3}>
        <StatsCard
          title="오류"
          value={stats.mappings.failed}
          icon={<ErrorIcon />}
          color="error"
          subtitle="확인 필요"
        />
      </Grid>
      
      <Grid item xs={12} sm={6} md={3}>
        <StatsCard
          title="오늘 주문"
          value={stats.orders.today}
          icon={<OrderIcon />}
          color="success"
          subtitle={`이번 주: ${stats.orders.week}건`}
        />
      </Grid>
    </Grid>
  );
};

export default DashboardStats;

