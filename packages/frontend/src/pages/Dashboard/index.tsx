// packages/frontend/src/pages/Dashboard/index.tsx
import React, { useEffect, useState } from 'react';
import {
  Box,
  Grid,
  Paper,
  Typography,
  Card,
  CardContent,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Chip,
  CircularProgress,
  Alert,
} from '@mui/material';
import {
  Inventory2,
  AttachMoney,
  Sync as SyncIcon,
  Warning,
  TrendingUp,
  TrendingDown,
  ShoppingCart,
  Error,
  CheckCircle,
  Refresh,
} from '@mui/icons-material';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { useAppDispatch } from '@/hooks';
import { dashboardService } from '@/services/api/dashboard.service';
import { formatNumber, formatCurrency } from '@/utils/formatters';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

interface DashboardStats {
  totalInventory: number;
  todaySales: number;
  syncStatus: 'normal' | 'warning' | 'error';
  alertCount: number;
  inventoryValue: number;
  lowStockCount: number;
  outOfStockCount: number;
  syncSuccessRate: number;
}

interface ActivityItem {
  id: string;
  timestamp: string;
  type: 'order' | 'sync' | 'price' | 'alert';
  message: string;
  status: 'success' | 'warning' | 'error';
  details?: string;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];

const Dashboard: React.FC = () => {
  const dispatch = useAppDispatch();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({
    totalInventory: 0,
    todaySales: 0,
    syncStatus: 'normal',
    alertCount: 0,
    inventoryValue: 0,
    lowStockCount: 0,
    outOfStockCount: 0,
    syncSuccessRate: 0,
  });
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [salesData, setSalesData] = useState<any[]>([]);
  const [inventoryData, setInventoryData] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // 대시보드 데이터 로드
  const loadDashboardData = async () => {
    try {
      const [statsRes, activitiesRes, salesRes, inventoryRes] = await Promise.all([
        dashboardService.getStatistics(),
        dashboardService.getRecentActivities(),
        dashboardService.getSalesChartData({ period: 'day' }),
        dashboardService.getInventoryChartData(),
      ]);

      setStats(statsRes.data.data);
      setActivities(activitiesRes.data.data.activities);
      setSalesData(salesRes.data.data);
      setInventoryData(inventoryRes.data.data);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
    
    // 30초마다 자동 새로고침
    const interval = setInterval(loadDashboardData, 30000);
    
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    loadDashboardData();
  };

  // 활동 아이콘 렌더링
  const getActivityIcon = (type: string, status: string) => {
    if (status === 'error') return <Error color="error" />;
    
    switch (type) {
      case 'order':
        return <ShoppingCart color="primary" />;
      case 'sync':
        return <SyncIcon color="success" />;
      case 'price':
        return <AttachMoney color="warning" />;
      case 'alert':
        return <Warning color="error" />;
      default:
        return <CheckCircle />;
    }
  };

  // 동기화 상태 색상
  const getSyncStatusColor = (status: string) => {
    switch (status) {
      case 'normal':
        return 'success';
      case 'warning':
        return 'warning';
      case 'error':
        return 'error';
      default:
        return 'default';
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="80vh">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {/* 헤더 */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            대시보드
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {format(new Date(), 'yyyy년 MM월 dd일 EEEE', { locale: ko })}
          </Typography>
        </Box>
        <IconButton onClick={handleRefresh} disabled={refreshing}>
          <Refresh />
        </IconButton>
      </Box>

      {/* 요약 카드 */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="text.secondary" gutterBottom>
                    총 재고
                  </Typography>
                  <Typography variant="h4">
                    {formatNumber(stats.totalInventory)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {formatCurrency(stats.inventoryValue)}
                  </Typography>
                </Box>
                <Inventory2 sx={{ fontSize: 40, color: 'primary.main', opacity: 0.3 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="text.secondary" gutterBottom>
                    오늘 매출
                  </Typography>
                  <Typography variant="h4">
                    {formatCurrency(stats.todaySales)}
                  </Typography>
                  <Box display="flex" alignItems="center" mt={1}>
                    <TrendingUp fontSize="small" color="success" />
                    <Typography variant="body2" color="success.main" sx={{ ml: 0.5 }}>
                      15.3%
                    </Typography>
                  </Box>
                </Box>
                <AttachMoney sx={{ fontSize: 40, color: 'success.main', opacity: 0.3 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="text.secondary" gutterBottom>
                    동기화 상태
                  </Typography>
                  <Typography variant="h5">
                    {stats.syncStatus === 'normal' ? '정상' : stats.syncStatus === 'warning' ? '주의' : '오류'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    성공률 {stats.syncSuccessRate}%
                  </Typography>
                </Box>
                <SyncIcon 
                  sx={{ 
                    fontSize: 40, 
                    color: `${getSyncStatusColor(stats.syncStatus)}.main`, 
                    opacity: 0.3 
                  }} 
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="text.secondary" gutterBottom>
                    주의 필요
                  </Typography>
                  <Typography variant="h4">
                    {stats.alertCount}
                  </Typography>
                  <Box display="flex" gap={1} mt={1}>
                    <Chip 
                      label={`재고부족 ${stats.lowStockCount}`} 
                      size="small" 
                      color="warning" 
                    />
                    <Chip 
                      label={`품절 ${stats.outOfStockCount}`} 
                      size="small" 
                      color="error" 
                    />
                  </Box>
                </Box>
                <Warning sx={{ fontSize: 40, color: 'warning.main', opacity: 0.3 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        {/* 판매 추이 차트 */}
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              판매 추이
            </Typography>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={salesData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" />
                <YAxis />
                <Tooltip 
                  formatter={(value: any) => formatCurrency(value)}
                  labelFormatter={(label) => `시간: ${label}`}
                />
                <Area 
                  type="monotone" 
                  dataKey="sales" 
                  stroke="#8884d8" 
                  fill="#8884d8" 
                  fillOpacity={0.6}
                />
              </AreaChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        {/* 재고 현황 차트 */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              재고 현황
            </Typography>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={inventoryData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  fill="#8884d8"
                  paddingAngle={5}
                  dataKey="value"
                >
                  {inventoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: any) => formatNumber(value)} />
              </PieChart>
            </ResponsiveContainer>
            <Box sx={{ mt: 2 }}>
              {inventoryData.map((item, index) => (
                <Box key={item.name} display="flex" alignItems="center" mb={1}>
                  <Box
                    sx={{
                      width: 12,
                      height: 12,
                      bgcolor: COLORS[index % COLORS.length],
                      borderRadius: '50%',
                      mr: 1,
                    }}
                  />
                  <Typography variant="body2" sx={{ flex: 1 }}>
                    {item.name}
                  </Typography>
                  <Typography variant="body2" fontWeight="medium">
                    {formatNumber(item.value)}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Paper>
        </Grid>

        {/* 최근 활동 */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              실시간 활동
            </Typography>
            <List>
              {activities.map((activity) => (
                <ListItem key={activity.id}>
                  <ListItemIcon>
                    {getActivityIcon(activity.type, activity.status)}
                  </ListItemIcon>
                  <ListItemText
                    primary={activity.message}
                    secondary={
                      <Box display="flex" alignItems="center" gap={1}>
                        <Typography variant="caption" color="text.secondary">
                          {format(new Date(activity.timestamp), 'HH:mm:ss')}
                        </Typography>
                        {activity.details && (
                          <>
                            <Typography variant="caption" color="text.secondary">•</Typography>
                            <Typography variant="caption" color="text.secondary">
                              {activity.details}
                            </Typography>
                          </>
                        )}
                      </Box>
                    }
                  />
                </ListItem>
              ))}
            </List>
          </Paper>
        </Grid>
      </Grid>

      {/* 알림 */}
      {stats.alertCount > 0 && (
        <Alert 
          severity="warning" 
          sx={{ mt: 3 }}
          action={
            <Button color="inherit" size="small">
              확인
            </Button>
          }
        >
          주의가 필요한 항목이 {stats.alertCount}개 있습니다. 재고 부족 {stats.lowStockCount}개, 품절 {stats.outOfStockCount}개
        </Alert>
      )}
    </Box>
  );
};

export default Dashboard;