import React, { useState } from 'react';
import {
  Container,
  Typography,
  Box,
  Grid,
  Paper,
  Button,
  Stack,
  TextField,
  InputAdornment,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import {
  Search as SearchIcon,
  Calculate as CalculateIcon,
  History as HistoryIcon,
} from '@mui/icons-material';
import PriceManager from '@/components/pricing/PriceManager';
import ExchangeRateWidget from '@/components/pricing/ExchangeRateWidget';
import PriceHistory from '@/components/pricing/PriceHistory';
import { useGetProductsQuery } from '@/store/api/apiSlice';
import { MARGIN_OPTIONS } from '@/utils/constants';

const Pricing: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [marginFilter, setMarginFilter] = useState('all');
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [showHistory, setShowHistory] = useState(false);

  const { data: productsData, isLoading } = useGetProductsQuery({
    search: searchTerm,
    page: 1,
    limit: 50,
  });

  const handleBulkPriceUpdate = () => {
    console.log('Bulk price update');
  };

  const filteredProducts = productsData?.data.filter((product) => {
    if (marginFilter === 'all') return true;
    const margin = parseFloat(marginFilter);
    return product.priceMargin === margin;
  });

  return (
    <Container maxWidth="xl">
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          가격 관리
        </Typography>
        <Typography variant="body1" color="text.secondary">
          환율을 기반으로 네이버와 Shopify의 가격을 관리하세요.
        </Typography>
      </Box>

      <Grid container spacing={3}>
        {/* 환율 위젯 */}
        <Grid item xs={12} md={3}>
          <ExchangeRateWidget />
        </Grid>

        {/* 검색 및 필터 */}
        <Grid item xs={12} md={9}>
          <Paper sx={{ p: 2 }}>
            <Stack direction="row" spacing={2} alignItems="center">
              <TextField
                placeholder="SKU 또는 상품명으로 검색..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                size="small"
                sx={{ flex: 1 }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon />
                    </InputAdornment>
                  ),
                }}
              />
              <FormControl size="small" sx={{ minWidth: 150 }}>
                <InputLabel>마진율</InputLabel>
                <Select
                  value={marginFilter}
                  onChange={(e) => setMarginFilter(e.target.value)}
                  label="마진율"
                >
                  <MenuItem value="all">전체</MenuItem>
                  {MARGIN_OPTIONS.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Button
                variant="contained"
                startIcon={<CalculateIcon />}
                onClick={handleBulkPriceUpdate}
              >
                일괄 가격 업데이트
              </Button>
            </Stack>
          </Paper>
        </Grid>

        {/* 상품 목록 */}
        <Grid item xs={12}>
          <Grid container spacing={2}>
            {filteredProducts?.map((product) => (
              <Grid item xs={12} md={6} lg={4} key={product._id}>
                <PriceManager
                  sku={product.sku}
                  productName={product.productName}
                  currentPricing={{
                    naverPrice: product.naverPrice || 0,
                    shopifyPrice: product.shopifyPrice || 0,
                    margin: product.priceMargin || 0.1,
                    exchangeRate: 1320, // TODO: 실제 환율 사용
                  }}
                  onViewHistory={() => {
                    setSelectedProduct(product);
                    setShowHistory(true);
                  }}
                />
              </Grid>
            ))}
          </Grid>
        </Grid>
      </Grid>

      {/* 가격 이력 모달 */}
      {showHistory && selectedProduct && (
        <Paper
          sx={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '80%',
            maxWidth: 800,
            maxHeight: '80vh',
            overflow: 'auto',
            p: 4,
            zIndex: 1300,
          }}
        >
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
            <Typography variant="h6">
              가격 변경 이력 - {selectedProduct.productName}
            </Typography>
            <Button onClick={() => setShowHistory(false)}>닫기</Button>
          </Box>
          <PriceHistory history={[]} loading={false} />
        </Paper>
      )}
    </Container>
  );
};

export default Pricing;
