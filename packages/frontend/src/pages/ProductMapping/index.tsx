// packages/frontend/src/pages/ProductMapping/index.tsx
import React, { useEffect, useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  IconButton,
  TextField,
  InputAdornment,
  Chip,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  FormControlLabel,
  Tooltip,
  Fab,
} from '@mui/material';
import {
  Add,
  Search,
  Edit,
  Delete,
  Sync,
  FileUpload,
  FileDownload,
  AutoFixHigh,
  CheckCircle,
  Error,
  Warning,
} from '@mui/icons-material';
import { DataGrid, GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import { useAppDispatch, useAppSelector } from '@/hooks';
import {
  fetchProductMappings,
  createMapping,
  updateMapping,
  deleteMapping,
  autoDiscoverMappings,
} from '@/store/slices/productSlice';
import { formatDateTime, formatCurrency } from '@/utils/formatters';
import ProductMappingDialog from '@/components/Dialogs/ProductMappingDialog';
import BulkUploadDialog from '@/components/Dialogs/BulkUploadDialog';
import ConfirmDialog from '@/components/Dialogs/ConfirmDialog';

interface MappingFormData {
  sku: string;
  naverProductId: string;
  shopifyProductId: string;
  shopifyVariantId: string;
  priceMargin: number;
  isActive: boolean;
}

const ProductMapping: React.FC = () => {
  const dispatch = useAppDispatch();
  const { mappings, loading, error, pagination } = useAppSelector((state) => state.products);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingMapping, setEditingMapping] = useState<any>(null);
  const [autoDiscovering, setAutoDiscovering] = useState(false);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    dispatch(fetchProductMappings({ page: page + 1, limit: pageSize, search: searchTerm }));
  }, [dispatch, page, pageSize, searchTerm]);

  const handleSearch = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
    setPage(0);
  };

  const handleCreateMapping = () => {
    setEditingMapping(null);
    setDialogOpen(true);
  };

  const handleEditMapping = (mapping: any) => {
    setEditingMapping(mapping);
    setDialogOpen(true);
  };

  const handleDeleteMapping = async () => {
    if (selectedRows.length === 0) return;
    
    try {
      for (const id of selectedRows) {
        await dispatch(deleteMapping(id)).unwrap();
      }
      setSelectedRows([]);
      setDeleteDialogOpen(false);
      dispatch(fetchProductMappings({ page: page + 1, limit: pageSize }));
    } catch (error) {
      console.error('Failed to delete mappings:', error);
    }
  };

  const handleAutoDiscover = async () => {
    setAutoDiscovering(true);
    try {
      await dispatch(autoDiscoverMappings()).unwrap();
      dispatch(fetchProductMappings({ page: page + 1, limit: pageSize }));
    } catch (error) {
      console.error('Failed to auto-discover mappings:', error);
    } finally {
      setAutoDiscovering(false);
    }
  };

  const handleSaveMapping = async (data: MappingFormData) => {
    try {
      if (editingMapping) {
        await dispatch(updateMapping({ id: editingMapping._id, data })).unwrap();
      } else {
        await dispatch(createMapping(data)).unwrap();
      }
      setDialogOpen(false);
      dispatch(fetchProductMappings({ page: page + 1, limit: pageSize }));
    } catch (error) {
      console.error('Failed to save mapping:', error);
    }
  };

  const handleExport = () => {
    // CSV 다운로드 로직
    const csv = mappings.map(m => 
      `${m.sku},${m.naverProductId},${m.shopifyProductId},${m.shopifyVariantId},${m.priceMargin}`
    ).join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `product-mappings-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const columns: GridColDef[] = [
    {
      field: 'sku',
      headerName: 'SKU',
      width: 150,
      renderCell: (params) => (
        <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
          {params.value}
        </Typography>
      ),
    },
    {
      field: 'productName',
      headerName: '상품명',
      flex: 1,
      minWidth: 200,
    },
    {
      field: 'naverProductId',
      headerName: '네이버 상품 ID',
      width: 150,
    },
    {
      field: 'shopifyVariantId',
      headerName: 'Shopify Variant ID',
      width: 150,
    },
    {
      field: 'priceMargin',
      headerName: '가격 마진',
      width: 100,
      renderCell: (params) => (
        <Chip
          label={`${((params.value - 1) * 100).toFixed(0)}%`}
          size="small"
          color="primary"
        />
      ),
    },
    {
      field: 'syncStatus',
      headerName: '동기화 상태',
      width: 120,
      renderCell: (params: GridRenderCellParams) => {
        const getStatusIcon = () => {
          switch (params.value) {
            case 'synced':
              return <CheckCircle color="success" fontSize="small" />;
            case 'pending':
              return <Warning color="warning" fontSize="small" />;
            case 'error':
              return <Error color="error" fontSize="small" />;
            default:
              return null;
          }
        };

        const getStatusLabel = () => {
          switch (params.value) {
            case 'synced':
              return '동기화됨';
            case 'pending':
              return '대기중';
            case 'error':
              return '오류';
            default:
              return '알 수 없음';
          }
        };

        return (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {getStatusIcon()}
            <Typography variant="caption">{getStatusLabel()}</Typography>
          </Box>
        );
      },
    },
    {
      field: 'isActive',
      headerName: '활성화',
      width: 100,
      renderCell: (params) => (
        <Switch
          checked={params.value}
          onChange={(e) => {
            dispatch(updateMapping({
              id: params.row._id,
              data: { isActive: e.target.checked }
            }));
          }}
          size="small"
        />
      ),
    },
    {
      field: 'lastSyncedAt',
      headerName: '마지막 동기화',
      width: 150,
      renderCell: (params) => (
        <Typography variant="caption">
          {params.value ? formatDateTime(params.value) : '-'}
        </Typography>
      ),
    },
    {
      field: 'actions',
      headerName: '작업',
      width: 120,
      sortable: false,
      renderCell: (params) => (
        <Box>
          <IconButton
            size="small"
            onClick={() => handleEditMapping(params.row)}
          >
            <Edit fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            onClick={() => {
              dispatch(updateMapping({
                id: params.row._id,
                data: { syncNow: true }
              }));
            }}
          >
            <Sync fontSize="small" />
          </IconButton>
        </Box>
      ),
    },
  ];

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4" component="h1">
          상품 매핑 관리
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<FileDownload />}
            onClick={handleExport}
          >
            내보내기
          </Button>
          <Button
            variant="outlined"
            startIcon={<FileUpload />}
            onClick={() => setBulkUploadOpen(true)}
          >
            대량 업로드
          </Button>
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={handleCreateMapping}
          >
            매핑 추가
          </Button>
        </Box>
      </Box>

      {/* Search and Actions */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
          <TextField
            placeholder="SKU, 상품명으로 검색..."
            value={searchTerm}
            onChange={handleSearch}
            size="small"
            sx={{ flex: 1 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search />
                </InputAdornment>
              ),
            }}
          />
          <Button
            variant="outlined"
            startIcon={<AutoFixHigh />}
            onClick={handleAutoDiscover}
            disabled={autoDiscovering}
          >
            {autoDiscovering ? '검색 중...' : '자동 매핑 검색'}
          </Button>
          {selectedRows.length > 0 && (
            <Button
              variant="outlined"
              color="error"
              startIcon={<Delete />}
              onClick={() => setDeleteDialogOpen(true)}
            >
              선택 삭제 ({selectedRows.length})
            </Button>
          )}
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
      </Paper>

      {/* Data Grid */}
      <Paper sx={{ height: 600 }}>
        <DataGrid
          rows={mappings}
          columns={columns}
          loading={loading}
          getRowId={(row) => row._id}
          paginationModel={{ page, pageSize }}
          onPaginationModelChange={(model) => {
            setPage(model.page);
            setPageSize(model.pageSize);
          }}
          pageSizeOptions={[10, 20, 50, 100]}
          checkboxSelection
          onRowSelectionModelChange={(ids) => setSelectedRows(ids as string[])}
          rowSelectionModel={selectedRows}
          disableRowSelectionOnClick
          sx={{
            '& .MuiDataGrid-cell:hover': {
              color: 'primary.main',
            },
          }}
        />
      </Paper>

      {/* Dialogs */}
      <ProductMappingDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={handleSaveMapping}
        initialData={editingMapping}
      />

      <BulkUploadDialog
        open={bulkUploadOpen}
        onClose={() => setBulkUploadOpen(false)}
        onUploadComplete={() => {
          setBulkUploadOpen(false);
          dispatch(fetchProductMappings({ page: 1, limit: pageSize }));
        }}
      />

      <ConfirmDialog
        open={deleteDialogOpen}
        title="매핑 삭제"
        message={`선택한 ${selectedRows.length}개의 매핑을 삭제하시겠습니까?`}
        onConfirm={handleDeleteMapping}
        onClose={() => setDeleteDialogOpen(false)}
      />
    </Box>
  );
};

export default ProductMapping;