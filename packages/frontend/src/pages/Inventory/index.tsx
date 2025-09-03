// packages/frontend/src/pages/Inventory/index.tsx
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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Tooltip,
  Alert,
  Grid,
  Card,
  CardContent,
} from '@mui/material';
import {
  Search,
  Refresh,
  Warning,
  History,
  Edit,
  FileDownload,
  TrendingUp,
  TrendingDown,
  Remove,
} from '@mui/icons-material';
import { useAppDispatch, useAppSelector } from '@/hooks';
import { inventoryService } from '@/services/api/inventory.service';
import { useNotification } from '@/hooks/useNotification';
import InventoryAdjustDialog from './InventoryAdjustDialog';
import InventoryHistoryDialog from './InventoryHistoryDialog';
import { formatNumber } from '@/utils/formatters';

interface InventoryItem {
  _id: string;
  sku: string;
  productName: string;
  naverStock: number;
  shopifyStock: number;
  difference: number;
  status: 'normal' | 'warning' | 'error';
  lastSyncAt: string;
  syncStatus: 'synced' | 'pending' | 'error';
}

interface InventorySummary {
  totalSku: number;
  normalCount: number;
  warningCount: number;
  errorCount: number;
}

const Inventory: React.FC = () => {
  const dispatch = useAppDispatch();
  const { showNotification } = useNotification();

  // State
  const [inventories, setInventories] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [stockFilter, setStockFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [totalCount, setTotalCount] = useState(0);
  const [summary, setSummary] = useState<InventorySummary>({
    totalSku: 0,
    normalCount: 0,
    warningCount: 0,
    errorCount: 0,
  });

  // Dialogs
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [selectedInventory, setSelectedInventory] = useState<InventoryItem | null>(null);

  // 재고 목록 로드
  const loadInventories = async () => {
    setLoading(true);
    try {
      const params = {
        page: page + 1,
        limit: rowsPerPage,
        search: searchTerm,
        status: statusFilter === 'all' ? undefined : statusFilter,
        stockLevel: stockFilter === 'all' ? undefined : stockFilter,
      };
      
      console.log('Loading inventories with params:', params);
      const response = await inventoryService.getInventoryList(params);
      console.log('Inventories response:', response);

      // API 응답에서 데이터 파싱
      console.log('Raw response:', response);
      
      let inventoryData = [];
      let pagination = {};
      let summaryData = {};
      
      // Service에서 정규화된 응답을 받음
      if (response?.success && response?.data) {
        inventoryData = response.data;
        pagination = response.pagination || {};
        summaryData = response.summary || {};
      } else {
        console.warn('Unexpected response structure:', response);
        inventoryData = [];
      }
      
      const totalData = pagination.total || inventoryData.length || 0;
      
      console.log('Parsed inventoryData:', inventoryData);
      console.log('Parsed pagination:', pagination);

      // 각 항목에서 재고 정보 추출
      const processedInventories = inventoryData.map((item: any) => ({
        _id: item._id || item.sku,
        sku: item.sku,
        productName: item.productName || item.title || '',
        naverStock: item.naverStock || 0,
        shopifyStock: item.shopifyStock || 0,
        difference: (item.naverStock || 0) - (item.shopifyStock || 0), // 차이값 (음수 가능)
        status: item.status || ((item.naverStock === 0 || item.shopifyStock === 0) ? 'error' : 
                (item.naverStock <= 10 || item.shopifyStock <= 10) ? 'warning' : 'normal'),
        lastSyncAt: item.lastSyncedAt || item.lastSync || item.updatedAt || new Date().toISOString(),
        syncStatus: item.syncStatus || 'synced'
      }));

      setInventories(processedInventories);
      setTotalCount(totalData);

      // 요약 정보 계산
      const calculatedSummary = {
        totalSku: totalData,
        normalCount: processedInventories.filter(i => i.status === 'normal').length,
        warningCount: processedInventories.filter(i => i.status === 'warning').length,
        errorCount: processedInventories.filter(i => i.status === 'error').length,
      };
      setSummary(calculatedSummary);
    } catch (error) {
      console.error('Error loading inventories:', error);
      showNotification('재고 목록을 불러오는데 실패했습니다.', 'error');
      setInventories([]);
    } finally {
      setLoading(false);
    }
  };

  // 초기 로드 및 필터 변경 시 재로드
  useEffect(() => {
    loadInventories();
  }, [page, rowsPerPage, statusFilter, stockFilter]);

  // 검색어 디바운싱
  useEffect(() => {
    const timer = setTimeout(() => {
      if (page === 0) {
        loadInventories();
      } else {
        setPage(0);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  // 재고 조정
  const handleAdjustInventory = (inventory: InventoryItem) => {
    setSelectedInventory(inventory);
    setAdjustDialogOpen(true);
  };

  // 이력 보기
  const handleViewHistory = (inventory: InventoryItem) => {
    setSelectedInventory(inventory);
    setHistoryDialogOpen(true);
  };

  // 재고 동기화
  const handleSyncInventory = async () => {
    setLoading(true);
    try {
      await inventoryService.syncInventory();
      showNotification('재고 동기화가 시작되었습니다.', 'success');
      setTimeout(() => loadInventories(), 2000);
    } catch (error) {
      showNotification('재고 동기화에 실패했습니다.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // 재고 내보내기
  const handleExportInventory = async () => {
    try {
      const response = await inventoryService.exportInventory();
      const blob = new Blob([response.data], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `inventory_${new Date().toISOString().split('T')[0]}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      showNotification('재고 내보내기에 실패했습니다.', 'error');
    }
  };

  // 상태 칩 렌더링
  const renderStatusChip = (status: string) => {
    const config = {
      normal: { color: 'success' as const, label: '정상' },
      warning: { color: 'warning' as const, label: '부족' },
      error: { color: 'error' as const, label: '품절' },
      synced: { color: 'success' as const, label: '동기화됨' },
      pending: { color: 'warning' as const, label: '대기중' },
    };

    const { color, label } = config[status] || { color: 'default' as const, label: status };
    return <Chip size="small" color={color} label={label} />;
  };

  // 재고 차이 렌더링
  const renderDifference = (diff: number) => {
    if (diff === 0) {
      return (
        <Box display="flex" alignItems="center" justifyContent="center">
          <Remove fontSize="small" color="disabled" />
          <Typography variant="body2" color="text.disabled" ml={0.5}>0</Typography>
        </Box>
      );
    }
    const absDiff = Math.abs(diff);
    return diff > 0 ? (
      <Box display="flex" alignItems="center" justifyContent="center" color="warning.main">
        <TrendingUp fontSize="small" />
        <Typography variant="body2" ml={0.5}>+{absDiff}</Typography>
      </Box>
    ) : (
      <Box display="flex" alignItems="center" justifyContent="center" color="info.main">
        <TrendingDown fontSize="small" />
        <Typography variant="body2" ml={0.5}>-{absDiff}</Typography>
      </Box>
    );
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        재고 관리
      </Typography>

      {/* 요약 카드 */}
      <Grid container spacing={3} mb={3}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                전체 SKU
              </Typography>
              <Typography variant="h4">
                {formatNumber(summary.totalSku)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                정상 재고
              </Typography>
              <Typography variant="h4" color="success.main">
                {formatNumber(summary.normalCount)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                재고 부족
              </Typography>
              <Typography variant="h4" color="warning.main">
                {formatNumber(summary.warningCount)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                품절
              </Typography>
              <Typography variant="h4" color="error.main">
                {formatNumber(summary.errorCount)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* 필터 및 액션 */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Box display="flex" gap={2} flexWrap="wrap" alignItems="center" justifyContent="space-between">
          <Box display="flex" gap={2} flexWrap="wrap" alignItems="center">
            <TextField
              size="small"
              placeholder="SKU 또는 상품명 검색"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Search />
                  </InputAdornment>
                ),
              }}
              sx={{ minWidth: 250 }}
            />
            
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>상태</InputLabel>
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                label="상태"
              >
                <MenuItem value="all">전체</MenuItem>
                <MenuItem value="normal">정상</MenuItem>
                <MenuItem value="warning">부족</MenuItem>
                <MenuItem value="error">품절</MenuItem>
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>재고 수준</InputLabel>
              <Select
                value={stockFilter}
                onChange={(e) => setStockFilter(e.target.value)}
                label="재고 수준"
              >
                <MenuItem value="all">전체</MenuItem>
                <MenuItem value="inStock">재고 있음</MenuItem>
                <MenuItem value="lowStock">재고 부족</MenuItem>
                <MenuItem value="outOfStock">품절</MenuItem>
              </Select>
            </FormControl>
          </Box>

          <Box display="flex" gap={1}>
            <Button
              variant="outlined"
              startIcon={<FileDownload />}
              onClick={handleExportInventory}
            >
              내보내기
            </Button>
            <Button
              variant="contained"
              startIcon={<Refresh />}
              onClick={handleSyncInventory}
              disabled={loading}
            >
              동기화
            </Button>
          </Box>
        </Box>
      </Paper>

      {/* 재고 테이블 */}
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>SKU</TableCell>
              <TableCell>상품명</TableCell>
              <TableCell align="center">네이버 재고</TableCell>
              <TableCell align="center">Shopify 재고</TableCell>
              <TableCell align="center">차이</TableCell>
              <TableCell align="center">상태</TableCell>
              <TableCell align="center">동기화 상태</TableCell>
              <TableCell>마지막 동기화</TableCell>
              <TableCell align="right">작업</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && inventories.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} align="center">
                  <Typography variant="body2" color="text.secondary">
                    로딩 중...
                  </Typography>
                </TableCell>
              </TableRow>
            ) : inventories.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} align="center">
                  <Typography variant="body2" color="text.secondary">
                    재고 데이터가 없습니다.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              inventories.map((inventory) => (
                <TableRow key={inventory._id} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight="medium">
                      {inventory.sku}
                    </Typography>
                  </TableCell>
                  <TableCell>{inventory.productName}</TableCell>
                  <TableCell align="center">{formatNumber(inventory.naverStock)}</TableCell>
                  <TableCell align="center">{formatNumber(inventory.shopifyStock)}</TableCell>
                  <TableCell align="center">
                    {renderDifference(inventory.difference)}
                  </TableCell>
                  <TableCell align="center">
                    {renderStatusChip(inventory.status)}
                  </TableCell>
                  <TableCell align="center">
                    {renderStatusChip(inventory.syncStatus)}
                  </TableCell>
                  <TableCell>
                    <Tooltip title={new Date(inventory.lastSyncAt).toLocaleString()}>
                      <Typography variant="caption">
                        {new Date(inventory.lastSyncAt).toLocaleDateString()}
                      </Typography>
                    </Tooltip>
                  </TableCell>
                  <TableCell align="right">
                    <Box display="flex" gap={1} justifyContent="flex-end">
                      <Tooltip title="재고 조정">
                        <IconButton
                          size="small"
                          onClick={() => handleAdjustInventory(inventory)}
                        >
                          <Edit fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="이력 보기">
                        <IconButton
                          size="small"
                          onClick={() => handleViewHistory(inventory)}
                        >
                          <History fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <TablePagination
          component="div"
          count={totalCount}
          page={page}
          onPageChange={(_, newPage) => setPage(newPage)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => {
            setRowsPerPage(parseInt(e.target.value, 10));
            setPage(0);
          }}
          rowsPerPageOptions={[10, 20, 50, 100]}
          labelRowsPerPage="페이지당 행:"
        />
      </TableContainer>

      {/* 재고 조정 다이얼로그 */}
      {selectedInventory && (
        <InventoryAdjustDialog
          open={adjustDialogOpen}
          onClose={() => {
            setAdjustDialogOpen(false);
            setSelectedInventory(null);
          }}
          inventory={selectedInventory}
          onSuccess={() => {
            loadInventories();
            showNotification('재고가 조정되었습니다.', 'success');
          }}
        />
      )}

      {/* 재고 이력 다이얼로그 */}
      {selectedInventory && (
        <InventoryHistoryDialog
          open={historyDialogOpen}
          onClose={() => {
            setHistoryDialogOpen(false);
            setSelectedInventory(null);
          }}
          sku={selectedInventory.sku}
          productName={selectedInventory.productName}
        />
      )}
    </Box>
  );
};

export default Inventory;