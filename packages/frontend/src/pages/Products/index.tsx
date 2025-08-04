// ===== 1. packages/frontend/src/pages/Products/index.tsx =====
// mappings undefined 문제 수정
import React, { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Paper,
  Typography,
  TextField,
  Stack,
  Alert,
  Snackbar,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import { Add, Edit, Delete, Sync, Close } from '@mui/icons-material';
import { useAppDispatch, useAppSelector } from '@/hooks';
import { fetchMappings, createMapping, updateMapping, deleteMapping } from '@/store/slices/productSlice';

interface MappingFormData {
  sku: string;
  productName: string;
  naverProductId: string;
  shopifyProductId: string;
  shopifyVariantId: string;
  vendor?: string;
  priceMargin?: number;
  isActive?: boolean;
}

const Products: React.FC = () => {
  const dispatch = useAppDispatch();
  // products 상태가 정의되어 있는지 확인
  const productsState = useAppSelector((state) => state.products);
  const { mappings = [], loading = false, error = null } = productsState || {};
  
  const [openDialog, setOpenDialog] = useState(false);
  const [formData, setFormData] = useState<MappingFormData>({
    sku: '',
    productName: '',
    naverProductId: '',
    shopifyProductId: '',
    shopifyVariantId: '',
    vendor: 'album',
    priceMargin: 0.1,
    isActive: true,
  });
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

  useEffect(() => {
    dispatch(fetchMappings());
  }, [dispatch]);

  const handleAddMapping = () => {
    console.log('Add mapping clicked');
    setFormData({
      sku: '',
      productName: '',
      naverProductId: '',
      shopifyProductId: '',
      shopifyVariantId: '',
      vendor: 'album',
      priceMargin: 0.1,
      isActive: true,
    });
    setOpenDialog(true);
  };

  const handleSaveMapping = async () => {
    console.log('Saving mapping:', formData);
    
    // Validation
    if (!formData.sku || !formData.naverProductId || !formData.shopifyProductId) {
      setSnackbar({
        open: true,
        message: 'SKU, 네이버 상품 ID, Shopify 상품 ID는 필수입니다.',
        severity: 'error'
      });
      return;
    }

    // shopifyVariantId가 없으면 shopifyProductId와 동일하게 설정 (임시)
    const mappingData = {
      ...formData,
      shopifyVariantId: formData.shopifyVariantId || formData.shopifyProductId + '_variant',
    };

    try {
      await dispatch(createMapping(mappingData)).unwrap();
      setSnackbar({
        open: true,
        message: '매핑이 성공적으로 생성되었습니다.',
        severity: 'success'
      });
      setOpenDialog(false);
      // 매핑 목록 새로고침
      dispatch(fetchMappings());
    } catch (error: any) {
      console.error('Failed to create mapping:', error);
      setSnackbar({
        open: true,
        message: error.message || '매핑 생성에 실패했습니다.',
        severity: 'error'
      });
    }
  };

  const columns: GridColDef[] = [
    { field: 'sku', headerName: 'SKU', width: 150 },
    { field: 'productName', headerName: '상품명', width: 300 },
    { field: 'naverProductId', headerName: '네이버 상품 ID', width: 150 },
    { field: 'shopifyProductId', headerName: 'Shopify 상품 ID', width: 150 },
    {
      field: 'syncStatus',
      headerName: '동기화 상태',
      width: 120,
      renderCell: (params) => (
        <Typography
          variant="body2"
          color={
            params.value === 'synced' ? 'success.main' :
            params.value === 'pending' ? 'warning.main' : 'error.main'
          }
        >
          {params.value === 'synced' ? '동기화됨' :
           params.value === 'pending' ? '대기중' : '오류'}
        </Typography>
      ),
    },
    {
      field: 'isActive',
      headerName: '활성',
      width: 100,
      renderCell: (params) => (
        <Typography variant="body2" color={params.value ? 'success.main' : 'text.disabled'}>
          {params.value ? '활성' : '비활성'}
        </Typography>
      ),
    },
    {
      field: 'actions',
      headerName: '작업',
      width: 150,
      renderCell: (params) => (
        <Stack direction="row" spacing={1}>
          <IconButton size="small" color="primary">
            <Edit />
          </IconButton>
          <IconButton size="small" color="error">
            <Delete />
          </IconButton>
          <IconButton size="small" color="secondary">
            <Sync />
          </IconButton>
        </Stack>
      ),
    },
  ];

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" gutterBottom>
          상품 매핑 관리
        </Typography>
        <Typography variant="body1" color="text.secondary">
          네이버와 Shopify 간의 상품 매핑을 관리합니다.
        </Typography>
      </Box>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h6">매핑 목록</Typography>
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={handleAddMapping}
          >
            새 매핑 추가
          </Button>
        </Stack>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <DataGrid
          rows={mappings}
          columns={columns}
          getRowId={(row) => row._id || row.sku}
          loading={loading}
          autoHeight
          pageSizeOptions={[10, 25, 50]}
          initialState={{
            pagination: {
              paginationModel: { pageSize: 10 },
            },
          }}
        />
      </Paper>

      {/* 매핑 추가/수정 다이얼로그 */}
      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          새 매핑 추가
          <IconButton
            onClick={() => setOpenDialog(false)}
            sx={{ position: 'absolute', right: 8, top: 8 }}
          >
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 2 }}>
            <TextField
              label="SKU"
              value={formData.sku}
              onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
              fullWidth
              required
            />
            <TextField
              label="상품명"
              value={formData.productName}
              onChange={(e) => setFormData({ ...formData, productName: e.target.value })}
              fullWidth
            />
            <TextField
              label="네이버 상품 ID"
              value={formData.naverProductId}
              onChange={(e) => setFormData({ ...formData, naverProductId: e.target.value })}
              fullWidth
              required
            />
            <TextField
              label="Shopify 상품 ID"
              value={formData.shopifyProductId}
              onChange={(e) => setFormData({ ...formData, shopifyProductId: e.target.value })}
              fullWidth
              required
            />
            <TextField
              label="Shopify Variant ID"
              value={formData.shopifyVariantId}
              onChange={(e) => setFormData({ ...formData, shopifyVariantId: e.target.value })}
              fullWidth
              helperText="비워두면 상품 ID + '_variant'로 자동 생성됩니다"
            />
            <FormControl fullWidth>
              <InputLabel>벤더</InputLabel>
              <Select
                value={formData.vendor}
                onChange={(e) => setFormData({ ...formData, vendor: e.target.value })}
                label="벤더"
              >
                <MenuItem value="album">album</MenuItem>
                <MenuItem value="other">기타</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="가격 마진 (%)"
              type="number"
              value={(formData.priceMargin || 0) * 100}
              onChange={(e) => setFormData({ ...formData, priceMargin: Number(e.target.value) / 100 })}
              fullWidth
              helperText="예: 10% 마진은 10 입력"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDialog(false)}>취소</Button>
          <Button onClick={handleSaveMapping} variant="contained">저장</Button>
        </DialogActions>
      </Dialog>

      {/* 스낵바 */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default Products;