import React, { useEffect } from 'react';
import {
  Grid,
  Container,
  Typography,
  Box,
  Paper,
} from '@mui/material';
import DashboardStats from '@/components/dashboard/DashboardStats';
import RealtimeChart from '@/components/dashboard/RealtimeChart';
import SyncStatus from '@/components/dashboard/SyncStatus';
import { useGetDashboardStatsQuery, useGetSyncStatusQuery } from '@/store/api/apiSlice';

const Dashboard: React.FC = () => {
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useGetDashboardStatsQuery();
  const { data: syncStatus, isLoading: syncLoading, refetch: refetchSync } = useGetSyncStatusQuery();

  useEffect(() => {
    // 대시보드 데이터 주기적 갱신 (30초마다)
    const interval = setInterval(() => {
      refetchStats();
      refetchSync();
    }, 30000);

    return () => clearInterval(interval);
  }, [refetchStats, refetchSync]);

  return (
    <Container maxWidth="xl">
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          대시보드
        </Typography>
        <Typography variant="body1" color="text.secondary">
          실시간 동기화 현황 및 시스템 상태를 확인하세요.
        </Typography>
      </Box>

      <Grid container spacing={3}>
        {/* 통계 카드 */}
        <Grid item xs={12}>
          <DashboardStats stats={stats} loading={statsLoading} />
        </Grid>

        {/* 동기화 상태 */}
        <Grid item xs={12} md={4}>
          <SyncStatus status={syncStatus} loading={syncLoading} />
        </Grid>

        {/* 실시간 차트 */}
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" gutterBottom>
              실시간 동기화 활동
            </Typography>
            <RealtimeChart />
          </Paper>
        </Grid>

        {/* 최근 활동 */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              최근 동기화 이력
            </Typography>
            {/* RecentActivities 컴포넌트 추가 예정 */}
          </Paper>
        </Grid>
      </Grid>
    </Container>
  );
};

export default Dashboard;
