// packages/frontend/src/pages/Inventory/index.tsx
import React, { useEffect, useState } from 'react';
import {
  Box,
  Paper,
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
} from '@mui/material';
import {
  Search,
  FilterList,
  Download,
  Sync,
  Warning,
  CheckCircle,
  Error,
  MoreVert,
  TrendingUp,
  TrendingDown,
  Remove,
} from '@mui/icons-material';
import { DataGrid, GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import { useAppDispatch, useAppSelector } from '@/hooks';
import {
  fetchInventoryStatus,
  fetchInventoryHistory,
  adjustInventory,
} from '@/store/slices/inventorySlice';
import { formatNumber, formatDateTime } from '@/utils/formatters';
import InventoryAdjustDialog from '@/components/Dialogs/InventoryAdjustDialog';
import InventoryHistoryDialog from '@/components/Dialogs/InventoryHistoryDialog';
import StockLevelIndicator from '@/components/StockLevelIndicator';

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

const Inventory: React.FC = () => {
  const dispatch = useAppDispatch();
  const { items, loading, error, lowStockItems, outOfStockItems } = useAppSelector(
    (state) => state.inventory
  );

  const [tabValue, setTabValue] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSku, setSelectedSku] = useState<string | null>(null);
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    dispatch(fetchInventoryStatus({ page: page + 1, limit: pageSize, search: searchTerm }));
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
    dispatch(fetchInventoryHistory(sku));
    setHistoryDialogOpen(true);
  };

  const handleSyncAll = () => {
    dispatch(fetchInventoryStatus({ page: 1, limit: pageSize, forceSync: true }));
  };

  const handleExport = () => {
    const csv = items.map(item => 
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
        return lowStockItems;
      case 2:
        return outOfStockItems;
      case 3:
        return items.filter(item => item.difference !== 0);
      default:
        return items;
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
              return <Error color="error" fontSize="small" />;
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
                {formatNumber(items.length)}
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
                {formatNumber(lowStockItems.length)}
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
                {formatNumber(outOfStockItems.length)}
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
                {formatNumber(items.filter(i => i.difference !== 0).length)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Tabs and Search */}
      <Paper sx={{ mb: 2 }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={tabValue} onChange={handleTabChange}>
            <Tab label={`전체 (${items.length})`} />
            <Tab 
              label={
                <Badge badgeContent={lowStockItems.length} color="warning">
                  재고 부족
                </Badge>
              } 
            />
            <Tab 
              label={
                <Badge badgeContent={outOfStockItems.length} color="error">
                  품절
                </Badge>
              } 
            />
            <Tab 
              label={
                <Badge badgeContent={items.filter(i => i.difference !== 0).length} color="info">
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
        currentQuantity={items.find(i => i.sku === selectedSku)?.naverQuantity || 0}
        onAdjust={async (data) => {
          await dispatch(adjustInventory(data)).unwrap();
          setAdjustDialogOpen(false);
          dispatch(fetchInventoryStatus({ page: page + 1, limit: pageSize }));
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