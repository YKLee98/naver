// packages/frontend/src/pages/Products/index.tsx
import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  TextField,
  InputAdornment,
  IconButton,
  Chip,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import { DataGrid, GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import {
  Search as SearchIcon,
  Add as AddIcon,
  Refresh as RefreshIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Link as LinkIcon,
} from '@mui/icons-material';
import { useAppDispatch, useAppSelector } from '@/hooks/redux';

const columns: GridColDef[] = [
  { 
    field: 'sku', 
    headerName: 'SKU', 
    width: 130,
    renderCell: (params) => (
      <Typography variant="body2" sx={{ fontWeight: 500 }}>
        {params.value}
      </Typography>
    ),
  },
  { 
    field: 'productName', 
    headerName: '상품명', 
    width: 250,
    flex: 1,
  },
  { 
    field: 'naverProductId', 
    headerName: '네이버 상품 ID', 
    width: 150,
  },
  { 
    field: 'shopifyProductId', 
    headerName: 'Shopify 상품 ID', 
    width: 150,
  },
  {
    field: 'status',
    headerName: '상태',
    width: 120,
    renderCell: (params: GridRenderCellParams) => {
      const status = params.value as string;
      const color = status === 'ACTIVE' ? 'success' : status === 'INACTIVE' ? 'warning' : 'error';
      return <Chip label={status} color={color} size="small" />;
    },
  },
  {
    field: 'syncStatus',
    headerName: '동기화 상태',
    width: 120,
    renderCell: (params: GridRenderCellParams) => {
      const status = params.value as string;
      const color = status === 'synced' ? 'success' : status === 'pending' ? 'warning' : 'error';
      const label = status === 'synced' ? '동기화됨' : status === 'pending' ? '대기중' : '오류';
      return <Chip label={label} color={color} size="small" variant="outlined" />;
    },
  },
  {
    field: 'lastSyncedAt',
    headerName: '마지막 동기화',
    width: 150,
    valueGetter: (params) => {
      return params.value ? new Date(params.value).toLocaleString('ko-KR') : '-';
    },
  },
  {
    field: 'actions',
    headerName: '작업',
    width: 120,
    sortable: false,
    renderCell: (params: GridRenderCellParams) => (
      <Stack direction="row" spacing={1}>
        <IconButton size="small" color="primary">
          <EditIcon fontSize="small" />
        </IconButton>
        <IconButton size="small" color="error">
          <DeleteIcon fontSize="small" />
        </IconButton>
      </Stack>
    ),
  },
];

const Products: React.FC = () => {
  const dispatch = useAppDispatch();
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  
  // 모달 관련 상태
  const [openModal, setOpenModal] = useState(false);
  const [mappingData, setMappingData] = useState({
    naverProductId: '',
    shopifyProductId: '',
    sku: '',
  });

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    setLoading(true);
    try {
      // 임시 데이터
      setRows([
        {
          id: '1',
          sku: 'TEST-001',
          productName: '테스트 상품 1',
          naverProductId: 'NAV123',
          shopifyProductId: 'SHOP456',
          status: 'ACTIVE',
          syncStatus: 'synced',
          lastSyncedAt: new Date().toISOString(),
        },
      ]);
    } catch (error) {
      console.error('Failed to load products:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };

  const handleAddMapping = () => {
    console.log('Add mapping clicked');
    setOpenModal(true);
  };

  const handleCloseModal = () => {
    setOpenModal(false);
    setMappingData({ naverProductId: '', shopifyProductId: '', sku: '' });
  };

  const handleSaveMapping = () => {
    console.log('Saving mapping:', mappingData);
    // TODO: API 호출하여 매핑 저장
    handleCloseModal();
    loadProducts(); // 목록 새로고침
  };

  const handleRefresh = () => {
    loadProducts();
  };

  return (
    <Box>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4" component="h1" sx={{ fontWeight: 600 }}>
          상품 매핑 관리
        </Typography>
        <Stack direction="row" spacing={2}>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={handleRefresh}
          >
            새로고침
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleAddMapping}
          >
            매핑 추가
          </Button>
        </Stack>
      </Box>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Box sx={{ mb: 3 }}>
          <TextField
            fullWidth
            variant="outlined"
            placeholder="SKU, 상품명, 상품 ID로 검색..."
            value={searchTerm}
            onChange={handleSearch}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
          />
        </Box>

        <Box sx={{ height: 600, width: '100%' }}>
          <DataGrid
            rows={rows}
            columns={columns}
            pageSize={10}
            rowsPerPageOptions={[10, 25, 50]}
            checkboxSelection
            disableSelectionOnClick
            loading={loading}
            sx={{
              '& .MuiDataGrid-root': {
                border: 'none',
              },
              '& .MuiDataGrid-cell': {
                borderBottom: '1px solid rgba(224, 224, 224, 0.5)',
              },
              '& .MuiDataGrid-columnHeaders': {
                backgroundColor: '#f5f5f5',
                borderBottom: '2px solid #e0e0e0',
              },
            }}
          />
        </Box>
      </Paper>

      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          매핑 통계
        </Typography>
        <Stack direction="row" spacing={3}>
          <Box>
            <Typography variant="body2" color="text.secondary">
              전체 매핑
            </Typography>
            <Typography variant="h4">
              {rows.length}
            </Typography>
          </Box>
          <Box>
            <Typography variant="body2" color="text.secondary">
              활성 매핑
            </Typography>
            <Typography variant="h4" color="success.main">
              {rows.filter(r => r.status === 'ACTIVE').length}
            </Typography>
          </Box>
          <Box>
            <Typography variant="body2" color="text.secondary">
              동기화 오류
            </Typography>
            <Typography variant="h4" color="error.main">
              {rows.filter(r => r.syncStatus === 'error').length}
            </Typography>
          </Box>
        </Stack>
      </Paper>

      {/* 매핑 추가 모달 */}
      <Dialog 
        open={openModal} 
        onClose={handleCloseModal}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>새 매핑 추가</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="SKU"
                value={mappingData.sku}
                onChange={(e) => setMappingData({ ...mappingData, sku: e.target.value })}
                placeholder="공통 SKU 입력"
              />
            </Grid>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>네이버 상품</InputLabel>
                <Select
                  value={mappingData.naverProductId}
                  onChange={(e) => setMappingData({ ...mappingData, naverProductId: e.target.value })}
                  label="네이버 상품"
                >
                  <MenuItem value="">선택하세요</MenuItem>
                  <MenuItem value="naver1">네이버 상품 1</MenuItem>
                  <MenuItem value="naver2">네이버 상품 2</MenuItem>
                  <MenuItem value="naver3">네이버 상품 3</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Shopify 상품</InputLabel>
                <Select
                  value={mappingData.shopifyProductId}
                  onChange={(e) => setMappingData({ ...mappingData, shopifyProductId: e.target.value })}
                  label="Shopify 상품"
                >
                  <MenuItem value="">선택하세요</MenuItem>
                  <MenuItem value="shopify1">Shopify 상품 1</MenuItem>
                  <MenuItem value="shopify2">Shopify 상품 2</MenuItem>
                  <MenuItem value="shopify3">Shopify 상품 3</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseModal}>취소</Button>
          <Button 
            onClick={handleSaveMapping} 
            variant="contained"
            disabled={!mappingData.sku || !mappingData.naverProductId || !mappingData.shopifyProductId}
          >
            저장
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Products;