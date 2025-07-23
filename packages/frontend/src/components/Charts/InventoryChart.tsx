// packages/frontend/src/components/Charts/InventoryChart.tsx
import React, { useEffect, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { Box, Typography, CircularProgress, Alert } from '@mui/material';
import { useAppDispatch, useAppSelector } from '@/hooks';
import { fetchInventoryChartData } from '@/store/slices/dashboardSlice';
import { CHART_COLORS } from '@/utils/constants';

interface ChartData {
  category: string;
  naver: number;
  shopify: number;
  difference: number;
}

const InventoryChart: React.FC = () => {
  const dispatch = useAppDispatch();
  const { inventoryChartData, loading, error } = useAppSelector((state) => state.dashboard);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  useEffect(() => {
    dispatch(fetchInventoryChartData());
  }, [dispatch]);

  const handleMouseEnter = (_: any, index: number) => {
    setActiveIndex(index);
  };

  const handleMouseLeave = () => {
    setActiveIndex(null);
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error">
        차트 데이터를 불러오는 중 오류가 발생했습니다.
      </Alert>
    );
  }

  if (!inventoryChartData || inventoryChartData.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <Typography color="textSecondary">
          표시할 데이터가 없습니다
        </Typography>
      </Box>
    );
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <Box
          sx={{
            backgroundColor: 'background.paper',
            p: 2,
            border: 1,
            borderColor: 'divider',
            borderRadius: 1,
            boxShadow: 2,
          }}
        >
          <Typography variant="subtitle2" gutterBottom>
            {label}
          </Typography>
          {payload.map((entry: any, index: number) => (
            <Typography
              key={index}
              variant="body2"
              sx={{ color: entry.color }}
            >
              {entry.name}: {entry.value.toLocaleString()}
            </Typography>
          ))}
          <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
            차이: {Math.abs(payload[0].value - payload[1].value).toLocaleString()}
          </Typography>
        </Box>
      );
    }
    return null;
  };

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={inventoryChartData}
        margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis
          dataKey="category"
          tick={{ fontSize: 12 }}
          angle={-45}
          textAnchor="end"
          height={80}
        />
        <YAxis
          tick={{ fontSize: 12 }}
          tickFormatter={(value) => value.toLocaleString()}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          wrapperStyle={{ paddingTop: '20px' }}
          iconType="circle"
        />
        <Bar
          dataKey="naver"
          name="네이버"
          fill={CHART_COLORS.primary}
          radius={[4, 4, 0, 0]}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {inventoryChartData.map((entry: ChartData, index: number) => (
            <Cell
              key={`cell-naver-${index}`}
              fill={activeIndex === index ? CHART_COLORS.secondary : CHART_COLORS.primary}
            />
          ))}
        </Bar>
        <Bar
          dataKey="shopify"
          name="Shopify"
          fill={CHART_COLORS.info}
          radius={[4, 4, 0, 0]}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {inventoryChartData.map((entry: ChartData, index: number) => (
            <Cell
              key={`cell-shopify-${index}`}
              fill={activeIndex === index ? CHART_COLORS.warning : CHART_COLORS.info}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
};

export default InventoryChart;