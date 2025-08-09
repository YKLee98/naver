// packages/frontend/src/pages/SkuMapping/index.tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  Container,
  Box,
  Typography,
  Button,
  TextField,
  InputAdornment,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  IconButton,
  Chip,
  Stack,
  Card,
  CardContent,
  Grid,
  Tooltip,
  Alert,
  CircularProgress,
  Menu,
  MenuItem,
  Checkbox,
  FormControlLabel,
  Divider,
} from '@mui/material';
import {
  Add as AddIcon,
  Search as SearchIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Sync as SyncIcon,
  MoreVert as MoreVertIcon,
  FileDownload as DownloadIcon,
  FileUpload as UploadIcon,
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  Refresh as RefreshIcon,
  FilterList as FilterIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useNotification } from '@/hooks/useNotification';
import { mappingService } from '@/services/api/mapping.service';
import AddMappingDialog from './AddMappingDialog';

interface MappingData {
  _id: string;
  sku: string;
  naverProductId: string;
  shopifyProductId: string;
  shopifyVariantId?: string;
  productName?: string;
  vendor?: string;
  priceMargin: number;
  isActive: boolean;
  status?: string;
  syncStatus?: string;
  lastSyncAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

interface Stats {
  total: number;
  active: number;
  inactive: number;
  error: number;
  pending: number;
  syncNeeded: number;
}

const SkuMapping: React.FC = () => {
  const navigate = useNavigate();
  const { showNotification } = useNotification();

  // State
  const [mappings, setMappings] = useState<MappingData[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [totalCount, setTotalCount] = useState(0);
  const [stats, setStats] = useState<Stats>({
    total: 0,
    active: 0,
    inactive: 0,
    error: 0,
    pending: 0,
    syncNeeded: 0,
  });

  // Dialog states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedMapping, setSelectedMapping] = useState<MappingData | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  // Filters
  const [filters, setFilters] = useState({
    status: '',
    isActive: '',
    syncStatus: '',
    vendor: '',
  });

  // 매핑 목록 조회
  const loadMappings = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        page: page + 1, // API는 1부터 시작
        limit: rowsPerPage,
        search: search || undefined,
        sortBy: 'updatedAt',
        order: 'desc' as const,
        ...(filters.status && { status: filters.status }),
        ...(filters.isActive && { isActive: filters.isActive === 'true' }),
        ...(filters.syncStatus && { syncStatus: filters.syncStatus }),
        ...(filters.vendor && { vendor: filters.vendor }),
      };

      console.log('Loading mappings with params:', params);

      const response = await mappingService.getMappings(params);
      const data = response.data.data;
      
      console.log('Loaded mappings response:', data);

      setMappings(data.mappings || []);
      setTotalCount(data.pagination?.total || 0);
      
      if (data.stats) {
        setStats(data.stats);
      }
    } catch (error) {
      console.error('Failed to load mappings:', error);
      showNotification('매핑 목록을 불러오는데 실패했습니다.', 'error');
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, search, filters, showNotification]);

  // 페이지 로드 시 매핑 목록 조회
  useEffect(() => {
    loadMappings();
  }, [loadMappings]);

  // 매핑 저장 핸들러
  const handleSaveMapping = async (data: any) => {
    try {
      console.log('Mapping saved successfully, refreshing list...');
      
      // 리스트 새로고침
      await loadMappings();
      
      // 다이얼로그 닫기
      setDialogOpen(false);
      setSelectedMapping(null);
    } catch (error) {
      console.error('Error refreshing after save:', error);
    }
  };

  // 새 매핑 추가
  const handleAddMapping = () => {
    setSelectedMapping(null);
    setDialogOpen(true);
  };

  // 매핑 수정
  const handleEditMapping = (mapping: MappingData) => {
    setSelectedMapping(mapping);
    setDialogOpen(true);
  };

  // 매핑 삭제
  const handleDeleteMapping = async (id: string) => {
    if (!window.confirm('정말로 이 매핑을 삭제하시겠습니까?')) {
      return;
    }

    try {
      await mappingService.deleteMapping(id);
      showNotification('매핑이 삭제되었습니다.', 'success');
      await loadMappings();
    } catch (error) {
      console.error('Failed to delete mapping:', error);
      showNotification('매핑 삭제에 실패했습니다.', 'error');
    }
  };

  // 매핑 동기화
  const handleSyncMapping = async (id: string) => {
    try {
      await mappingService.syncMapping(id);
      showNotification('동기화가 시작되었습니다.', 'info');
      await loadMappings();
    } catch (error) {
      console.error('Failed to sync mapping:', error);
      showNotification('동기화에 실패했습니다.', 'error');
    }
  };

  // 일괄 삭제
  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) {
      showNotification('삭제할 항목을 선택해주세요.', 'warning');
      return;
    }

    if (!window.confirm(`선택한 ${selectedIds.length}개 항목을 삭제하시겠습니까?`)) {
      return;
    }

    try {
      await mappingService.bulkDelete(selectedIds);
      showNotification(`${selectedIds.length}개 항목이 삭제되었습니다.`, 'success');
      setSelectedIds([]);
      await loadMappings();
    } catch (error) {
      console.error('Failed to bulk delete:', error);
      showNotification('일괄 삭제에 실패했습니다.', 'error');
    }
  };

  // 페이지 변경
  const handleChangePage = (event: unknown, newPage: number) => {
    setPage(newPage);
  };

  // 페이지 크기 변경
  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  // 검색
  const handleSearch = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(event.target.value);
    setPage(0);
  };

  // 전체 선택
  const handleSelectAll = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.checked) {
      setSelectedIds(mappings.map(m => m._id));
    } else {
      setSelectedIds([]);
    }
  };

  // 개별 선택
  const handleSelectOne = (id: string) => {
    const selectedIndex = selectedIds.indexOf(id);
    let newSelected: string[] = [];

    if (selectedIndex === -1) {
      newSelected = newSelected.concat(selectedIds, id);
    } else if (selectedIndex === 0) {
      newSelected = newSelected.concat(selectedIds.slice(1));
    } else if (selectedIndex === selectedIds.length - 1) {
      newSelected = newSelected.concat(selectedIds.slice(0, -1));
    } else if (selectedIndex > 0) {
      newSelected = newSelected.concat(
        selectedIds.slice(0, selectedIndex),
        selectedIds.slice(selectedIndex + 1)
      );
    }

    setSelectedIds(newSelected);
  };

  // 상태별 색상 가져오기
  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'success';
      case 'PENDING':
        return 'warning';
      case 'ERROR':
        return 'error';
      default:
        return 'default';
    }
  };

  // 동기화 상태별 색상
  const getSyncStatusColor = (syncStatus?: string) => {
    switch (syncStatus) {
      case 'synced':
        return 'success';
      case 'pending':
        return 'warning';
      case 'failed':
        return 'error';
      default:
        return 'default';
    }
  };

  return (
    <Container maxWidth="xl">
      <Box sx={{ py: 3 }}>
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography variant="h4" fontWeight="bold">
            SKU 매핑 관리
          </Typography>
          <Stack direction="row" spacing={2}>
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={loadMappings}
              disabled={loading}
            >
              새로고침
            </Button>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={handleAddMapping}
            >
              새 매핑 추가
            </Button>
          </Stack>
        </Box>

        {/* Stats Cards */}
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6} md={2}>
            <Card>
              <CardContent sx={{ textAlign: 'center', py: 2 }}>
                <Typography variant="h4">{stats.total}</Typography>
                <Typography variant="body2" color="text.secondary">
                  전체 매핑
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <Card>
              <CardContent sx={{ textAlign: 'center', py: 2 }}>
                <Typography variant="h4" color="success.main">
                  {stats.active}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  활성 매핑
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <Card>
              <CardContent sx={{ textAlign: 'center', py: 2 }}>
                <Typography variant="h4" color="text.disabled">
                  {stats.inactive}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  비활성 매핑
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <Card>
              <CardContent sx={{ textAlign: 'center', py: 2 }}>
                <Typography variant="h4" color="error.main">
                  {stats.error}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  오류 매핑
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <Card>
              <CardContent sx={{ textAlign: 'center', py: 2 }}>
                <Typography variant="h4" color="warning.main">
                  {stats.pending}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  대기 중
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <Card>
              <CardContent sx={{ textAlign: 'center', py: 2 }}>
                <Typography variant="h4" color="info.main">
                  {stats.syncNeeded}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  동기화 필요
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Search and Actions Bar */}
        <Paper sx={{ p: 2, mb: 3 }}>
          <Stack direction="row" spacing={2} alignItems="center">
            <TextField
              placeholder="SKU, 상품명으로 검색..."
              value={search}
              onChange={handleSearch}
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
            
            {selectedIds.length > 0 && (
              <>
                <Divider orientation="vertical" flexItem />
                <Typography variant="body2" color="text.secondary">
                  {selectedIds.length}개 선택됨
                </Typography>
                <Button
                  size="small"
                  color="error"
                  onClick={handleBulkDelete}
                >
                  선택 삭제
                </Button>
              </>
            )}
          </Stack>
        </Paper>

        {/* Table */}
        <TableContainer component={Paper}>
          {loading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
              <CircularProgress />
            </Box>
          )}
          
          {!loading && (
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox">
                    <Checkbox
                      indeterminate={selectedIds.length > 0 && selectedIds.length < mappings.length}
                      checked={mappings.length > 0 && selectedIds.length === mappings.length}
                      onChange={handleSelectAll}
                    />
                  </TableCell>
                  <TableCell>SKU</TableCell>
                  <TableCell>상품명</TableCell>
                  <TableCell>네이버 ID</TableCell>
                  <TableCell>Shopify ID</TableCell>
                  <TableCell>벤더</TableCell>
                  <TableCell align="center">마진(%)</TableCell>
                  <TableCell align="center">상태</TableCell>
                  <TableCell align="center">동기화</TableCell>
                  <TableCell align="center">활성화</TableCell>
                  <TableCell align="center">작업</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {mappings.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} align="center" sx={{ py: 5 }}>
                      <Typography variant="body1" color="text.secondary">
                        매핑이 없습니다. 새 매핑을 추가해주세요.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  mappings.map((mapping) => (
                    <TableRow
                      key={mapping._id}
                      hover
                      selected={selectedIds.indexOf(mapping._id) !== -1}
                    >
                      <TableCell padding="checkbox">
                        <Checkbox
                          checked={selectedIds.indexOf(mapping._id) !== -1}
                          onChange={() => handleSelectOne(mapping._id)}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight="medium">
                          {mapping.sku}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                          {mapping.productName || '-'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                          {mapping.naverProductId}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                          {mapping.shopifyProductId}
                        </Typography>
                      </TableCell>
                      <TableCell>{mapping.vendor || '-'}</TableCell>
                      <TableCell align="center">
                        {(mapping.priceMargin * 100).toFixed(0)}%
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          label={mapping.status || 'UNKNOWN'}
                          color={getStatusColor(mapping.status) as any}
                          size="small"
                        />
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          label={mapping.syncStatus || 'UNKNOWN'}
                          color={getSyncStatusColor(mapping.syncStatus) as any}
                          size="small"
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          label={mapping.isActive ? '활성' : '비활성'}
                          color={mapping.isActive ? 'success' : 'default'}
                          size="small"
                        />
                      </TableCell>
                      <TableCell align="center">
                        <Stack direction="row" spacing={1} justifyContent="center">
                          <Tooltip title="수정">
                            <IconButton
                              size="small"
                              onClick={() => handleEditMapping(mapping)}
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="동기화">
                            <IconButton
                              size="small"
                              onClick={() => handleSyncMapping(mapping._id)}
                              disabled={mapping.status !== 'ACTIVE'}
                            >
                              <SyncIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="삭제">
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => handleDeleteMapping(mapping._id)}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
          
          <TablePagination
            component="div"
            count={totalCount}
            page={page}
            onPageChange={handleChangePage}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={handleChangeRowsPerPage}
            rowsPerPageOptions={[10, 20, 50, 100]}
            labelRowsPerPage="페이지당 행 수:"
            labelDisplayedRows={({ from, to, count }) =>
              `${from}-${to} / 전체 ${count}개`
            }
          />
        </TableContainer>

        {/* Add/Edit Mapping Dialog */}
        <AddMappingDialog
          open={dialogOpen}
          onClose={() => {
            setDialogOpen(false);
            setSelectedMapping(null);
          }}
          onSave={handleSaveMapping}
          initialData={selectedMapping}
        />
      </Box>
    </Container>
  );
};

export default SkuMapping;