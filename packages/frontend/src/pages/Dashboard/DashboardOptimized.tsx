// packages/frontend/src/pages/Dashboard/DashboardOptimized.tsx
import React, { useEffect, useMemo, useCallback, memo } from 'react';
import {
  Grid,
  Paper,
  Typography,
  Box,
  Card,
  CardContent,
  Skeleton,
  Alert,
} from '@mui/material';
import {
  TrendingUp,
  Inventory,
  AttachMoney,
  Sync,
  Warning,
  CheckCircle,
} from '@mui/icons-material';
import { useAppDispatch, useAppSelector } from '@hooks/redux';
import { fetchDashboardData, selectDashboardState } from '@store/slices/dashboardSlice';
import { ws } from '@services/websocket/WebSocketService';

// Lazy load heavy components
const SalesChart = React.lazy(() => import('./components/SalesChart'));
const InventoryChart = React.lazy(() => import('./components/InventoryChart'));
const RecentActivities = React.lazy(() => import('./components/RecentActivities'));
const SyncStatus = React.lazy(() => import('./components/SyncStatus'));

/**
 * Memoized Stat Card Component
 */
const StatCard = memo(({ 
  title, 
  value, 
  icon, 
  color, 
  trend 
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  trend?: { value: number; isPositive: boolean };
}) => (
  <Card elevation={2}>
    <CardContent>
      <Box display="flex" justifyContent="space-between" alignItems="flex-start">
        <Box>
          <Typography color="textSecondary" gutterBottom variant="body2">
            {title}
          </Typography>
          <Typography variant="h4" component="div">
            {value}
          </Typography>
          {trend && (
            <Typography
              variant="body2"
              sx={{
                color: trend.isPositive ? 'success.main' : 'error.main',
                mt: 1,
              }}
            >
              {trend.isPositive ? '+' : ''}{trend.value}%
            </Typography>
          )}
        </Box>
        <Box
          sx={{
            bgcolor: `${color}.light`,
            borderRadius: 2,
            p: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {icon}
        </Box>
      </Box>
    </CardContent>
  </Card>
));

StatCard.displayName = 'StatCard';

/**
 * Loading skeleton for dashboard
 */
const DashboardSkeleton: React.FC = () => (
  <Grid container spacing={3}>
    {[1, 2, 3, 4].map((i) => (
      <Grid item xs={12} sm={6} md={3} key={i}>
        <Skeleton variant="rectangular" height={120} />
      </Grid>
    ))}
    <Grid item xs={12} md={8}>
      <Skeleton variant="rectangular" height={400} />
    </Grid>
    <Grid item xs={12} md={4}>
      <Skeleton variant="rectangular" height={400} />
    </Grid>
  </Grid>
);

/**
 * Optimized Dashboard Component
 */
export const DashboardOptimized: React.FC = () => {
  const dispatch = useAppDispatch();
  const { 
    statistics, 
    charts, 
    activities, 
    loading, 
    error,
    lastUpdated 
  } = useAppSelector(selectDashboardState);

  // Fetch dashboard data on mount
  useEffect(() => {
    dispatch(fetchDashboardData());

    // Setup WebSocket listeners for real-time updates
    const unsubscribers = [
      ws.on('dashboard:update', (data) => {
        console.log('Dashboard update received:', data);
        // Update specific parts of dashboard without full refresh
      }),
      ws.on('metric:update', (data) => {
        console.log('Metric update received:', data);
        // Update metrics in real-time
      }),
    ];

    // Refresh data every 5 minutes
    const refreshInterval = setInterval(() => {
      dispatch(fetchDashboardData());
    }, 300000);

    // Cleanup
    return () => {
      unsubscribers.forEach(unsub => unsub());
      clearInterval(refreshInterval);
    };
  }, [dispatch]);

  // Memoize computed values
  const syncStatusColor = useMemo(() => {
    switch (statistics?.syncStatus) {
      case 'normal':
        return 'success';
      case 'warning':
        return 'warning';
      case 'error':
        return 'error';
      default:
        return 'info';
    }
  }, [statistics?.syncStatus]);

  const formatCurrency = useCallback((value: number) => {
    return new Intl.NumberFormat('ko-KR', {
      style: 'currency',
      currency: 'KRW',
    }).format(value);
  }, []);

  const formatNumber = useCallback((value: number) => {
    return new Intl.NumberFormat('ko-KR').format(value);
  }, []);

  // Handle refresh
  const handleRefresh = useCallback(() => {
    dispatch(fetchDashboardData());
  }, [dispatch]);

  if (loading && !statistics) {
    return <DashboardSkeleton />;
  }

  if (error) {
    return (
      <Alert severity="error" action={
        <button onClick={handleRefresh}>Retry</button>
      }>
        Failed to load dashboard data: {error}
      </Alert>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box mb={3}>
        <Typography variant="h4" gutterBottom>
          Dashboard
        </Typography>
        <Typography variant="body2" color="textSecondary">
          Last updated: {lastUpdated ? new Date(lastUpdated).toLocaleString() : 'Never'}
        </Typography>
      </Box>

      {/* Stats Cards */}
      <Grid container spacing={3} mb={3}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Today's Sales"
            value={formatCurrency(statistics?.todaySales || 0)}
            icon={<AttachMoney sx={{ color: 'primary.main' }} />}
            color="primary"
            trend={{ value: 12.5, isPositive: true }}
          />
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total Inventory"
            value={formatNumber(statistics?.totalInventory || 0)}
            icon={<Inventory sx={{ color: 'info.main' }} />}
            color="info"
            trend={{ value: -2.3, isPositive: false }}
          />
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Active Products"
            value={formatNumber(statistics?.activeProducts || 0)}
            icon={<TrendingUp sx={{ color: 'success.main' }} />}
            color="success"
            trend={{ value: 5.7, isPositive: true }}
          />
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Sync Status"
            value={statistics?.syncStatus || 'Unknown'}
            icon={
              statistics?.syncStatus === 'normal' ? (
                <CheckCircle sx={{ color: 'success.main' }} />
              ) : (
                <Warning sx={{ color: 'warning.main' }} />
              )
            }
            color={syncStatusColor}
          />
        </Grid>
      </Grid>

      {/* Charts Section */}
      <Grid container spacing={3} mb={3}>
        <Grid item xs={12} md={8}>
          <Paper elevation={2} sx={{ p: 3, height: 400 }}>
            <Typography variant="h6" gutterBottom>
              Sales Trend
            </Typography>
            <React.Suspense fallback={<Skeleton variant="rectangular" height={320} />}>
              <SalesChart data={charts?.sales} />
            </React.Suspense>
          </Paper>
        </Grid>
        
        <Grid item xs={12} md={4}>
          <Paper elevation={2} sx={{ p: 3, height: 400 }}>
            <Typography variant="h6" gutterBottom>
              Inventory Distribution
            </Typography>
            <React.Suspense fallback={<Skeleton variant="rectangular" height={320} />}>
              <InventoryChart data={charts?.inventory} />
            </React.Suspense>
          </Paper>
        </Grid>
      </Grid>

      {/* Bottom Section */}
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Paper elevation={2} sx={{ p: 3, height: 400 }}>
            <Typography variant="h6" gutterBottom>
              Recent Activities
            </Typography>
            <React.Suspense fallback={<Skeleton variant="rectangular" height={320} />}>
              <RecentActivities activities={activities} />
            </React.Suspense>
          </Paper>
        </Grid>
        
        <Grid item xs={12} md={6}>
          <Paper elevation={2} sx={{ p: 3, height: 400 }}>
            <Typography variant="h6" gutterBottom>
              Sync Operations
            </Typography>
            <React.Suspense fallback={<Skeleton variant="rectangular" height={320} />}>
              <SyncStatus />
            </React.Suspense>
          </Paper>
        </Grid>
      </Grid>

      {/* Alerts Section */}
      {statistics?.alertCount > 0 && (
        <Box mt={3}>
          <Alert severity="warning">
            You have {statistics.alertCount} pending alerts that require attention.
          </Alert>
        </Box>
      )}
    </Box>
  );
};

export default DashboardOptimized;