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
import apiClient from '@/services/api/config';

const Pricing: React.FC = () => {
  // 환율 관련 상태 - 안전한 초기값 설정
  const [exchangeRate, setExchangeRate] = useState<number>(1305.50);
  const [exchangeRateData, setExchangeRateData] = useState<any>(null);
  const [exchangeRateSource, setExchangeRateSource] = useState<'manual' | 'api'>('manual');
  const [customExchangeRate, setCustomExchangeRate] = useState<number>(1305.50);
  
  // 기타 상태
  const [marginPercent, setMarginPercent] = useState<number>(10);
  const [priceHistory, setPriceHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [syncLoading, setSyncLoading] = useState<boolean>(false);

  const columns: GridColDef[] = [
    { field: 'sku', headerName: 'SKU', width: 130 },
    { field: 'productName', headerName: '상품명', width: 200, flex: 1 },
    { 
      field: 'naverPrice', 
      headerName: '네이버 가격 (KRW)', 
      width: 150,
      renderCell: (params) => {
        const value = params.value || 0;
        return `₩${Number(value).toLocaleString('ko-KR')}`;
      },
    },
    { 
      field: 'shopifyPrice', 
      headerName: 'Shopify 가격 (USD)', 
      width: 150,
      renderCell: (params) => {
        const value = params.value || 0;
        return `$${Number(value).toFixed(2)}`;
      },
    },
    {
      field: 'margin',
      headerName: '마진율',
      width: 100,
      renderCell: (params) => {
        const value = params.value || 0;
        return (
          <Chip 
            label={`${value}%`} 
            size="small" 
            color={value >= 10 ? 'success' : 'warning'}
          />
        );
      },
    },
    {
      field: 'lastUpdated',
      headerName: '마지막 업데이트',
      width: 180,
      valueGetter: (params) => {
        if (!params.value) return '업데이트 없음';
        try {
          return new Date(params.value).toLocaleString('ko-KR');
        } catch {
          return '날짜 오류';
        }
      },
    },
  ];

  useEffect(() => {
    loadPriceData();
    loadExchangeRate();
  }, []);

  const loadPriceData = async () => {
    setLoading(true);
    try {
      // 매핑된 상품들의 가격 정보를 가져옴
      const response = await priceApi.getPriceList();
      console.log('🔴 Price data response:', response);
      console.log('🔴 Response type:', typeof response);
      console.log('🔴 Is Array?:', Array.isArray(response));
      
      if (Array.isArray(response) && response.length > 0) {
        console.log('💰 Processing price array of', response.length, 'items');
        // 각 상품의 가격 정보 포맷팅
        const formattedData = response.map((item, index) => {
          console.log(`💰 Item ${index}:`, item);
          const formatted = {
            id: item._id || item.id || `item-${index}`,
            sku: item.sku || `sku-${index}`,
            productName: item.productName || item.title || '상품명 없음',
            naverPrice: item.naverPrice || 0,
            shopifyPrice: item.shopifyPrice || 0,
            margin: item.margin || item.priceMargin || 0,
            lastUpdated: item.lastUpdated || item.updatedAt || item.lastSyncAt || new Date(),
          };
          console.log(`💰 Formatted ${index}:`, formatted);
          return formatted;
        });
        console.log('💰 Final formatted data:', formattedData);
        setPriceHistory(formattedData);
      } else {
        console.log('❌ No price data received or invalid format:', response);
        console.log('❌ Response type:', typeof response);
        console.log('❌ Response length:', response?.length);
        setPriceHistory([]);
      }
    } catch (error) {
      console.error('❌ Failed to load price data:', error);
      setPriceHistory([]);
    } finally {
      setLoading(false);
    }
  };

  const loadExchangeRate = async () => {
    try {
      const response = await priceApi.getCurrentExchangeRate();
      console.log('Exchange rate response:', response);
      
      // API 응답 형식에 맞게 처리
      if (response) {
        const rate = response.krwPerUsd || response.rate || 1305.50;
        setExchangeRate(rate);
        setExchangeRateData({
          rate: rate,
          changePercent: response.changePercent || 0,
          change: response.change || 0,
          source: response.source || 'api'
        });
      }
    } catch (error) {
      console.error('Failed to load exchange rate:', error);
      // 오류 발생시 기본값 유지
      setExchangeRate(1305.50);
    }
  };

  const handleExchangeRateSourceChange = (event: SelectChangeEvent) => {
    const source = event.target.value as 'manual' | 'api';
    setExchangeRateSource(source);
    
    if (source === 'manual') {
      setExchangeRate(customExchangeRate);
    } else {
      loadExchangeRate();
    }
  };

  const handleCustomExchangeRateChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(event.target.value) || 0;
    setCustomExchangeRate(value);
    if (exchangeRateSource === 'manual') {
      setExchangeRate(value);
    }
  };

  const handleMarginChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(event.target.value) || 0;
    setMarginPercent(Math.max(0, Math.min(100, value))); // 0-100% 범위 제한
  };

  const handlePriceSync = async () => {
    setSyncLoading(true);
    try {
      // 실시간 가격 조회 옵션으로 데이터 가져오기
      setLoading(true);
      const response = await apiClient.get('/prices?realtime=true');
      console.log('Real-time price sync response:', response.data);
      
      if (response.data?.success && response.data?.data) {
        const formattedData = response.data.data.map((item: any) => ({
          id: item._id || item.id || Math.random().toString(),
          sku: item.sku,
          productName: item.productName || '상품명 없음',
          naverPrice: item.naverPrice || 0,
          shopifyPrice: item.shopifyPrice || 0,
          margin: item.margin || 10,
          lastUpdated: item.lastUpdated || new Date(),
        }));
        setPriceHistory(formattedData);
        alert('실시간 가격 동기화가 완료되었습니다.');
      } else {
        alert('가격 동기화에 실패했습니다.');
      }
    } catch (error) {
      console.error('Failed to sync prices:', error);
      alert('가격 동기화에 실패했습니다.');
    } finally {
      setSyncLoading(false);
      setLoading(false);
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

  // 안전한 숫자 포맷팅 함수
  const formatNumber = (value: any, locale: string = 'ko-KR'): string => {
    if (value === null || value === undefined || isNaN(value)) {
      return '0';
    }
    return Number(value).toLocaleString(locale);
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
                ₩{formatNumber(exchangeRate, 'ko-KR')}
              </Typography>
              <Typography variant="caption" display="block" sx={{ color: 'text.secondary' }}>
                1 USD = {exchangeRate ? exchangeRate.toFixed(2) : '0.00'} KRW
              </Typography>
              <Chip 
                label={exchangeRateSource === 'api' ? 'API 자동' : '수동 설정'} 
                size="small" 
                color={exchangeRateSource === 'api' ? 'primary' : 'default'}
                sx={{ mt: 1 }}
              />
              {exchangeRateData && (
                <Typography variant="caption" display="block" sx={{ mt: 1, color: 'text.secondary' }}>
                  변동: {exchangeRateData.changePercent >= 0 ? '+' : ''}{exchangeRateData.changePercent}%
                </Typography>
              )}
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
              <Typography variant="caption" display="block" sx={{ color: 'text.secondary' }}>
                전체 상품 평균
              </Typography>
              <Box sx={{ mt: 2 }}>
                <TextField
                  size="small"
                  type="number"
                  value={marginPercent}
                  onChange={handleMarginChange}
                  InputProps={{
                    endAdornment: <InputAdornment position="end">%</InputAdornment>,
                  }}
                  inputProps={{
                    min: 0,
                    max: 100,
                    step: 0.1,
                  }}
                  fullWidth
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <UpdateIcon sx={{ mr: 1, color: 'info.main' }} />
                <Typography variant="h6">동기화 상태</Typography>
              </Box>
              <Typography variant="h3" sx={{ mb: 1 }}>
                {priceHistory.length}
              </Typography>
              <Typography variant="caption" display="block" sx={{ color: 'text.secondary' }}>
                동기화된 상품 수
              </Typography>
              <Box sx={{ mt: 2 }}>
                <Button
                  variant="contained"
                  fullWidth
                  onClick={handlePriceSync}
                  disabled={syncLoading}
                  startIcon={<UpdateIcon />}
                >
                  {syncLoading ? '동기화 중...' : '가격 동기화'}
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* 환율 설정 패널 */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          환율 설정
        </Typography>
        <Divider sx={{ mb: 2 }} />
        
        <Grid container spacing={3} alignItems="center">
          <Grid item xs={12} md={3}>
            <FormControl fullWidth>
              <InputLabel>환율 소스</InputLabel>
              <Select
                value={exchangeRateSource}
                onChange={handleExchangeRateSourceChange}
                label="환율 소스"
              >
                <MenuItem value="api">API 자동</MenuItem>
                <MenuItem value="manual">수동 설정</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          
          {exchangeRateSource === 'manual' && (
            <Grid item xs={12} md={3}>
              <TextField
                label="환율 (1 USD)"
                type="number"
                value={customExchangeRate}
                onChange={handleCustomExchangeRateChange}
                InputProps={{
                  startAdornment: <InputAdornment position="start">₩</InputAdornment>,
                }}
                inputProps={{
                  min: 0,
                  step: 0.01,
                }}
                fullWidth
              />
            </Grid>
          )}
          
          <Grid item xs={12} md={3}>
            <TextField
              label="기본 마진율"
              type="number"
              value={marginPercent}
              onChange={handleMarginChange}
              InputProps={{
                endAdornment: <InputAdornment position="end">%</InputAdornment>,
              }}
              inputProps={{
                min: 0,
                max: 100,
                step: 0.1,
              }}
              fullWidth
            />
          </Grid>
          
          <Grid item xs={12} md={3}>
            <Button
              variant="outlined"
              fullWidth
              onClick={handleBulkPriceUpdate}
              disabled={syncLoading}
              startIcon={<SettingsIcon />}
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
          {console.log('🔥 DataGrid rows:', priceHistory)}
          {console.log('🔥 DataGrid rows length:', priceHistory.length)}
          {priceHistory.length > 0 && console.log('🔥 First row:', priceHistory[0])}
          <DataGrid
            rows={priceHistory}
            columns={columns}
            initialState={{
              pagination: {
                paginationModel: { pageSize: 10, page: 0 },
              },
            }}
            pageSizeOptions={[10, 25, 50]}
            checkboxSelection
            disableRowSelectionOnClick
            loading={loading}
            getRowId={(row) => row.id || row._id || Math.random().toString()}
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