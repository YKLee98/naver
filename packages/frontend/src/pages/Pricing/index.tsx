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
  SelectChangeEvent,
} from '@mui/material';
import {
  TrendingUp as TrendingUpIcon,
  AttachMoney as MoneyIcon,
  CurrencyExchange as ExchangeIcon,
  Update as UpdateIcon,
  Settings as SettingsIcon,
} from '@mui/icons-material';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import { priceApi } from '@/services/api/price.service';

const Pricing: React.FC = () => {
  // 환율 관련 상태
  const [exchangeRate, setExchangeRate] = useState(1305.50);
  const [exchangeRateSource, setExchangeRateSource] = useState<'manual' | 'api'>('manual');
  const [customExchangeRate, setCustomExchangeRate] = useState(1305.50);
  
  // 기타 상태
  const [marginPercent, setMarginPercent] = useState(10);
  const [priceHistory, setPriceHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);

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
    loadCurrentExchangeRate();
  }, []);

  const loadPriceData = async () => {
    setLoading(true);
    try {
      const response = await priceApi.getPriceHistory();
      setPriceHistory(response.data || []);
    } catch (error) {
      console.error('Failed to load price data:', error);
      // 임시 데이터 설정 (개발 중)
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
    } finally {
      setLoading(false);
    }
  };

  const loadCurrentExchangeRate = async () => {
    try {
      const response = await priceApi.getCurrentExchangeRate();
      if (response) {
        setExchangeRate(response.rate);
        setExchangeRateSource(response.source || 'api');
        if (response.source === 'manual') {
          setCustomExchangeRate(response.rate);
        }
      }
    } catch (error) {
      console.error('Failed to load exchange rate:', error);
    }
  };

  const handleExchangeRateSourceChange = (event: SelectChangeEvent) => {
    const newSource = event.target.value as 'manual' | 'api';
    setExchangeRateSource(newSource);
    
    if (newSource === 'manual') {
      // 수동 모드로 전환 시 현재 환율을 커스텀 환율로 설정
      setCustomExchangeRate(exchangeRate);
    } else {
      // API 모드로 전환 시 API에서 환율 가져오기
      loadCurrentExchangeRate();
    }
  };

  const handleExchangeRateUpdate = async () => {
    setSyncLoading(true);
    try {
      if (exchangeRateSource === 'manual') {
        // 수동 환율 업데이트
        await priceApi.updateExchangeRate({
          rate: customExchangeRate,
          isManual: true,
        });
        setExchangeRate(customExchangeRate);
        alert('환율이 업데이트되었습니다.');
      } else {
        // API에서 최신 환율 가져오기
        const response = await priceApi.getCurrentExchangeRate();
        if (response) {
          setExchangeRate(response.rate);
          alert(`최신 환율로 업데이트되었습니다: ₩${response.rate}`);
        }
      }
      // 가격 데이터 새로고침
      await loadPriceData();
    } catch (error) {
      console.error('Failed to update exchange rate:', error);
      alert('환율 업데이트에 실패했습니다.');
    } finally {
      setSyncLoading(false);
    }
  };

  const handleBulkPriceUpdate = async () => {
    setSyncLoading(true);
    try {
      await priceApi.bulkUpdatePrices({
        marginPercent,
        applyToAll: true,
      });
      alert(`마진율 ${marginPercent}%로 일괄 가격 업데이트가 완료되었습니다.`);
      await loadPriceData();
    } catch (error) {
      console.error('Failed to update prices:', error);
      alert('가격 업데이트에 실패했습니다.');
    } finally {
      setSyncLoading(false);
    }
  };

  return (
    <Box>
      <Typography variant="h4" component="h1" sx={{ mb: 3, fontWeight: 600 }}>
        가격 관리
      </Typography>

      {/* 상단 요약 카드 */}
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
              <Typography variant="caption" display="block" sx={{ color: 'text.secondary' }}>
                1 USD = {exchangeRate.toFixed(2)} KRW
              </Typography>
              <Chip 
                label={exchangeRateSource === 'api' ? 'API 자동' : '수동 설정'} 
                size="small" 
                color={exchangeRateSource === 'api' ? 'primary' : 'warning'}
                sx={{ mt: 1 }}
              />
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
                15.2%
              </Typography>
              <Typography variant="caption" display="block" sx={{ mt: 1, color: 'success.main' }}>
                +2.3% 지난 주 대비
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <TrendingUpIcon sx={{ mr: 1, color: 'info.main' }} />
                <Typography variant="h6">동기화 상품</Typography>
              </Box>
              <Typography variant="h3" sx={{ mb: 1 }}>
                234개
              </Typography>
              <Typography variant="caption" display="block" sx={{ mt: 1, color: 'info.main' }}>
                +23% 지난 주 대비
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* 환율 설정 섹션 */}
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
              value={exchangeRateSource === 'manual' ? customExchangeRate : exchangeRate}
              onChange={(e) => {
                if (exchangeRateSource === 'manual') {
                  setCustomExchangeRate(Number(e.target.value));
                }
              }}
              disabled={exchangeRateSource === 'api'}
              InputProps={{
                startAdornment: <InputAdornment position="start">₩</InputAdornment>,
              }}
              helperText={exchangeRateSource === 'api' ? 'API 모드에서는 자동으로 설정됩니다' : '수동으로 환율을 입력하세요'}
            />
          </Grid>
          <Grid item xs={12} md={4}>
            <FormControl fullWidth>
              <InputLabel>환율 소스</InputLabel>
              <Select 
                value={exchangeRateSource} 
                label="환율 소스"
                onChange={handleExchangeRateSourceChange}
              >
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
              disabled={syncLoading}
              sx={{ height: 56 }}
            >
              {syncLoading ? '업데이트 중...' : '환율 업데이트'}
            </Button>
          </Grid>
        </Grid>

        <Alert severity="info" sx={{ mt: 2 }}>
          {exchangeRateSource === 'api' 
            ? 'API 자동 모드: 6시간마다 자동으로 환율이 업데이트됩니다.'
            : '수동 모드: 설정한 환율이 모든 가격 계산에 적용됩니다.'}
          환율 변경 시 모든 상품의 Shopify 가격이 자동으로 재계산됩니다.
        </Alert>
      </Paper>

      {/* 마진율 설정 섹션 */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          일괄 마진율 적용
        </Typography>
        <Divider sx={{ mb: 2 }} />
        
        <Grid container spacing={2} alignItems="flex-end">
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="마진율 (%)"
              type="number"
              value={marginPercent}
              onChange={(e) => setMarginPercent(Number(e.target.value))}
              InputProps={{
                endAdornment: <InputAdornment position="end">%</InputAdornment>,
              }}
              helperText="네이버 가격에 적용할 마진율을 입력하세요"
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <Button
              fullWidth
              variant="outlined"
              startIcon={<SettingsIcon />}
              onClick={handleBulkPriceUpdate}
              disabled={syncLoading}
              sx={{ height: 56 }}
            >
              {syncLoading ? '적용 중...' : '마진율 일괄 적용'}
            </Button>
          </Grid>
        </Grid>
      </Paper>

      {/* 가격 이력 테이블 */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          가격 동기화 이력
        </Typography>
        <Divider sx={{ mb: 2 }} />
        
        <Box sx={{ height: 400, width: '100%' }}>
          <DataGrid
            rows={priceHistory}
            columns={columns}
            pageSize={10}
            rowsPerPageOptions={[10, 25, 50]}
            checkboxSelection
            disableSelectionOnClick
            loading={loading}
            sx={{
              '& .MuiDataGrid-cell:hover': {
                color: 'primary.main',
              },
            }}
          />
        </Box>
      </Paper>
    </Box>
  );
};

export default Pricing;