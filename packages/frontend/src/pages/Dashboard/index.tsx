// packages/frontend/src/pages/Dashboard/index.tsx
import React, { useEffect, useState } from 'react';
import {
  Grid,
  Paper,
  Typography,
  Box,
  Card,
  CardContent,
  IconButton,
  Skeleton,
  Alert,
  Button,
} from '@mui/material';
import {
  TrendingUp,
  TrendingDown,
  Inventory2,
  AttachMoney,
  Sync,
  Warning,
  CheckCircle,
  Error,
  Refresh,
} from '@mui/icons-material';
import { useAppDispatch, useAppSelector } from '@/hooks';
import { fetchDashboardStats } from '@/store/slices/dashboardSlice';
import { startFullSync } from '@/store/slices/syncSlice';
import StatCard from '@/components/StatCard';
import RecentActivities from '@/components/RecentActivities';
import InventoryChart from '@/components/Charts/InventoryChart';
import PriceChart from '@/components/Charts/PriceChart';
import SyncStatusCard from '@/components/SyncStatusCard';
import { formatNumber, formatCurrency, formatPercent } from '@/utils/formatters';

const Dashboard: React.FC = () => {
  const dispatch = useAppDispatch();
  const { stats, loading, error } = useAppSelector((state) => state.dashboard);
  const { syncStatus, isSyncing } = useAppSelector((state) => state.sync);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    dispatch(fetchDashboardStats());
  }, [dispatch]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await dispatch(fetchDashboardStats());
    setRefreshing(false);
  };

  const handleStartSync = () => {
    dispatch(startFullSync());
  };

  if (loading && !stats) {
    return (
      <Box sx={{ p: 3 }}>
        <Grid container spacing={3}>
          {[1, 2, 3, 4].map((i) => (
            <Grid item xs={12} sm={6} md={3} key={i}>
              <Skeleton variant="rectangular" height={120} />
            </Grid>
          ))}
        </Grid>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error" action={
          <Button color="inherit" size="small" onClick={handleRefresh}>
            다시 시도
          </Button>
        }>
          대시보드 데이터를 불러오는 중 오류가 발생했습니다: {error}
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4" component="h1">
          대시보드
        </Typography>
        <Box>
          <IconButton onClick={handleRefresh} disabled={refreshing}>
            <Refresh />
          </IconButton>
          <Button
            variant="contained"
            startIcon={<Sync />}
            onClick={handleStartSync}
            disabled={isSyncing}
            sx={{ ml: 1 }}
          >
            {isSyncing ? '동기화 중...' : '전체 동기화'}
          </Button>
        </Box>
      </Box>

      {/* Summary Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="총 상품 수"
            value={formatNumber(stats?.totalProducts || 0)}
            icon={<Inventory2 />}
            trend={stats?.productsTrend}
            color="primary"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="활성 상품"
            value={formatNumber(stats?.activeProducts || 0)}
            icon={<CheckCircle />}
            subtitle={`${formatPercent((stats?.activeProducts || 0) / (stats?.totalProducts || 1) * 100)}%`}
            color="success"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="동기화 오류"
            value={formatNumber(stats?.syncErrors || 0)}
            icon={stats?.syncErrors > 0 ? <Warning /> : <CheckCircle />}
            color={stats?.syncErrors > 0 ? "warning" : "success"}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="오늘 매출"
            value={formatCurrency(stats?.todayRevenue || 0)}
            icon={<AttachMoney />}
            trend={stats?.revenueTrend}
            color="info"
          />
        </Grid>
      </Grid>

      {/* Sync Status */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12}>
          <SyncStatusCard status={syncStatus} />
        </Grid>
      </Grid>

      {/* Charts */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2, height: 400 }}>
            <Typography variant="h6" gutterBottom>
              재고 현황
            </Typography>
            <InventoryChart />
          </Paper>
        </Grid>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2, height: 400 }}>
            <Typography variant="h6" gutterBottom>
              가격 변동 추이
            </Typography>
            <PriceChart />
          </Paper>
        </Grid>
      </Grid>

      {/* Recent Activities */}
      <Grid container spacing={3}>
        <Grid item xs={12}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              최근 활동
            </Typography>
            <RecentActivities />
          </Paper>
        </Grid>
      </Grid>

      {/* Low Stock Alert */}
      {stats?.lowStockProducts && stats.lowStockProducts.length > 0 && (
        <Grid container spacing={3} sx={{ mt: 2 }}>
          <Grid item xs={12}>
            <Alert severity="warning">
              <Typography variant="subtitle2" gutterBottom>
                재고 부족 경고
              </Typography>
              <Typography variant="body2">
                {stats.lowStockProducts.length}개 상품의 재고가 부족합니다.
              </Typography>
            </Alert>
          </Grid>
        </Grid>
      )}
    </Box>
  );
};

export default Dashboard;