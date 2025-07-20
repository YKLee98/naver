import React from 'react';
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  CircularProgress,
} from '@mui/material';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { PriceHistory as PriceHistoryType } from '@/types';
import { formatCurrency, formatDateTime, formatPercent } from '@/utils/formatters';
import { CHART_COLORS } from '@/utils/constants';

interface PriceHistoryProps {
  history: PriceHistoryType[];
  loading?: boolean;
}

const PriceHistory: React.FC<PriceHistoryProps> = ({ history, loading }) => {
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!history || history.length === 0) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Typography color="text.secondary">가격 변경 이력이 없습니다.</Typography>
      </Box>
    );
  }

  const chartData = history.map(item => ({
    date: new Date(item.createdAt).toLocaleDateString(),
    naverPrice: item.naverPrice,
    shopifyPrice: item.finalShopifyPrice,
    exchangeRate: item.exchangeRate,
    margin: item.priceMargin * 100,
  }));

  return (
    <Box>
      <Box sx={{ mb: 4, height: 300 }}>
        <Typography variant="h6" gutterBottom>
          가격 추이
        </Typography>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis yAxisId="left" />
            <YAxis yAxisId="right" orientation="right" />
            <Tooltip />
            <Legend />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="naverPrice"
              stroke={CHART_COLORS.primary}
              name="네이버 가격 (₩)"
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="shopifyPrice"
              stroke={CHART_COLORS.secondary}
              name="Shopify 가격 ($)"
            />
          </LineChart>
        </ResponsiveContainer>
      </Box>

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>변경일시</TableCell>
              <TableCell align="right">네이버 가격</TableCell>
              <TableCell align="right">환율</TableCell>
              <TableCell align="right">마진율</TableCell>
              <TableCell align="right">Shopify 가격</TableCell>
              <TableCell align="center">상태</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {history.map((item) => (
              <TableRow key={item._id}>
                <TableCell>{formatDateTime(item.createdAt)}</TableCell>
                <TableCell align="right">
                  {formatCurrency(item.naverPrice, 'KRW')}
                </TableCell>
                <TableCell align="right">
                  ₩{item.exchangeRate}
                </TableCell>
                <TableCell align="right">
                  {formatPercent(item.priceMargin * 100)}
                </TableCell>
                <TableCell align="right">
                  ${item.finalShopifyPrice.toFixed(2)}
                </TableCell>
                <TableCell align="center">
                  <Chip
                    label={item.syncStatus}
                    color={item.syncStatus === 'completed' ? 'success' : 'error'}
                    size="small"
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};

export default PriceHistory;
