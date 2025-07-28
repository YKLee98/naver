// packages/frontend/src/pages/Pricing/index.tsx
import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Grid,
  Card,
  CardContent,
  Button,
  TextField,
  InputAdornment,
  Stack,
  Divider,
  Alert,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import {
  TrendingUp as TrendingUpIcon,
  AttachMoney as MoneyIcon,
  CurrencyExchange as ExchangeIcon,
  Update as UpdateIcon,
  Settings as SettingsIcon,
} from '@mui/icons-material';
import { DataGrid, GridColDef } from '@mui/x-data-grid';

const Pricing: React.FC = () => {
  const [exchangeRate, setExchangeRate] = useState(1305.50);
  const [marginPercent, setMarginPercent] = useState(10);
  const [priceHistory, setPriceHistory] = useState([]);
  const [loading, setLoading] = useState(false);

  const columns: GridColDef[] = [
    { field: 'sku', headerName: 'SKU', width: 130 },
    { field: 'productName', headerName: '상품명', width: 200, flex: 1 },
    { 
      field: 'naverPrice', 
      headerName: '네이버 가격 (KRW)', 
      width: 150,
      valueFormatter: (params) => `₩${params.value?.toLocaleString('ko-KR')}`,
    },
    { 
      field: 'shopifyPrice', 
      headerName: 'Shopify 가격 (USD)', 
      width: 150,
      valueFormatter: (params) => `$${params.value?.toFixed(2)}`,
    },
    {
      field: 'margin',
      headerName: '마진율',
      width: 100,
      renderCell: (params) => (
        <Chip 
          label={`${params.value}%`} 
          size="small" 
          color={params.value >= 10 ? 'success' : 'warning'}
        />
      ),
    },
    {
      field: 'lastUpdated',
      headerName: '마지막 업데이트',
      width: 180,
      valueGetter: (params) => {
        return params.value ? new Date(params.value).toLocaleString('ko-KR') : '-';
      },
    },
  ];

  useEffect(() => {
    loadPriceData();
  }, []);

  const loadPriceData = async () => {
    setLoading(true);
    try {
      // API 호출
      // const response = await priceApi.getPriceHistory();
      // setPriceHistory(response.data);
      
      // 임시 데이터
      setPriceHistory([
        {
          id: '1',
          sku: 'TEST-001',
          productName: '테스트 상품 1',
          naverPrice: 45000,
          shopifyPrice: 38.08,
          margin: 10,
          lastUpdated: new Date().toISOString(),
        },
      ]);
    } catch (error) {
      console.error('Failed to load price data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExchangeRateUpdate = () => {
    // 환율 업데이트 로직
    console.log('Update exchange rate:', exchangeRate);
  };

  const handleBulkPriceUpdate = () => {
    // 일괄 가격 업데이트
    console.log('Bulk price update with margin:', marginPercent);
  };

  return (
    <Box>
      <Typography variant="h4" component="h1" sx={{ mb: 3, fontWeight: 600 }}>
        가격 관리
      </Typography>

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <ExchangeIcon sx={{ mr: 1, color: 'primary.main' }} />
                <Typography variant="h6">현재 환율</Typography>
              </Box>
              <Typography variant="h3" sx={{ mb: 1 }}>
                ₩{exchangeRate.toLocaleString('ko-KR')}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                1 USD = {exchangeRate} KRW
              </Typography>
              <Typography variant="caption" display="block" sx={{ mt: 1 }}>
                마지막 업데이트: {new Date().toLocaleString('ko-KR')}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <MoneyIcon sx={{ mr: 1, color: 'success.main' }} />
                <Typography variant="h6">평균 마진율</Typography>
              </Box>
              <Typography variant="h3" sx={{ mb: 1 }}>
                {marginPercent}%
              </Typography>
              <Typography variant="body2" color="text.secondary">
                전체 상품 평균
              </Typography>
              <Chip 
                label="정상" 
                color="success" 
                size="small" 
                sx={{ mt: 1 }}
              />
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <TrendingUpIcon sx={{ mr: 1, color: 'info.main' }} />
                <Typography variant="h6">가격 변동</Typography>
              </Box>
              <Typography variant="h3" sx={{ mb: 1 }}>
                15
              </Typography>
              <Typography variant="body2" color="text.secondary">
                최근 7일 변경 건수
              </Typography>
              <Typography variant="caption" display="block" sx={{ mt: 1, color: 'info.main' }}>
                +23% 지난 주 대비
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          환율 설정
        </Typography>
        <Divider sx={{ mb: 2 }} />
        
        <Grid container spacing={2} alignItems="flex-end">
          <Grid item xs={12} md={4}>
            <TextField
              fullWidth
              label="환율 (KRW/USD)"
              type="number"
              value={exchangeRate}
              onChange={(e) => setExchangeRate(Number(e.target.value))}
              InputProps={{
                startAdornment: <InputAdornment position="start">₩</InputAdornment>,
              }}
            />
          </Grid>
          <Grid item xs={12} md={4}>
            <FormControl fullWidth>
              <InputLabel>환율 소스</InputLabel>
              <Select value="manual" label="환율 소스">
                <MenuItem value="manual">수동 입력</MenuItem>
                <MenuItem value="api">API 자동 업데이트</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={4}>
            <Button
              fullWidth
              variant="contained"
              startIcon={<UpdateIcon />}
              onClick={handleExchangeRateUpdate}
              sx={{ height: 56 }}
            >
              환율 업데이트
            </Button>
          </Grid>
        </Grid>

        <Alert severity="info" sx={{ mt: 2 }}>
          환율 변경 시 모든 상품의 Shopify 가격이 자동으로 재계산됩니다.
        </Alert>
      </Paper>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">
            마진 설정
          </Typography>
          <Button
            variant="outlined"
            startIcon={<SettingsIcon />}
            size="small"
          >
            고급 설정
          </Button>
        </Box>
        <Divider sx={{ mb: 2 }} />
        
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="기본 마진율"
              type="number"
              value={marginPercent}
              onChange={(e) => setMarginPercent(Number(e.target.value))}
              InputProps={{
                endAdornment: <InputAdornment position="end">%</InputAdornment>,
              }}
              helperText="네이버 가격에서 Shopify 가격 계산 시 적용되는 마진율"
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <Button
              fullWidth
              variant="contained"
              color="primary"
              onClick={handleBulkPriceUpdate}
              sx={{ height: 56 }}
            >
              일괄 가격 업데이트
            </Button>
          </Grid>
        </Grid>
      </Paper>

      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          가격 이력
        </Typography>
        <Box sx={{ height: 400, width: '100%' }}>
          <DataGrid
            rows={priceHistory}
            columns={columns}
            pageSize={5}
            rowsPerPageOptions={[5, 10, 25]}
            loading={loading}
            disableSelectionOnClick
          />
        </Box>
      </Paper>
    </Box>
  );
};

export default Pricing;