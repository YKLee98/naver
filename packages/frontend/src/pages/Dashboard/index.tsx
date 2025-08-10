// packages/frontend/src/pages/Dashboard/index.tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  Grid,
  Card,
  CardContent,
  Typography,
  Box,
  CircularProgress,
  Alert,
  IconButton,
  Chip,
  Paper,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Divider,
  Button,
  ButtonGroup,
  Tooltip,
  LinearProgress,
  Badge
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  TrendingUp,
  TrendingDown,
  Warning,
  CheckCircle,
  Error as ErrorIcon,
  Inventory,
  AttachMoney,
  Sync as SyncIcon,
  Notifications,
  Timeline,
  BarChart as BarChartIcon,
  PieChart as PieChartIcon,
  Download,
  Settings
} from '@mui/icons-material';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ChartTooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useAppDispatch, useAppSelector } from '../../hooks/redux';
import { dashboardService, DashboardStats, Activity, ChartData } from '../../services/api/dashboard.service';
import { addNotification } from '../../store/slices/notificationSlice';

const COLORS = {
  primary: '#1976d2',
  secondary: '#dc004e',
  success: '#4caf50',
  warning: '#ff9800',
  error: '#f44336',
  info: '#2196f3',
  chart: ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8']
};

const Dashboard: React.FC = () => {
  const dispatch = useAppDispatch();
  const user = useAppSelector((state) => state.auth.user);
  
  // State
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [salesChartData, setSalesChartData] = useState<ChartData | null>(null);
  const [inventoryChartData, setInventoryChartData] = useState<ChartData | null>(null);
  const [priceChartData, setPriceChartData] = useState<ChartData | null>(null);
  const [syncChartData, setSyncChartData] = useState<ChartData | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState('day');
  const [error, setError] = useState<string | null>(null);

  // Load dashboard data
  const loadDashboardData = useCallback(async (showLoader = true) => {
    try {
      if (showLoader) setLoading(true);
      setError(null);

      // Parallel API calls for better performance
      const [
        statsRes,
        activitiesRes,
        salesRes,
        inventoryRes,
        priceRes,
        syncRes
      ] = await Promise.all([
        dashboardService.getStatistics(),
        dashboardService.getRecentActivities({ limit: 10 }),
        dashboardService.getSalesChartData({ period: selectedPeriod }),
        dashboardService.getInventoryChartData(),
        dashboardService.getPriceChartData({ period: '7d' }),
        dashboardService.getSyncChartData({ period: '7d' })
      ]);

      setStats(statsRes.data.data);
      setActivities(activitiesRes.data.data.activities);
      setSalesChartData(salesRes.data.data);
      setInventoryChartData(inventoryRes.data.data);
      setPriceChartData(priceRes.data.data);
      setSyncChartData(syncRes.data.data);

      dispatch(addNotification({
        type: 'success',
        title: '성공',
        message: '대시보드 데이터를 성공적으로 로드했습니다.'
      }));
    } catch (err: any) {
      console.error('Failed to load dashboard data:', err);
      setError(err.response?.data?.message || '대시보드 데이터를 불러오는데 실패했습니다.');
      dispatch(addNotification({
        type: 'error',
        title: '오류',
        message: '대시보드 데이터 로드 실패'
      }));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dispatch, selectedPeriod]);

  // Initial load
  useEffect(() => {
    loadDashboardData();
  }, []);

  // Refresh handler
  const handleRefresh = () => {
    setRefreshing(true);
    loadDashboardData(false);
  };

  // Period change handler
  const handlePeriodChange = (period: string) => {
    setSelectedPeriod(period);
  };

  // Reload when period changes
  useEffect(() => {
    if (selectedPeriod) {
      loadDashboardData(false);
    }
  }, [selectedPeriod]);

  // Format number with commas
  const formatNumber = (num: number): string => {
    return new Intl.NumberFormat('ko-KR').format(num);
  };

  // Format currency
  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('ko-KR', {
      style: 'currency',
      currency: 'KRW'
    }).format(amount);
  };

  // Get status color
  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'normal':
        return COLORS.success;
      case 'warning':
        return COLORS.warning;
      case 'error':
        return COLORS.error;
      default:
        return COLORS.info;
    }
  };

  // Get activity icon
  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'sync':
        return <SyncIcon />;
      case 'inventory_update':
        return <Inventory />;
      case 'price_update':
        return <AttachMoney />;
      case 'error':
        return <ErrorIcon />;
      default:
        return <Timeline />;
    }
  };

  // Render loading state
  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="80vh">
        <CircularProgress size={60} />
      </Box>
    );
  }

  // Render error state
  if (error) {
    return (
      <Box p={3}>
        <Alert severity="error" action={
          <Button color="inherit" size="small" onClick={() => loadDashboardData()}>
            재시도
          </Button>
        }>
          {error}
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" component="h1">
          대시보드
        </Typography>
        <Box display="flex" gap={2}>
          <ButtonGroup variant="outlined" size="small">
            <Button 
              onClick={() => handlePeriodChange('hour')}
              variant={selectedPeriod === 'hour' ? 'contained' : 'outlined'}
            >
              시간
            </Button>
            <Button 
              onClick={() => handlePeriodChange('day')}
              variant={selectedPeriod === 'day' ? 'contained' : 'outlined'}
            >
              일
            </Button>
            <Button 
              onClick={() => handlePeriodChange('week')}
              variant={selectedPeriod === 'week' ? 'contained' : 'outlined'}
            >
              주
            </Button>
            <Button 
              onClick={() => handlePeriodChange('month')}
              variant={selectedPeriod === 'month' ? 'contained' : 'outlined'}
            >
              월
            </Button>
          </ButtonGroup>
          <Tooltip title="새로고침">
            <IconButton onClick={handleRefresh} disabled={refreshing}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {refreshing && <LinearProgress sx={{ mb: 2 }} />}

      {/* Statistics Cards */}
      {stats && (
        <Grid container spacing={3} mb={3}>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Box>
                    <Typography color="textSecondary" gutterBottom>
                      총 재고
                    </Typography>
                    <Typography variant="h5">
                      {formatNumber(stats.totalInventory)}
                    </Typography>
                    <Box display="flex" alignItems="center" mt={1}>
                      <Chip 
                        label={`활성: ${stats.activeProducts}`}
                        size="small"
                        color="success"
                      />
                    </Box>
                  </Box>
                  <Inventory fontSize="large" color="primary" />
                </Box>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Box>
                    <Typography color="textSecondary" gutterBottom>
                      오늘 판매
                    </Typography>
                    <Typography variant="h5">
                      {formatNumber(stats.todaySales)}
                    </Typography>
                    <Box display="flex" alignItems="center" mt={1}>
                      <TrendingUp fontSize="small" color="success" />
                      <Typography variant="caption" color="success.main" ml={0.5}>
                        전일 대비 +12%
                      </Typography>
                    </Box>
                  </Box>
                  <AttachMoney fontSize="large" color="success" />
                </Box>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Box>
                    <Typography color="textSecondary" gutterBottom>
                      동기화 상태
                    </Typography>
                    <Typography variant="h5">
                      {stats.syncSuccessRate}%
                    </Typography>
                    <Box display="flex" alignItems="center" mt={1}>
                      <Chip 
                        label={stats.syncStatus}
                        size="small"
                        style={{ 
                          backgroundColor: getStatusColor(stats.syncStatus),
                          color: 'white'
                        }}
                      />
                    </Box>
                  </Box>
                  <SyncIcon 
                    fontSize="large" 
                    style={{ color: getStatusColor(stats.syncStatus) }}
                  />
                </Box>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Box>
                    <Typography color="textSecondary" gutterBottom>
                      알림
                    </Typography>
                    <Typography variant="h5">
                      {stats.alertCount}
                    </Typography>
                    <Box display="flex" gap={0.5} mt={1}>
                      {stats.lowStockCount > 0 && (
                        <Chip 
                          label={`재고부족: ${stats.lowStockCount}`}
                          size="small"
                          color="warning"
                        />
                      )}
                      {stats.outOfStockCount > 0 && (
                        <Chip 
                          label={`품절: ${stats.outOfStockCount}`}
                          size="small"
                          color="error"
                        />
                      )}
                    </Box>
                  </Box>
                  <Badge badgeContent={stats.alertCount} color="error">
                    <Notifications fontSize="large" color="action" />
                  </Badge>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Charts */}
      <Grid container spacing={3} mb={3}>
        {/* Sales Chart */}
        <Grid item xs={12} md={8}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                판매 추이
              </Typography>
              {salesChartData && (
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={salesChartData.datasets[0].data.map((value, index) => ({
                    name: salesChartData.labels[index],
                    value
                  }))}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <ChartTooltip />
                    <Area 
                      type="monotone" 
                      dataKey="value" 
                      stroke={COLORS.primary}
                      fill={COLORS.primary}
                      fillOpacity={0.3}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
              {salesChartData?.summary && (
                <Box display="flex" justifyContent="space-between" mt={2}>
                  <Typography variant="body2" color="textSecondary">
                    총 판매: {formatNumber(salesChartData.summary.total || 0)}
                  </Typography>
                  <Typography variant="body2" color="textSecondary">
                    평균: {formatNumber(salesChartData.summary.average || 0)}
                  </Typography>
                  <Chip 
                    icon={salesChartData.summary.trend === 'up' ? <TrendingUp /> : <TrendingDown />}
                    label={`${salesChartData.summary.changePercent || 0}%`}
                    color={salesChartData.summary.trend === 'up' ? 'success' : 'error'}
                    size="small"
                  />
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Inventory Distribution */}
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                재고 현황
              </Typography>
              {inventoryChartData && (
                <>
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={inventoryChartData.datasets[0].data.map((value, index) => ({
                          name: inventoryChartData.labels[index],
                          value
                        }))}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {inventoryChartData.datasets[0].data.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS.chart[index % COLORS.chart.length]} />
                        ))}
                      </Pie>
                      <ChartTooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <Box mt={2}>
                    {inventoryChartData.labels.map((label, index) => (
                      <Box key={label} display="flex" alignItems="center" mb={1}>
                        <Box
                          width={16}
                          height={16}
                          bgcolor={COLORS.chart[index % COLORS.chart.length]}
                          mr={1}
                        />
                        <Typography variant="body2">
                          {label}: {inventoryChartData.datasets[0].data[index]}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                </>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Sync History */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                동기화 이력
              </Typography>
              {syncChartData && (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={syncChartData.labels.map((label, index) => ({
                    name: label,
                    success: syncChartData.datasets[0]?.data[index] || 0,
                    failed: syncChartData.datasets[1]?.data[index] || 0
                  }))}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <ChartTooltip />
                    <Legend />
                    <Bar dataKey="success" fill={COLORS.success} name="성공" />
                    <Bar dataKey="failed" fill={COLORS.error} name="실패" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Price Trends */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                가격 추이
              </Typography>
              {priceChartData && (
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={priceChartData.labels.map((label, index) => ({
                    name: label,
                    price: priceChartData.datasets[0].data[index]
                  }))}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <ChartTooltip formatter={(value) => formatCurrency(Number(value))} />
                    <Line 
                      type="monotone" 
                      dataKey="price" 
                      stroke={COLORS.secondary}
                      strokeWidth={2}
                      dot={{ fill: COLORS.secondary }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Recent Activities */}
      <Grid container spacing={3}>
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                <Typography variant="h6">
                  최근 활동
                </Typography>
                <Button size="small" color="primary">
                  모두 보기
                </Button>
              </Box>
              <List>
                {activities.map((activity, index) => (
                  <React.Fragment key={activity._id}>
                    <ListItem alignItems="flex-start">
                      <ListItemIcon>
                        {getActivityIcon(activity.type)}
                      </ListItemIcon>
                      <ListItemText
                        primary={activity.action}
                        secondary={
                          <Box display="flex" justifyContent="space-between">
                            <Typography variant="body2" color="textSecondary">
                              {activity.details}
                            </Typography>
                            <Typography variant="caption" color="textSecondary">
                              {format(parseISO(activity.createdAt), 'MM/dd HH:mm', { locale: ko })}
                            </Typography>
                          </Box>
                        }
                      />
                    </ListItem>
                    {index < activities.length - 1 && <Divider variant="inset" component="li" />}
                  </React.Fragment>
                ))}
              </List>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Dashboard;