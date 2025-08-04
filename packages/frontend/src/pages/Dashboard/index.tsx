// packages/frontend/src/pages/Dashboard/index.tsx
import React, { useEffect } from 'react';
import {
  Box,
  Grid,
  Paper,
  Typography,
  Card,
  CardContent,
  LinearProgress,
  Chip,
  Stack,
  Alert,
  CircularProgress,
} from '@mui/material';
import {
  TrendingUp,
  TrendingDown,
  Inventory2,
  AttachMoney,
  Link as LinkIcon,
  Warning,
  CheckCircle,
  Error,
} from '@mui/icons-material';
import { useAppDispatch, useAppSelector } from '@/hooks/redux';
import { fetchDashboardStats, fetchRecentActivity } from '@/store/slices/dashboardSlice';
import { formatNumber, formatCurrency, formatDateTime } from '@/utils/formatters';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  color?: 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info';
}

const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  trend,
  color = 'primary',
}) => (
  <Card sx={{ height: '100%' }}>
    <CardContent>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <Box
          sx={{
            p: 1,
            borderRadius: 2,
            backgroundColor: `${color}.light`,
            color: `${color}.main`,
            mr: 2,
          }}
        >
          {icon}
        </Box>
        <Typography variant="h6" color="text.secondary">
          {title}
        </Typography>
      </Box>
      
      <Typography variant="h4" sx={{ mb: 1 }}>
        {value}
      </Typography>
      
      {subtitle && (
        <Typography variant="body2" color="text.secondary">
          {subtitle}
        </Typography>
      )}
      
      {trend && (
        <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
          {trend.isPositive ? (
            <TrendingUp color="success" fontSize="small" />
          ) : (
            <TrendingDown color="error" fontSize="small" />
          )}
          <Typography
            variant="caption"
            color={trend.isPositive ? 'success.main' : 'error.main'}
            sx={{ ml: 0.5 }}
          >
            {trend.isPositive ? '+' : ''}{trend.value}%
          </Typography>
        </Box>
      )}
    </CardContent>
  </Card>
);

const Dashboard: React.FC = () => {
  const dispatch = useAppDispatch();
  const { stats, activities, loading, error } = useAppSelector((state) => state.dashboard);

  useEffect(() => {
    dispatch(fetchDashboardStats());
    dispatch(fetchRecentActivity());
  }, [dispatch]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">데이터를 불러오는 중 오류가 발생했습니다: {error}</Alert>
      </Box>
    );
  }

  // 동기화 상태 색상 결정
  const getSyncStatusColor = (status: string) => {
    switch (status) {
      case 'synced': return 'success';
      case 'pending': return 'warning';
      case 'error': return 'error';
      default: return 'default';
    }
  };

  // 활동 아이콘 결정
  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'sync': return <CheckCircle color="success" />;
      case 'error': return <Error color="error" />;
      case 'warning': return <Warning color="warning" />;
      case 'price': return <AttachMoney color="info" />;
      default: return <CheckCircle />;
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ mb: 3 }}>
        대시보드
      </Typography>

      {/* 통계 카드 */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="전체 상품"
            value={formatNumber(stats?.totalProducts || 0)}
            subtitle={`활성: ${stats?.activeProducts || 0}`}
            icon={<Inventory2 />}
            trend={{ value: 5.2, isPositive: true }}
            color="primary"
          />
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="매핑된 상품"
            value={formatNumber(stats?.mappings?.total || 0)}
            subtitle={`활성: ${stats?.mappings?.active || 0}`}
            icon={<LinkIcon />}
            trend={{ value: 2.8, isPositive: true }}
            color="success"
          />
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="오늘 주문"
            value={formatNumber(stats?.orders?.today || 0)}
            subtitle={`이번 주: ${stats?.orders?.week || 0}`}
            icon={<AttachMoney />}
            trend={{ value: 12.5, isPositive: true }}
            color="info"
          />
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="동기화 오류"
            value={formatNumber(stats?.syncStatus?.error || 0)}
            subtitle={`대기중: ${stats?.syncStatus?.pending || 0}`}
            icon={<Warning />}
            color="warning"
          />
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        {/* 동기화 상태 */}
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" sx={{ mb: 3 }}>
              동기화 상태
            </Typography>
            
            <Grid container spacing={2}>
              <Grid item xs={4}>
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="h3" color="success.main">
                    {stats?.syncStatus?.synced || 0}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    동기화 완료
                  </Typography>
                </Box>
              </Grid>
              
              <Grid item xs={4}>
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="h3" color="warning.main">
                    {stats?.syncStatus?.pending || 0}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    대기중
                  </Typography>
                </Box>
              </Grid>
              
              <Grid item xs={4}>
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="h3" color="error.main">
                    {stats?.syncStatus?.error || 0}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    오류
                  </Typography>
                </Box>
              </Grid>
            </Grid>
            
            <Box sx={{ mt: 3 }}>
              <LinearProgress
                variant="determinate"
                value={(stats?.syncStatus?.synced || 0) / ((stats?.totalProducts || 1)) * 100}
                sx={{ height: 10, borderRadius: 5 }}
              />
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
                전체 동기화율: {((stats?.syncStatus?.synced || 0) / (stats?.totalProducts || 1) * 100).toFixed(1)}%
              </Typography>
            </Box>
          </Paper>
        </Grid>

        {/* 재고 현황 */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" sx={{ mb: 3 }}>
              재고 현황
            </Typography>
            
            <Stack spacing={2}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="body2">정상 재고</Typography>
                <Chip 
                  label={stats?.inventoryStatus?.inStock || 0} 
                  color="success" 
                  size="small" 
                />
              </Box>
              
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="body2">재고 부족</Typography>
                <Chip 
                  label={stats?.inventoryStatus?.lowStock || 0} 
                  color="warning" 
                  size="small" 
                />
              </Box>
              
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="body2">품절</Typography>
                <Chip 
                  label={stats?.inventoryStatus?.outOfStock || 0} 
                  color="error" 
                  size="small" 
                />
              </Box>
            </Stack>
          </Paper>
        </Grid>

        {/* 최근 활동 */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ mb: 3 }}>
              최근 활동
            </Typography>
            
            <Stack spacing={2}>
              {activities.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  최근 활동이 없습니다.
                </Typography>
              ) : (
                activities.slice(0, 5).map((activity, index) => (
                  <Box
                    key={activity.id || index}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      p: 2,
                      borderRadius: 1,
                      backgroundColor: 'background.default',
                      '&:hover': {
                        backgroundColor: 'action.hover',
                      },
                    }}
                  >
                    <Box sx={{ mr: 2 }}>
                      {getActivityIcon(activity.type)}
                    </Box>
                    
                    <Box sx={{ flexGrow: 1 }}>
                      <Typography variant="body2">
                        {activity.action}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {activity.details}
                      </Typography>
                    </Box>
                    
                    <Typography variant="caption" color="text.secondary">
                      {formatDateTime(activity.timestamp || activity.createdAt)}
                    </Typography>
                  </Box>
                ))
              )}
            </Stack>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Dashboard;