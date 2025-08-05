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
      const response = await inventoryService.getInventoryList({
        page: page + 1,
        limit: rowsPerPage,
        search: searchTerm,
        status: statusFilter === 'all' ? undefined : statusFilter,
        stockLevel: stockFilter === 'all' ? undefined : stockFilter,
      });

      setInventories(response.data.inventories);
      setTotalCount(response.data.pagination.total);
      setSummary(response.data.summary);
    } catch (error) {
      showNotification('재고 목록을 불러오는데 실패했습니다.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInventories();
  }, [page, rowsPerPage, searchTerm, statusFilter, stockFilter]);

  // 자동 새로고침 (30초마다)
  useEffect(() => {
    const interval = setInterval(() => {
      loadInventories();
    }, 30000);

    return () => clearInterval(interval);
  }, [page, rowsPerPage, searchTerm, statusFilter, stockFilter]);

  // 재고 조정
  const handleAdjustInventory = (inventory: InventoryItem) => {
    setSelectedInventory(inventory);
    setAdjustDialogOpen(true);
  };

  // 재고 이력 보기
  const handleViewHistory = (inventory: InventoryItem) => {
    setSelectedInventory(inventory);
    setHistoryDialogOpen(true);
  };

  // 재고 조정 완료
  const handleAdjustComplete = () => {
    setAdjustDialogOpen(false);
    loadInventories();
    showNotification('재고가 조정되었습니다.', 'success');
  };

  // 엑셀 다운로드
  const handleExportExcel = async () => {
    try {
      const response = await inventoryService.exportInventory({
        search: searchTerm,
        status: statusFilter === 'all' ? undefined : statusFilter,
        stockLevel: stockFilter === 'all' ? undefined : stockFilter,
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `inventory-${new Date().toISOString().split('T')[0]}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      showNotification('엑셀 다운로드에 실패했습니다.', 'error');
    }
  };

  // 상태 아이콘 렌더링
  const renderStatusIcon = (difference: number) => {
    if (difference === 0) {
      return <Remove color="success" />;
    } else if (difference > 0) {
      return <TrendingUp color="error" />;
    } else {
      return <TrendingDown color="error" />;
    }
  };

  // 상태 칩 렌더링
  const renderStatusChip = (status: string) => {
    const statusConfig = {
      normal: { label: '정상', color: 'success' as const },
      warning: { label: '주의', color: 'warning' as const },
      error: { label: '오류', color: 'error' as const },
    };

    const config = statusConfig[status] || { label: status, color: 'default' as const };

    return <Chip label={config.label} color={config.color} size="small" />;
  };

  return (
    <Box>
      {/* 헤더 */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" gutterBottom>
          재고 관리
        </Typography>
        <Typography variant="body2" color="text.secondary">
          네이버와 Shopify의 재고를 실시간으로 확인하고 조정합니다.
        </Typography>
      </Box>

      {/* 요약 카드 */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography color="text.secondary" gutterBottom>
                총 SKU
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
                정상
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
                주의
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
                오류
              </Typography>
              <Typography variant="h4" color="error.main">
                {formatNumber(summary.errorCount)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* 필터 바 */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
          <TextField
            size="small"
            placeholder="SKU, 상품명 검색"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search />
                </InputAdornment>
              ),
            }}
            sx={{ flex: 1, minWidth: 300 }}
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
              <MenuItem value="warning">주의</MenuItem>
              <MenuItem value="error">오류</MenuItem>
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
              <MenuItem value="low">재고 부족</MenuItem>
              <MenuItem value="out">품절</MenuItem>
              <MenuItem value="excess">재고 과다</MenuItem>
            </Select>
          </FormControl>

          <Box sx={{ flexGrow: 1 }} />

          <Button
            variant="outlined"
            startIcon={<FileDownload />}
            onClick={handleExportExcel}
          >
            엑셀 다운로드
          </Button>

          <IconButton onClick={loadInventories} disabled={loading}>
            <Refresh />
          </IconButton>
        </Box>
      </Paper>

      {/* 재고 테이블 */}
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>SKU</TableCell>
              <TableCell>상품명</TableCell>
              <TableCell align="right">네이버</TableCell>
              <TableCell align="right">Shopify</TableCell>
              <TableCell align="center">차이</TableCell>
              <TableCell align="center">상태</TableCell>
              <TableCell>마지막 동기화</TableCell>
              <TableCell align="center">작업</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {inventories.map((inventory) => (
              <TableRow key={inventory._id} hover>
                <TableCell>
                  <Typography variant="body2" fontWeight="medium">
                    {inventory.sku}
                  </Typography>
                </TableCell>
                <TableCell>{inventory.productName}</TableCell>
                <TableCell align="right">
                  <Typography
                    variant="body2"
                    color={inventory.naverStock < 10 ? 'error' : 'inherit'}
                  >
                    {formatNumber(inventory.naverStock)}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography
                    variant="body2"
                    color={inventory.shopifyStock < 10 ? 'error' : 'inherit'}
                  >
                    {formatNumber(inventory.shopifyStock)}
                  </Typography>
                </TableCell>
                <TableCell align="center">
                  <Box display="flex" alignItems="center" justifyContent="center" gap={1}>
                    {renderStatusIcon(inventory.difference)}
                    <Typography
                      variant="body2"
                      color={inventory.difference !== 0 ? 'error' : 'success.main'}
                    >
                      {inventory.difference !== 0 && inventory.difference > 0 && '+'}
                      {inventory.difference}
                    </Typography>
                  </Box>
                </TableCell>
                <TableCell align="center">
                  {renderStatusChip(inventory.status)}
                </TableCell>
                <TableCell>
                  <Typography variant="body2" color="text.secondary">
                    {new Date(inventory.lastSyncAt).toLocaleString()}
                  </Typography>
                </TableCell>
                <TableCell align="center">
                  <Tooltip title="재고 조정">
                    <IconButton
                      size="small"
                      onClick={() => handleAdjustInventory(inventory)}
                    >
                      <Edit />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="이력 보기">
                    <IconButton
                      size="small"
                      onClick={() => handleViewHistory(inventory)}
                    >
                      <History />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <TablePagination
          component="div"
          count={totalCount}
          page={page}
          onPageChange={(e, newPage) => setPage(newPage)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => {
            setRowsPerPage(parseInt(e.target.value, 10));
            setPage(0);
          }}
          rowsPerPageOptions={[10, 20, 50, 100]}
          labelRowsPerPage="페이지당 행:"
        />
      </TableContainer>

      {/* 재고 부족 경고 */}
      {summary.warningCount > 0 && (
        <Alert severity="warning" sx={{ mt: 2 }} icon={<Warning />}>
          재고 부족 상품이 {summary.warningCount}개 있습니다. 확인이 필요합니다.
        </Alert>
      )}

      {/* 다이얼로그 */}
      {selectedInventory && (
        <>
          <InventoryAdjustDialog
            open={adjustDialogOpen}
            onClose={() => setAdjustDialogOpen(false)}
            inventory={selectedInventory}
            onSuccess={handleAdjustComplete}
          />

          <InventoryHistoryDialog
            open={historyDialogOpen}
            onClose={() => setHistoryDialogOpen(false)}
            sku={selectedInventory.sku}
          />
        </>
      )}
    </Box>
  );
};

export default Inventory;