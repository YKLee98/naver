import React, { useMemo } from 'react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  Card,
  CardContent,
  CardHeader,
  Box,
  Typography,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import { formatDateTime, formatNumber } from '@/utils/formatters';
import { CHART_COLORS } from '@/utils/constants';

interface ChartData {
  timestamp: string;
  naverQuantity?: number;
  shopifyQuantity?: number;
  naverPrice?: number;
  shopifyPrice?: number;
  syncCount?: number;
}

interface RealtimeChartProps {
  data: ChartData[];
  type: 'inventory' | 'price' | 'sync';
  title: string;
  height?: number;
}

const RealtimeChart: React.FC<RealtimeChartProps> = ({
  data,
  type,
  title,
  height = 300,
}) => {
  const [chartType, setChartType] = React.useState<'line' | 'area'>('line');

  const handleChartTypeChange = (
    event: React.MouseEvent<HTMLElement>,
    newType: 'line' | 'area' | null
  ) => {
    if (newType !== null) {
      setChartType(newType);
    }
  };

  const formatTooltipValue = (value: number, name: string) => {
    if (type === 'price') {
      return [`₩${formatNumber(value)}`, name];
    }
    return [formatNumber(value), name];
  };

  const chartData = useMemo(() => {
    return data.map(item => ({
      ...item,
      time: formatDateTime(item.timestamp),
    }));
  }, [data]);

  const renderChart = () => {
    const ChartComponent = chartType === 'area' ? AreaChart : LineChart;
    const DataComponent = chartType === 'area' ? Area : Line;

    return (
      <ResponsiveContainer width="100%" height={height}>
        <ChartComponent data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="time"
            tick={{ fontSize: 12 }}
            angle={-45}
            textAnchor="end"
            height={60}
          />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip
            formatter={formatTooltipValue}
            labelFormatter={(label) => `시간: ${label}`}
          />
          <Legend />
          
          {type === 'inventory' && (
            <>
              <DataComponent
                type="monotone"
                dataKey="naverQuantity"
                stroke={CHART_COLORS.primary}
                fill={CHART_COLORS.primary}
                name="네이버 재고"
                strokeWidth={2}
              />
              <DataComponent
                type="monotone"
                dataKey="shopifyQuantity"
                stroke={CHART_COLORS.secondary}
                fill={CHART_COLORS.secondary}
                name="Shopify 재고"
                strokeWidth={2}
              />
            </>
          )}
          
          {type === 'price' && (
            <>
              <DataComponent
                type="monotone"
                dataKey="naverPrice"
                stroke={CHART_COLORS.primary}
                fill={CHART_COLORS.primary}
                name="네이버 가격"
                strokeWidth={2}
              />
              <DataComponent
                type="monotone"
                dataKey="shopifyPrice"
                stroke={CHART_COLORS.secondary}
                fill={CHART_COLORS.secondary}
                name="Shopify 가격"
                strokeWidth={2}
              />
            </>
          )}
          
          {type === 'sync' && (
            <DataComponent
              type="monotone"
              dataKey="syncCount"
              stroke={CHART_COLORS.success}
              fill={CHART_COLORS.success}
              name="동기화 횟수"
              strokeWidth={2}
            />
          )}
        </ChartComponent>
      </ResponsiveContainer>
    );
  };

  return (
    <Card>
      <CardHeader
        title={title}
        action={
          <ToggleButtonGroup
            value={chartType}
            exclusive
            onChange={handleChartTypeChange}
            size="small"
          >
            <ToggleButton value="line">라인</ToggleButton>
            <ToggleButton value="area">영역</ToggleButton>
          </ToggleButtonGroup>
        }
      />
      <CardContent>
        {data.length === 0 ? (
          <Box
            sx={{
              height,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Typography color="text.secondary">
              표시할 데이터가 없습니다.
            </Typography>
          </Box>
        ) : (
          renderChart()
        )}
      </CardContent>
    </Card>
  );
};

export default RealtimeChart
