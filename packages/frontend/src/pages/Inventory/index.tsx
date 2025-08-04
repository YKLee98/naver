// packages/frontend/src/pages/Inventory/index.tsx
import React, { useEffect, useState } from 'react';
import {
  Box,
  Paper,
  Grid,
  Typography,
  Button,
  TextField,
  InputAdornment,
  Tabs,
  Tab,
  Chip,
  Alert,
  IconButton,
  Menu,
  MenuItem,
  Badge,
  Tooltip,
  LinearProgress,
  Card,
  CardContent,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  FormControl,
  InputLabel,
  Select,
} from '@mui/material';
import {
  Search,
  FilterList,
  Download,
  Sync,
  Warning,
  CheckCircle,
  Error as ErrorIcon,
  MoreVert,
  TrendingUp,
  TrendingDown,
  Remove,
  Edit,
  History,
} from '@mui/icons-material';
import { DataGrid, GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import { useAppDispatch, useAppSelector } from '@/hooks';
import {
  fetchInventoryStatus,
  adjustInventory,
} from '@/store/slices/inventorySlice';

// 포매터 함수들 (utils/formatters가 없을 경우를 대비)
const formatNumber = (num: number) => {
  return new Intl.NumberFormat('ko-KR').format(num);
};

const formatDateTime = (dateString: string) => {
  return new Date(dateString).toLocaleString('ko-KR');
};

// StockLevelIndicator 컴포넌트
const StockLevelIndicator: React.FC<{ quantity: number }> = ({ quantity }) => {
  if (quantity === 0) {
    return <ErrorIcon color="error" fontSize="small" />;
  } else if (quantity < 10) {
    return <Warning color="warning" fontSize="small" />;
  }
  return null;
};

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

const TabPanel: React.FC<TabPanelProps> = ({ children, value, index, ...other }) => {
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`inventory-tabpanel-${index}`}
      aria-labelledby={`inventory-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
  );
};

// 개선된 인벤토리 조정 다이얼로그 컴포넌트
const InventoryAdjustDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  sku: string | null;
  currentNaverQuantity: number;
  currentShopifyQuantity: number;
  onAdjust: (data: any) => void;
}> = ({ open, onClose, sku, currentNaverQuantity, currentShopifyQuantity, onAdjust }) => {
  const [platform, setPlatform] = useState<'naver' | 'shopify' | 'both'>('both');
  const [adjustType, setAdjustType] = useState('set');
  const [naverQuantity, setNaverQuantity] = useState(0);
  const [shopifyQuantity, setShopifyQuantity] = useState(0);
  const [reason, setReason] = useState('');

  const handleSubmit = async () => {
    const adjustmentData = {
      sku,
      platform,
      adjustType,
      naverQuantity: platform === 'naver' || platform === 'both' ? naverQuantity : null,
      shopifyQuantity: platform === 'shopify' || platform === 'both' ? shopifyQuantity : null,
      reason,
    };
    
    try {
      // 실제 API 호출
      // if (platform === 'naver' || platform === 'both') {
      //   await api.post('/inventory/adjust/naver', { sku, quantity: naverQuantity, adjustType, reason });
      // }
      // if (platform === 'shopify' || platform === 'both') {
      //   await api.post('/inventory/adjust/shopify', { sku, quantity: shopifyQuantity, adjustType, reason });
      // }
      
      onAdjust(adjustmentData);
      alert('재고 조정이 완료되었습니다.');
    } catch (error) {
      alert('재고 조정 중 오류가 발생했습니다.');
      console.error(error);
    }
    
    onClose();
  };

  const getNewQuantity = (current: number, adjustment: number, type: string) => {
    switch (type) {
      case 'set':
        return adjustment;
      case 'add':
        return current + adjustment;
      case 'subtract':
        return Math.max(0, current - adjustment);
      default:
        return current;
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>재고 조정 - {sku}</DialogTitle>
      <DialogContent>
        <Box sx={{ pt: 2 }}>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>조정 플랫폼</InputLabel>
                <Select
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value as any)}
                  label="조정 플랫폼"
                >
                  <MenuItem value="both">네이버 + Shopify</MenuItem>
                  <MenuItem value="naver">네이버만</MenuItem>
                  <MenuItem value="shopify">Shopify만</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>조정 유형</InputLabel>
                <Select
                  value={adjustType}
                  onChange={(e) => setAdjustType(e.target.value)}
                  label="조정 유형"
                >
                  <MenuItem value="set">재고 설정</MenuItem>
                  <MenuItem value="add">재고 추가</MenuItem>
                  <MenuItem value="subtract">재고 차감</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            {(platform === 'naver' || platform === 'both') && (
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  type="number"
                  label="네이버 수량"
                  value={naverQuantity}
                  onChange={(e) => setNaverQuantity(Number(e.target.value))}
                  InputProps={{ inputProps: { min: 0 } }}
                  helperText={`현재: ${currentNaverQuantity} → 변경 후: ${getNewQuantity(currentNaverQuantity, naverQuantity, adjustType)}`}
                />
              </Grid>
            )}

            {(platform === 'shopify' || platform === 'both') && (
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  type="number"
                  label="Shopify 수량"
                  value={shopifyQuantity}
                  onChange={(e) => setShopifyQuantity(Number(e.target.value))}
                  InputProps={{ inputProps: { min: 0 } }}
                  helperText={`현재: ${currentShopifyQuantity} → 변경 후: ${getNewQuantity(currentShopifyQuantity, shopifyQuantity, adjustType)}`}
                />
              </Grid>
            )}

            <Grid item xs={12}>
              <TextField
                fullWidth
                label="조정 사유"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                multiline
                rows={2}
                required
              />
            </Grid>

            <Grid item xs={12}>
              <Alert severity="warning">
                실제 플랫폼에 재고가 반영됩니다. 신중하게 조정해주세요.
              </Alert>
            </Grid>
          </Grid>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>취소</Button>
        <Button 
          onClick={handleSubmit} 
          variant="contained"
          disabled={!reason || (platform !== 'shopify' && naverQuantity < 0) || (platform !== 'naver' && shopifyQuantity < 0)}
        >
          조정하기
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// 임시 인벤토리 히스토리 다이얼로그 컴포넌트
const InventoryHistoryDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  sku: string | null;
}> = ({ open, onClose, sku }) => {
  // 임시 히스토리 데이터
  const history = [
    { date: '2024-01-15 10:30', type: '조정', quantity: '+10', reason: '입고' },
    { date: '2024-01-14 15:20', type: '판매', quantity: '-2', reason: '주문 #1234' },
  ];

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>재고 이력 - {sku}</DialogTitle>
      <DialogContent>
        <List>
          {history.map((item, index) => (
            <ListItem key={index} divider>
              <ListItemText
                primary={`${item.type} - ${item.quantity}`}
                secondary={`${item.date} - ${item.reason}`}
              />
            </ListItem>
          ))}
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>닫기</Button>
      </DialogActions>
    </Dialog>
  );
};

const Inventory: React.FC = () => {
  const dispatch = useAppDispatch();
  
  // Redux store에서 데이터 가져오기 (없을 경우를 대비한 기본값)
  const inventoryState = useAppSelector((state) => state.inventory) || {
    items: [],
    loading: false,
    error: null,
    lowStockItems: [],
    outOfStockItems: [],
  };

  const { items = [], loading = false, error = null, lowStockItems = [], outOfStockItems = [] } = inventoryState;

  const [tabValue, setTabValue] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSku, setSelectedSku] = useState<string | null>(null);
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);

  // 임시 데이터 (store가 비어있을 경우)
  const [tempItems] = useState([
    {
      sku: 'ALBUM-001',
      productName: '샘플 앨범 1',
      naverQuantity: 10,
      shopifyQuantity: 10,
      difference: 0,
      syncStatus: 'synced',
      lastUpdated: new Date().toISOString(),
    },
    {
      sku: 'ALBUM-002',
      productName: '샘플 앨범 2',
      naverQuantity: 5,
      shopifyQuantity: 8,
      difference: -3,
      syncStatus: 'pending',
      lastUpdated: new Date().toISOString(),
    },
  ]);

  const displayItems = items.length > 0 ? items : tempItems;
  const displayLowStock = lowStockItems.length > 0 ? lowStockItems : tempItems.filter(item => item.naverQuantity < 10);
  const displayOutOfStock = outOfStockItems.length > 0 ? outOfStockItems : tempItems.filter(item => item.naverQuantity === 0);

  useEffect(() => {
    // fetchInventoryStatus가 있을 경우에만 호출
    if (dispatch && fetchInventoryStatus) {
      dispatch(fetchInventoryStatus({ page: page + 1, limit: pageSize, search: searchTerm }));
    }
  }, [dispatch, page, pageSize, searchTerm]);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const handleSearch = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
    setPage(0);
  };

  const handleAdjustInventory = (sku: string) => {
    setSelectedSku(sku);
    setAdjustDialogOpen(true);
  };

  const handleViewHistory = (sku: string) => {
    setSelectedSku(sku);
    setHistoryDialogOpen(true);
  };

  const handleSyncAll = () => {
    if (dispatch && fetchInventoryStatus) {
      dispatch(fetchInventoryStatus({ page: 1, limit: pageSize, forceSync: true }));
    }
  };

  const handleExport = () => {
    const csv = displayItems.map(item => 
      `${item.sku},${item.productName},${item.naverQuantity},${item.shopifyQuantity},${item.difference}`
    ).join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventory-status-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const getFilteredItems = () => {
    switch (tabValue) {
      case 1:
        return displayLowStock;
      case 2:
        return displayOutOfStock;
      case 3:
        return displayItems.filter(item => item.difference !== 0);
      default:
        return displayItems;
    }
  };

  const columns: GridColDef[] = [
    {
      field: 'sku',
      headerName: 'SKU',
      width: 120,
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
      field: 'naverQuantity',
      headerName: '네이버 재고',
      width: 120,
      align: 'center',
      headerAlign: 'center',
      renderCell: (params) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography>{formatNumber(params.value)}</Typography>
          <StockLevelIndicator quantity={params.value} />
        </Box>
      ),
    },
    {
      field: 'shopifyQuantity',
      headerName: 'Shopify 재고',
      width: 120,
      align: 'center',
      headerAlign: 'center',
      renderCell: (params) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography>{formatNumber(params.value)}</Typography>
          <StockLevelIndicator quantity={params.value} />
        </Box>
      ),
    },
    {
      field: 'difference',
      headerName: '차이',
      width: 100,
      align: 'center',
      headerAlign: 'center',
      renderCell: (params: GridRenderCellParams) => {
        const diff = params.value as number;
        if (diff === 0) {
          return <Chip label="일치" size="small" color="success" />;
        }
        return (
          <Chip
            label={`${diff > 0 ? '+' : ''}${diff}`}
            size="small"
            color={Math.abs(diff) > 5 ? 'error' : 'warning'}
            icon={diff > 0 ? <TrendingUp /> : <TrendingDown />}
          />
        );
      },
    },
    {
      field: 'syncStatus',
      headerName: '상태',
      width: 100,
      renderCell: (params: GridRenderCellParams) => {
        const getStatusIcon = () => {
          switch (params.value) {
            case 'synced':
              return <CheckCircle color="success" fontSize="small" />;
            case 'pending':
              return <Warning color="warning" fontSize="small" />;
            case 'error':
              return <ErrorIcon color="error" fontSize="small" />;
            default:
              return null;
          }
        };

        return (
          <Tooltip title={params.row.syncError || ''}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              {getStatusIcon()}
            </Box>
          </Tooltip>
        );
      },
    },
    {
      field: 'lastUpdated',
      headerName: '최종 업데이트',
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
            onClick={() => handleAdjustInventory(params.row.sku)}
          >
            <Edit fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            onClick={() => handleViewHistory(params.row.sku)}
          >
            <History fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            onClick={(e) => {
              setAnchorEl(e.currentTarget);
              setSelectedSku(params.row.sku);
            }}
          >
            <MoreVert fontSize="small" />
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
          재고 관리
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<Download />}
            onClick={handleExport}
          >
            내보내기
          </Button>
          <Button
            variant="contained"
            startIcon={<Sync />}
            onClick={handleSyncAll}
          >
            전체 동기화
          </Button>
        </Box>
      </Box>

      {/* Summary Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                전체 SKU
              </Typography>
              <Typography variant="h4">
                {formatNumber(displayItems.length)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                재고 부족
              </Typography>
              <Typography variant="h4" color="warning.main">
                {formatNumber(displayLowStock.length)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                품절
              </Typography>
              <Typography variant="h4" color="error.main">
                {formatNumber(displayOutOfStock.length)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                불일치
              </Typography>
              <Typography variant="h4" color="info.main">
                {formatNumber(displayItems.filter(i => i.difference !== 0).length)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Tabs and Search */}
      <Paper sx={{ mb: 2 }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={tabValue} onChange={handleTabChange}>
            <Tab label={`전체 (${displayItems.length})`} />
            <Tab 
              label={
                <Badge badgeContent={displayLowStock.length} color="warning">
                  재고 부족
                </Badge>
              } 
            />
            <Tab 
              label={
                <Badge badgeContent={displayOutOfStock.length} color="error">
                  품절
                </Badge>
              } 
            />
            <Tab 
              label={
                <Badge badgeContent={displayItems.filter(i => i.difference !== 0).length} color="info">
                  불일치
                </Badge>
              } 
            />
          </Tabs>
        </Box>
        <Box sx={{ p: 2 }}>
          <TextField
            placeholder="SKU, 상품명으로 검색..."
            value={searchTerm}
            onChange={handleSearch}
            size="small"
            fullWidth
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search />
                </InputAdornment>
              ),
            }}
          />
        </Box>
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Data Grid */}
      <Paper sx={{ height: 600 }}>
        {loading && <LinearProgress />}
        <DataGrid
          rows={getFilteredItems()}
          columns={columns}
          loading={loading}
          getRowId={(row) => row.sku}
          paginationModel={{ page, pageSize }}
          onPaginationModelChange={(model) => {
            setPage(model.page);
            setPageSize(model.pageSize);
          }}
          pageSizeOptions={[10, 20, 50, 100]}
          disableRowSelectionOnClick
          sx={{
            '& .MuiDataGrid-row': {
              '&:hover': {
                backgroundColor: 'action.hover',
              },
            },
          }}
        />
      </Paper>

      {/* Context Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
      >
        <MenuItem onClick={() => {
          handleAdjustInventory(selectedSku!);
          setAnchorEl(null);
        }}>
          재고 조정
        </MenuItem>
        <MenuItem onClick={() => {
          handleViewHistory(selectedSku!);
          setAnchorEl(null);
        }}>
          이력 보기
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => {
          // 강제 동기화
          setAnchorEl(null);
        }}>
          강제 동기화
        </MenuItem>
      </Menu>

      {/* Dialogs */}
      <InventoryAdjustDialog
        open={adjustDialogOpen}
        onClose={() => setAdjustDialogOpen(false)}
        sku={selectedSku}
        currentNaverQuantity={displayItems.find(i => i.sku === selectedSku)?.naverQuantity || 0}
        currentShopifyQuantity={displayItems.find(i => i.sku === selectedSku)?.shopifyQuantity || 0}
        onAdjust={async (data) => {
          console.log('재고 조정 데이터:', data);
          // 실제 API 호출 로직
          if (dispatch && adjustInventory) {
            await dispatch(adjustInventory(data)).unwrap();
          }
          setAdjustDialogOpen(false);
          // 재고 목록 새로고침
          if (dispatch && fetchInventoryStatus) {
            dispatch(fetchInventoryStatus({ page: page + 1, limit: pageSize }));
          }
        }}
      />

      <InventoryHistoryDialog
        open={historyDialogOpen}
        onClose={() => setHistoryDialogOpen(false)}
        sku={selectedSku}
      />
    </Box>
  );
};

export default Inventory;