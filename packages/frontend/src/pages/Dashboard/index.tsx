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

interface InventoryChartItem {
  name: string;
  value: number;
}

interface InventoryChartResponse {
  byStatus: Array<{ _id: string; count: number }>;
  byRange: Array<{ _id: string; count: number }>;
  byPlatform: Array<{ 
    _id: string; 
    averageQuantity: number;
    totalQuantity: number;
    count: number; 
  }>;
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
  const [inventoryData, setInventoryData] = useState<InventoryChartItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // 재고 상태 이름 변환
  const getStatusName = (status: string): string => {
    switch (status) {
      case 'inStock':
        return '정상재고';
      case 'lowStock':
        return '재고부족';
      case 'outOfStock':
        return '품절';
      default:
        return status;
    }
  };

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
      setActivities(activitiesRes.data.data.activities || []);
      setSalesData(salesRes.data.data || []);
      
      // 재고 차트 데이터 변환
      const inventoryResponse = inventoryRes.data.data as InventoryChartResponse;
      if (inventoryResponse && inventoryResponse.byStatus) {
        const transformedData: InventoryChartItem[] = inventoryResponse.byStatus.map((item) => ({
          name: getStatusName(item._id),
          value: item.count || 0,
        }));
        setInventoryData(transformedData);
      } else {
        // 기본값 설정
        setInventoryData([
          { name: '정상재고', value: 0 },
          { name: '재고부족', value: 0 },
          { name: '품절', value: 0 },
        ]);
      }
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
      // 오류 발생 시 기본값 설정
      setInventoryData([
        { name: '정상재고', value: 0 },
        { name: '재고부족', value: 0 },
        { name: '품절', value: 0 },
      ]);
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
        return <SyncIcon color="info" />;
      case 'price':
        return <AttachMoney color="success" />;
      case 'alert':
        return <Warning color="warning" />;
      default:
        return <CheckCircle color="action" />;
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ flexGrow: 1, p: 3 }}>
      {/* 상단 통계 카드 */}
      <Grid container spacing={3} mb={3}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="textSecondary" gutterBottom variant="body2">
                    전체 재고
                  </Typography>
                  <Typography variant="h5" component="div">
                    {formatNumber(stats.totalInventory)}
                  </Typography>
                </Box>
                <Inventory2 sx={{ fontSize: 40, color: 'primary.main', opacity: 0.7 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="textSecondary" gutterBottom variant="body2">
                    오늘 판매
                  </Typography>
                  <Typography variant="h5" component="div">
                    {formatNumber(stats.todaySales)}
                  </Typography>
                </Box>
                <AttachMoney sx={{ fontSize: 40, color: 'success.main', opacity: 0.7 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="textSecondary" gutterBottom variant="body2">
                    동기화 상태
                  </Typography>
                  <Chip 
                    label={stats.syncStatus === 'normal' ? '정상' : stats.syncStatus === 'warning' ? '주의' : '오류'}
                    color={stats.syncStatus === 'normal' ? 'success' : stats.syncStatus === 'warning' ? 'warning' : 'error'}
                    size="small"
                  />
                </Box>
                <SyncIcon sx={{ fontSize: 40, color: 'info.main', opacity: 0.7 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="textSecondary" gutterBottom variant="body2">
                    알림
                  </Typography>
                  <Typography variant="h5" component="div">
                    {stats.alertCount}
                  </Typography>
                </Box>
                <Warning sx={{ fontSize: 40, color: 'warning.main', opacity: 0.7 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* 차트 및 활동 섹션 */}
      <Grid container spacing={3}>
        {/* 최근 활동 */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 2, height: '100%' }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography variant="h6">최근 활동</Typography>
              <IconButton size="small" onClick={handleRefresh} disabled={refreshing}>
                <Refresh />
              </IconButton>
            </Box>
            
            <List sx={{ maxHeight: 400, overflow: 'auto' }}>
              {activities.map((activity) => (
                <ListItem key={activity.id} alignItems="flex-start">
                  <ListItemIcon>
                    {getActivityIcon(activity.type, activity.status)}
                  </ListItemIcon>
                  <ListItemText
                    primary={activity.message}
                    secondary={
                      <>
                        {format(new Date(activity.timestamp), 'MM-dd HH:mm', { locale: ko })}
                        {activity.details && ` • ${activity.details}`}
                      </>
                    }
                  />
                </ListItem>
              ))}
              
              {activities.length === 0 && (
                <ListItem>
                  <ListItemText
                    primary="활동 내역이 없습니다"
                    secondary="시스템 활동이 여기에 표시됩니다"
                  />
                </ListItem>
              )}
            </List>
          </Paper>
        </Grid>

        {/* 판매 추이 차트 */}
        <Grid item xs={12} md={4}>
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
                  <Typography variant="body2" color="text.secondary">
                    {formatNumber(item.value)}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Paper>
        </Grid>
      </Grid>

      {/* 추가 정보 카드 */}
      <Grid container spacing={3} mt={2}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              재고 상태 요약
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={4}>
                <Box textAlign="center">
                  <Typography variant="h4" color="error.main">
                    {stats.outOfStockCount}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    품절
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={4}>
                <Box textAlign="center">
                  <Typography variant="h4" color="warning.main">
                    {stats.lowStockCount}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    재고 부족
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={4}>
                <Box textAlign="center">
                  <Typography variant="h4" color="success.main">
                    {stats.syncSuccessRate}%
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    동기화 성공률
                  </Typography>
                </Box>
              </Grid>
            </Grid>
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              재고 가치
            </Typography>
            <Box display="flex" alignItems="baseline">
              <Typography variant="h4" component="span">
                {formatCurrency(stats.inventoryValue)}
              </Typography>
              <Typography variant="body2" color="text.secondary" ml={2}>
                총 재고 가치
              </Typography>
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Dashboard;