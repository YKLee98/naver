// packages/frontend/src/pages/Inventory/InventoryHistoryDialog.tsx
import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  IconButton,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  LinearProgress,
  Alert,
} from '@mui/material';
import {
  Close,
  FileDownload,
  TrendingUp,
  TrendingDown,
  SwapHoriz,
  Refresh,
  ShoppingCart,
  Replay,
} from '@mui/icons-material';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { ko } from 'date-fns/locale';
import { format } from 'date-fns';
import { inventoryService } from '@/services/api/inventory.service';
import { useNotification } from '@/hooks/useNotification';
import { formatNumber } from '@/utils/formatters';

interface InventoryHistoryDialogProps {
  open: boolean;
  onClose: () => void;
  sku: string;
}

interface HistoryItem {
  _id: string;
  timestamp: string;
  type: 'sale' | 'adjustment' | 'return' | 'sync';
  platform: 'naver' | 'shopify' | 'both';
  previousStock: number;
  change: number;
  newStock: number;
  reason?: string;
  notes?: string;
  userId?: string;
  orderId?: string;
}

const InventoryHistoryDialog: React.FC<InventoryHistoryDialogProps> = ({
  open,
  onClose,
  sku,
}) => {
  const { showNotification } = useNotification();
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [typeFilter, setTypeFilter] = useState('all');
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);

  // 이력 로드
  const loadHistory = async () => {
    setLoading(true);
    try {
      const params: any = {
        page: page + 1,
        limit: 20,
      };

      if (typeFilter !== 'all') {
        params.type = typeFilter;
      }

      if (startDate) {
        params.startDate = format(startDate, 'yyyy-MM-dd');
      }

      if (endDate) {
        params.endDate = format(endDate, 'yyyy-MM-dd');
      }

      const response = await inventoryService.getInventoryHistory(sku, params);
      setHistory(response.data.data.history);
      setTotal(response.data.data.total);
    } catch (error) {
      showNotification('이력을 불러오는데 실패했습니다.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadHistory();
    }
  }, [open, page, typeFilter, startDate, endDate]);

  // 엑셀 내보내기
  const handleExport = async () => {
    try {
      const response = await inventoryService.exportInventory({
        search: sku,
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `inventory-history-${sku}-${format(new Date(), 'yyyyMMdd')}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      showNotification('엑셀 내보내기에 실패했습니다.', 'error');
    }
  };

  // 타입별 아이콘
  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'sale':
        return <ShoppingCart fontSize="small" />;
      case 'adjustment':
        return <SwapHoriz fontSize="small" />;
      case 'return':
        return <Replay fontSize="small" />;
      case 'sync':
        return <Refresh fontSize="small" />;
      default:
        return null;
    }
  };

  // 타입별 칩
  const renderTypeChip = (type: string) => {
    const typeConfig = {
      sale: { label: '판매', color: 'primary' as const },
      adjustment: { label: '조정', color: 'warning' as const },
      return: { label: '반품', color: 'info' as const },
      sync: { label: '동기화', color: 'default' as const },
    };

    const config = typeConfig[type] || { label: type, color: 'default' as const };

    return (
      <Chip
        label={config.label}
        color={config.color}
        size="small"
        icon={getTypeIcon(type)}
      />
    );
  };

  // 플랫폼 칩
  const renderPlatformChip = (platform: string) => {
    const platformConfig = {
      naver: { label: '네이버', color: 'success' as const },
      shopify: { label: 'Shopify', color: 'info' as const },
      both: { label: '전체', color: 'default' as const },
    };

    const config = platformConfig[platform] || { label: platform, color: 'default' as const };

    return <Chip label={config.label} color={config.color} size="small" />;
  };

  // 변동 렌더링
  const renderChange = (change: number) => {
    if (change === 0) {
      return (
        <Typography variant="body2" color="text.secondary">
          -
        </Typography>
      );
    }

    const isPositive = change > 0;
    return (
      <Box display="flex" alignItems="center" gap={0.5}>
        {isPositive ? (
          <TrendingUp color="success" fontSize="small" />
        ) : (
          <TrendingDown color="error" fontSize="small" />
        )}
        <Typography
          variant="body2"
          color={isPositive ? 'success.main' : 'error.main'}
          fontWeight="medium"
        >
          {isPositive && '+'}
          {formatNumber(change)}
        </Typography>
      </Box>
    );
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Typography variant="h6">
            재고 이력 - {sku}
          </Typography>
          <IconButton onClick={onClose} size="small">
            <Close />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent>
        {/* 필터 바 */}
        <Box sx={{ mb: 2, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>유형</InputLabel>
            <Select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setPage(0);
              }}
              label="유형"
            >
              <MenuItem value="all">전체</MenuItem>
              <MenuItem value="sale">판매</MenuItem>
              <MenuItem value="adjustment">조정</MenuItem>
              <MenuItem value="return">반품</MenuItem>
              <MenuItem value="sync">동기화</MenuItem>
            </Select>
          </FormControl>

          <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={ko}>
            <DatePicker
              label="시작일"
              value={startDate}
              onChange={(newValue) => {
                setStartDate(newValue);
                setPage(0);
              }}
              slotProps={{
                textField: {
                  size: 'small',
                  sx: { width: 150 },
                },
              }}
            />
            <DatePicker
              label="종료일"
              value={endDate}
              onChange={(newValue) => {
                setEndDate(newValue);
                setPage(0);
              }}
              slotProps={{
                textField: {
                  size: 'small',
                  sx: { width: 150 },
                },
              }}
            />
          </LocalizationProvider>

          <Box sx={{ flexGrow: 1 }} />

          <Button
            variant="outlined"
            startIcon={<FileDownload />}
            onClick={handleExport}
            size="small"
          >
            엑셀 내보내기
          </Button>
        </Box>

        {/* 로딩 상태 */}
        {loading && <LinearProgress sx={{ mb: 2 }} />}

        {/* 이력 테이블 */}
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>일시</TableCell>
                <TableCell>구분</TableCell>
                <TableCell>플랫폼</TableCell>
                <TableCell align="right">이전</TableCell>
                <TableCell align="center">변동</TableCell>
                <TableCell align="right">이후</TableCell>
                <TableCell>사유</TableCell>
                <TableCell>비고</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {history.map((item) => (
                <TableRow key={item._id} hover>
                  <TableCell>
                    <Typography variant="body2">
                      {format(new Date(item.timestamp), 'MM/dd HH:mm')}
                    </Typography>
                  </TableCell>
                  <TableCell>{renderTypeChip(item.type)}</TableCell>
                  <TableCell>{renderPlatformChip(item.platform)}</TableCell>
                  <TableCell align="right">
                    {formatNumber(item.previousStock)}
                  </TableCell>
                  <TableCell align="center">
                    {renderChange(item.change)}
                  </TableCell>
                  <TableCell align="right">
                    <Typography
                      variant="body2"
                      fontWeight="medium"
                      color={item.newStock < 10 ? 'error' : 'inherit'}
                    >
                      {formatNumber(item.newStock)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" noWrap sx={{ maxWidth: 150 }}>
                      {item.reason || '-'}
                      {item.orderId && ` (#${item.orderId})`}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      noWrap
                      sx={{ maxWidth: 150 }}
                    >
                      {item.notes || '-'}
                    </Typography>
                  </TableCell>
                </TableRow>
              ))}

              {history.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={8} align="center">
                    <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                      이력이 없습니다.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {/* 페이지네이션 */}
        {total > 20 && (
          <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center', gap: 1 }}>
            <Button
              size="small"
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
            >
              이전
            </Button>
            <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', px: 2 }}>
              {page + 1} / {Math.ceil(total / 20)}
            </Typography>
            <Button
              size="small"
              disabled={page >= Math.ceil(total / 20) - 1}
              onClick={() => setPage(page + 1)}
            >
              다음
            </Button>
          </Box>
        )}

        {/* 요약 정보 */}
        {history.length > 0 && (
          <Alert severity="info" sx={{ mt: 2 }}>
            최근 {history.length}건의 이력 중 총 {history.filter(h => h.type === 'sale').length}건의 판매,{' '}
            {history.filter(h => h.type === 'adjustment').length}건의 조정이 있었습니다.
          </Alert>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>닫기</Button>
      </DialogActions>
    </Dialog>
  );
};

export default InventoryHistoryDialog;