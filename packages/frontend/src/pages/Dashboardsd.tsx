// packages/frontend/src/pages/Dashboard.tsx
import React, { useEffect } from 'react';
import {
  Grid,
  Card,
  CardContent,
  Typography,
  Box,
  LinearProgress,
  Paper,
  IconButton,
  Tooltip,
  Skeleton,
} from '@mui/material';
import {
  Inventory as InventoryIcon,
  Sync as SyncIcon,
  Error as ErrorIcon,
  ShoppingCart as OrderIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Refresh as RefreshIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import { useGetDashboardStatsQuery } from '@store/api/apiSlice';
import { formatNumber, formatCurrency, formatDateTime } from '@utils/formatters';
import { Line, Doughnut, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip as ChartTooltip,
  Legend,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  ChartTooltip,
  Legend
);

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  trend?: number;
  subValue?: string;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, icon, color, trend, subValue }) => {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            <Typography color="textSecondary" gutterBottom variant="body2">
              {title}
            </Typography>
            <Typography variant="h4" component="div">
              {value}
            </Typography>
            {subValue && (
              <Typography variant="body2" color="textSecondary">
                {subValue}
              </Typography>
            )}
            {trend !== undefined && (
              <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
                {trend > 0 ? (
                  <TrendingUpIcon color="success" fontSize="small" />
                ) : (
                  <TrendingDownIcon color="error" fontSize="small" />
                )}
                <Typography
                  variant="body2"
                  color={trend > 0 ? 'success.main' : 'error.main'}
                  sx={{ ml: 0.5 }}
                >
                  {Math.abs(trend)}%
                </Typography>
              </Box>
            )}
          </Box>
          <Box
            sx={{
              backgroundColor: `${color}.light`,
              borderRadius: '50%',
              p: 2,
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
  );
};

const Dashboard: React.FC = () => {
  const { data: stats, isLoading, refetch } = useGetDashboardStatsQuery(undefined, {
    pollingInterval: 30000, // 30초마다 자동 새로고침
  });

  const handleRefresh = () => {
    refetch();
  };

  if (isLoading) {
    return (
      <Box>
        <Grid container spacing={3}>
          {[1, 2, 3, 4].map((i) => (
            <Grid item xs={12} sm={6} md={3} key={i}>
              <Skeleton variant="rectangular" height={140} />
            </Grid>
          ))}
        </Grid>
      </Box>
    );
  }

  const salesChartData = {
    labels: ['1월', '2월', '3월', '4월', '5월', '6월'],
    datasets: [
      {
        label: '네이버',
        data: [65, 59, 80, 81, 56, 55],
        borderColor: '#00C73C',
        backgroundColor: 'rgba(0, 199, 60, 0.1)',
      },
      {
        label: 'Shopify',
        data: [28, 48, 40, 19, 86, 27],
        borderColor: '#96BF48',
        backgroundColor: 'rgba(150, 191, 72, 0.1)',
      },
    ],
  };

  const inventoryChartData = {
    labels: ['정상', '부족', '품절', '초과'],
    datasets: [
      {
        data: [
          stats?.syncedProducts || 0,
          stats?.lowStockItems || 0,
          stats?.outOfStockItems || 0,
          stats?.pendingProducts || 0,
        ],
        backgroundColor: ['#4caf50', '#ff9800', '#f44336', '#2196f3'],
      },
    ],
  };

  const syncProgressData = {
    labels: ['완료', '진행중', '실패'],
    datasets: [
      {
        data: [
          stats?.syncedProducts || 0,
          stats?.pendingProducts || 0,
          stats?.errorProducts || 0,
        ],
        backgroundColor: ['#4caf50', '#2196f3', '#f44336'],
      },
    ],
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1">
          대시보드
        </Typography>
        <Tooltip title="새로고침">
          <IconButton onClick={handleRefresh}>
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {/* 통계 카드 */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="전체 상품"
            value={formatNumber(stats?.totalProducts || 0)}
            icon={<InventoryIcon />}
            color="primary"
            subValue={`동기화: ${stats?.syncedProducts || 0}`}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="오늘 주문"
            value={formatNumber(stats?.todayOrders || 0)}
            icon={<OrderIcon />}
            color="success"
            trend={12}
            subValue={`전체: ${stats?.totalOrders || 0}`}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="오늘 매출"
            value={formatCurrency(stats?.todayRevenue || 0)}
            icon={<TrendingUpIcon />}
            color="info"
            trend={8}
            subValue={`전체: ${formatCurrency(stats?.totalRevenue || 0)}`}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="재고 경고"
            value={stats?.lowStockItems || 0}
            icon={<WarningIcon />}
            color="warning"
            subValue={`품절: ${stats?.outOfStockItems || 0}`}
          />
        </Grid>
      </Grid>

      {/* 동기화 진행 상황 */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          동기화 진행 상황
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Box sx={{ width: '100%', mr: 1 }}>
            <LinearProgress 
              variant="determinate" 
              value={stats?.syncProgress || 0}
              sx={{ height: 10, borderRadius: 5 }}
            />
          </Box>
          <Box sx={{ minWidth: 35 }}>
            <Typography variant="body2" color="text.secondary">
              {`${Math.round(stats?.syncProgress || 0)}%`}
            </Typography>
          </Box>
        </Box>
        <Typography variant="body2" color="text.secondary">
          마지막 동기화: {stats?.lastSyncTime ? formatDateTime(stats.lastSyncTime) : '없음'}
        </Typography>
      </Paper>

      {/* 차트 영역 */}
      <Grid container spacing={3}>
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              월별 매출 추이
            </Typography>
            <Box sx={{ height: 300 }}>
              <Line
                data={salesChartData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: {
                      position: 'top' as const,
                    },
                  },
                }}
              />
            </Box>
          </Paper>
        </Grid>
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              재고 현황
            </Typography>
            <Box sx={{ height: 300 }}>
              <Doughnut
                data={inventoryChartData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: {
                      position: 'bottom' as const,
                    },
                  },
                }}
              />
            </Box>
          </Paper>
        </Grid>
      </Grid>

      {/* 최근 활동 */}
      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="h6" gutterBottom>
          최근 활동
        </Typography>
        <Box sx={{ mt: 2 }}>
          {stats?.recentActivities?.map((activity: any) => (
            <Box
              key={activity.id}
              sx={{
                display: 'flex',
                alignItems: 'center',
                py: 1,
                borderBottom: '1px solid #e0e0e0',
                '&:last-child': {
                  borderBottom: 'none',
                },
              }}
            >
              <Box sx={{ mr: 2 }}>
                {activity.type === 'sync' && <SyncIcon color="primary" />}
                {activity.type === 'error' && <ErrorIcon color="error" />}
                {activity.type === 'order' && <OrderIcon color="success" />}
              </Box>
              <Box sx={{ flexGrow: 1 }}>
                <Typography variant="body1">{activity.message}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {formatDateTime(activity.timestamp)}
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>
      </Paper>
    </Box>
  );
};

export default Dashboard;

