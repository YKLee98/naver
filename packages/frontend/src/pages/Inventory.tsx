import React, { useState, useCallback } from 'react';
import {
  Container,
  Typography,
  Box,
  Paper,
  Button,
  Stack,
  TextField,
  InputAdornment,
  Tabs,
  Tab,
} from '@mui/material';
import {
  Search as SearchIcon,
  Download as DownloadIcon,
  Upload as UploadIcon,
  Sync as SyncIcon,
} from '@mui/icons-material';
import InventoryTable from '@/components/inventory/InventoryTable';
import StockAdjustment from '@/components/inventory/StockAdjustment';
import LowStockAlert from '@/components/inventory/LowStockAlert';
import { useGetProductsQuery, useGetLowStockItemsQuery } from '@/store/api/apiSlice';
import { useDebounce } from '@/hooks/useDebounce';

const Inventory: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState(0);
  const [adjustmentOpen, setAdjustmentOpen] = useState(false);
  const [selectedSku, setSelectedSku] = useState<string>('');
  const [selectedQuantity, setSelectedQuantity] = useState({ naver: 0, shopify: 0 });

  const debouncedSearch = useDebounce(searchTerm, 500);

  const { data: productsData, isLoading: productsLoading } = useGetProductsQuery({
    search: debouncedSearch,
    page: 1,
    limit: 100,
  });

  const { data: lowStockItems, isLoading: lowStockLoading, refetch: refetchLowStock } = useGetLowStockItemsQuery();

  const handleSearch = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  }, []);

  const handleExport = () => {
    // CSV 내보내기 로직
    console.log('Exporting inventory data...');
  };

  const handleImport = () => {
    // CSV 가져오기 로직
    console.log('Importing inventory data...');
  };

  const handleBulkSync = () => {
    // 대량 동기화 로직
    console.log('Starting bulk sync...');
  };

  const handleAdjustInventory = (product: any) => {
    setSelectedSku(product.sku);
    setSelectedQuantity({
      naver: product.naverQuantity || 0,
      shopify: product.shopifyQuantity || 0,
    });
    setAdjustmentOpen(true);
  };

  const handleSync = (sku: string) => {
    // 개별 SKU 동기화 로직
    console.log(`Syncing SKU: ${sku}`);
  };

  return (
    <Container maxWidth="xl">
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          재고 관리
        </Typography>
        <Typography variant="body1" color="text.secondary">
          네이버와 Shopify의 재고를 실시간으로 관리하고 동기화하세요.
        </Typography>
      </Box>

      {/* 재고 부족 알림 */}
      {lowStockItems && lowStockItems.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <LowStockAlert
            items={lowStockItems}
            onRefresh={refetchLowStock}
            loading={lowStockLoading}
          />
        </Box>
      )}

      {/* 액션 바 */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
          <TextField
            placeholder="SKU 또는 상품명으로 검색..."
            value={searchTerm}
            onChange={handleSearch}
            size="small"
            sx={{ minWidth: 300 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
          />
          <Stack direction="row" spacing={1}>
            <Button
              startIcon={<SyncIcon />}
              onClick={handleBulkSync}
              variant="contained"
            >
              전체 동기화
            </Button>
            <Button
              startIcon={<DownloadIcon />}
              onClick={handleExport}
            >
              내보내기
            </Button>
            <Button
              startIcon={<UploadIcon />}
              onClick={handleImport}
            >
              가져오기
            </Button>
          </Stack>
        </Stack>
      </Paper>

      {/* 탭 */}
      <Paper sx={{ mb: 3 }}>
        <Tabs value={activeTab} onChange={(e, v) => setActiveTab(v)}>
          <Tab label="전체 재고" />
          <Tab label="재고 불일치" />
          <Tab label="재고 이력" />
        </Tabs>
      </Paper>

      {/* 재고 테이블 */}
      <Paper>
        {activeTab === 0 && (
          <InventoryTable
            products={productsData?.data || []}
            loading={productsLoading}
            onEdit={handleAdjustInventory}
            onSync={handleSync}
          />
        )}
        {activeTab === 1 && (
          <Box sx={{ p: 3 }}>
            <Typography color="text.secondary">재고 불일치 목록</Typography>
          </Box>
        )}
        {activeTab === 2 && (
          <Box sx={{ p: 3 }}>
            <Typography color="text.secondary">재고 변경 이력</Typography>
          </Box>
        )}
      </Paper>

      {/* 재고 조정 다이얼로그 */}
      <StockAdjustment
        open={adjustmentOpen}
        onClose={() => setAdjustmentOpen(false)}
        sku={selectedSku}
        currentQuantity={selectedQuantity}
      />
    </Container>
  );
};

export default Inventory;

