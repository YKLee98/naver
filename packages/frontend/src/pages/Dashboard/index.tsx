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

  // 디버깅을 위한 로그
  console.log('Dashboard component mounted');
  console.log('Redux state:', { stats, activities, loading, error });

  useEffect(() => {
    console.log('Dashboard useEffect running');
    // 대시보드 데이터 로드
    dispatch(fetchDashboardStats())
      .then((result) => {
        console.log('fetchDashboardStats result:', result);
      })
      .catch((err) => {
        console.error('fetchDashboardStats error:', err);
      });
      
    dispatch(fetchRecentActivity(10))
      .then((result) => {
        console.log('fetchRecentActivity result:', result);
      })
      .catch((err) => {
        console.error('fetchRecentActivity error:', err);
      });
  }, [dispatch]);

  const handleRefresh = () => {
    console.log('Refresh clicked');
    dispatch(fetchDashboardStats());
    dispatch(fetchRecentActivity(10));
  };

  if (loading && !stats) {
    console.log('Loading state');
    return (
      <Box sx={{ width: '100%', mt: 4 }}>
        <LinearProgress />
      </Box>
    );
  }

  if (error) {
    console.log('Error state:', error);
    return (
      <Alert severity="error" sx={{ mt: 2 }}>
        {error}
      </Alert>
    );
  }

  // stats가 없으면 임시 메시지 표시
  if (!stats) {
    console.log('No stats available');
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="h4" gutterBottom>
          대시보드
        </Typography>
        <Alert severity="info">
          데이터를 불러오는 중입니다...
        </Alert>
        <Button onClick={handleRefresh} sx={{ mt: 2 }}>
          새로고침
        </Button>
      </Box>
    );
  }

  // 차트 데이터 (임시)
  const chartData = {
    labels: ['월', '화', '수', '목', '금', '토', '일'],
    datasets: [
      {
        label: '주문 수',
        data: [12, 19, 3, 5, 2, 3, 7],
        borderColor: 'rgb(75, 192, 192)',
        backgroundColor: 'rgba(75, 192, 192, 0.2)',
      },
    ],
  };

  console.log('Rendering dashboard with stats:', stats);

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        대시보드
      </Typography>
      
      <Button
        variant="contained"
        startIcon={<RefreshIcon />}
        onClick={handleRefresh}
        sx={{ mb: 3 }}
      >
        새로고침
      </Button>

      {/* 통계 카드 */}
      <Grid container spacing={3}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                전체 상품
              </Typography>
              <Typography variant="h5">
                {stats.totalProducts || 0}
              </Typography>
              <Typography variant="body2" color="textSecondary">
                활성: {stats.activeProducts || 0}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        
        {/* 추가 카드들... */}
      </Grid>

      {/* 차트 */}
      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="h6" gutterBottom>
          주간 주문 추이
        </Typography>
        <Box sx={{ height: 300 }}>
          <Line data={chartData} options={{ responsive: true, maintainAspectRatio: false }} />
        </Box>
      </Paper>

      {/* 최근 활동 */}
      {activities && activities.length > 0 && (
        <Paper sx={{ p: 3, mt: 3 }}>
          <Typography variant="h6" gutterBottom>
            최근 활동
          </Typography>
          {activities.map((activity) => (
            <Box key={activity._id || activity.id} sx={{ py: 1 }}>
              <Typography>{activity.action}</Typography>
              <Typography variant="caption" color="textSecondary">
                {activity.details}
              </Typography>
            </Box>
          ))}
        </Paper>
      )}
    </Box>
  );
};

export default Dashboard;