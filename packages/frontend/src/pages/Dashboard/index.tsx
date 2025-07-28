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
  Button,
  Alert,
  Chip,
} from '@mui/material';
import {
  TrendingUp as TrendingUpIcon,
  Inventory as InventoryIcon,
  AttachMoney as MoneyIcon,
  Sync as SyncIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { useAppDispatch, useAppSelector } from '@/hooks/redux';
import { fetchDashboardStats, fetchRecentActivity } from '@/store/slices/dashboardSlice';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

// Chart.js 등록
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

const Dashboard: React.FC = () => {
  const dispatch = useAppDispatch();
  const { stats, activities, loading, error } = useAppSelector(state => state.dashboard);

  useEffect(() => {
    // 대시보드 데이터 로드
    dispatch(fetchDashboardStats());
    dispatch(fetchRecentActivity(10));
  }, [dispatch]);

  const handleRefresh = () => {
    dispatch(fetchDashboardStats());
    dispatch(fetchRecentActivity(10));
  };

  if (loading && !stats) {
    return (
      <Box sx={{ width: '100%', mt: 4 }}>
        <LinearProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ mt: 2 }}>
        {error}
      </Alert>
    );
  }

  // 차트 데이터 (임시)
  const chartData = {
    labels: ['월', '화', '수', '목', '금', '토', '일'],
    datasets: [
      {
        label: '동기화 성공',
        data: [65, 59, 80, 81, 56, 55, 70],
        borderColor: 'rgb(75, 192, 192)',
        backgroundColor: 'rgba(75, 192, 192, 0.5)',
      },
      {
        label: '동기화 실패',
        data: [3, 2, 1, 0, 1, 0, 2],
        borderColor: 'rgb(255, 99, 132)',
        backgroundColor: 'rgba(255, 99, 132, 0.5)',
      },
    ],
  };

  return (
    <Box>
      {/* 헤더 */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4" component="h1" sx={{ fontWeight: 600 }}>
          대시보드
        </Typography>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={handleRefresh}
          disabled={loading}
        >
          새로고침
        </Button>
      </Box>

      {/* 통계 카드 */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <InventoryIcon sx={{ mr: 1, color: 'primary.main' }} />
                <Typography color="textSecondary" gutterBottom>
                  전체 상품
                </Typography>
              </Box>
              <Typography variant="h4" component="div">
                {stats?.totalProducts || 0}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
                <Typography variant="body2" color="success.main">
                  활성: {stats?.activeProducts || 0}
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <MoneyIcon sx={{ mr: 1, color: 'success.main' }} />
                <Typography color="textSecondary" gutterBottom>
                  오늘 판매
                </Typography>
              </Box>
              <Typography variant="h4" component="div">
                {stats?.totalSales || 0}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
                <TrendingUpIcon sx={{ fontSize: 16, mr: 0.5, color: 'success.main' }} />
                <Typography variant="body2" color="success.main">
                  +12.5%
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <SyncIcon sx={{ mr: 1, color: 'info.main' }} />
                <Typography color="textSecondary" gutterBottom>
                  동기화 상태
                </Typography>
              </Box>
              <Box sx={{ mt: 2 }}>
                <Chip
                  icon={<CheckCircleIcon />}
                  label={`성공: ${stats?.syncStatus?.synced || 0}`}
                  color="success"
                  size="small"
                  sx={{ mr: 1 }}
                />
                <Chip
                  icon={<WarningIcon />}
                  label={`대기: ${stats?.syncStatus?.pending || 0}`}
                  color="warning"
                  size="small"
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <WarningIcon sx={{ mr: 1, color: 'warning.main' }} />
                <Typography color="textSecondary" gutterBottom>
                  재고 경고
                </Typography>
              </Box>
              <Box sx={{ mt: 2 }}>
                <Typography variant="body2" color="warning.main">
                  부족: {stats?.inventoryStatus?.lowStock || 0}
                </Typography>
                <Typography variant="body2" color="error.main">
                  없음: {stats?.inventoryStatus?.outOfStock || 0}
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* 차트 및 활동 */}
      <Grid container spacing={3}>
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 3, height: 400 }}>
            <Typography variant="h6" gutterBottom>
              동기화 추이
            </Typography>
            <Box sx={{ height: 320 }}>
              <Line 
                data={chartData} 
                options={{ 
                  maintainAspectRatio: false,
                  responsive: true,
                }} 
              />
            </Box>
          </Paper>
        </Grid>

        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3, height: 400, overflow: 'auto' }}>
            <Typography variant="h6" gutterBottom>
              최근 활동
            </Typography>
            {activities && activities.length > 0 ? (
              activities.map((activity, index) => (
                <Box key={activity._id || index} sx={{ mb: 2 }}>
                  <Typography variant="body2" color="textSecondary">
                    {new Date(activity.createdAt).toLocaleString('ko-KR')}
                  </Typography>
                  <Typography variant="body2">
                    {activity.action}
                  </Typography>
                  <Typography variant="caption" color="textSecondary">
                    {activity.details}
                  </Typography>
                </Box>
              ))
            ) : (
              <Typography variant="body2" color="textSecondary">
                활동 내역이 없습니다.
              </Typography>
            )}
          </Paper>
        </Grid>

        {/* 시스템 상태 */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              시스템 상태
            </Typography>
            <Grid container spacing={2}>
              <Grid item>
                <Chip
                  icon={<CheckCircleIcon />}
                  label="API 서버"
                  color="success"
                  variant="outlined"
                />
              </Grid>
              <Grid item>
                <Chip
                  icon={<CheckCircleIcon />}
                  label="데이터베이스"
                  color="success"
                  variant="outlined"
                />
              </Grid>
              <Grid item>
                <Chip
                  icon={<WarningIcon />}
                  label="네이버 API"
                  color="warning"
                  variant="outlined"
                />
              </Grid>
              <Grid item>
                <Chip
                  icon={<CheckCircleIcon />}
                  label="Shopify API"
                  color="success"
                  variant="outlined"
                />
              </Grid>
            </Grid>
          </Paper>
        </Grid>
      </Grid>

      {/* 오류 메시지 */}
      {error && (
        <Grid item xs={12}>
          <Alert severity="error" sx={{ mt: 2 }}>
            <Typography variant="body2">
              {error}
            </Typography>
          </Alert>
        </Grid>
      )}
    </Box>
  );
};

export default Dashboard;