// ===== 1. packages/frontend/src/pages/SkuMapping/index.tsx (완전한 엔터프라이즈급 구현) =====
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Container,
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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Checkbox,
  Menu,
  ListItemIcon,
  ListItemText,
  CircularProgress,
  LinearProgress,
  Skeleton,
  Badge,
  Grid,
  Card,
  CardContent,
  Divider,
  Stack,
  Snackbar,
  SnackbarContent,
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
  MoreVert,
  Refresh,
  Check,
  Close,
  Info,
  CloudUpload,
  Visibility,
  VisibilityOff,
  FilterList,
  Settings,
  Speed,
  Inventory,
  AttachMoney,
  Link as LinkIcon,
  BrokenImage,
} from '@mui/icons-material';
import { useAppDispatch, useAppSelector } from '@/hooks';
import { mappingService } from '@/services/api/mapping.service';
import { useNotification } from '@/hooks/useNotification';
import { useDebounce } from '@/hooks/useDebounce';
import AddMappingDialog from './AddMappingDialog';
import BulkUploadDialog from './BulkUploadDialog';
import AutoDiscoverDialog from './AutoDiscoverDialog';
import MappingDetailsDialog from './MappingDetailsDialog';
import { formatDateTime, formatCurrency } from '@/utils/formatters';

interface MappingData {
  _id: string;
  sku: string;
  naverProductId: string;
  shopifyProductId: string;
  shopifyVariantId: string;
  productName: string;
  vendor: string;
  priceMargin: number;
  isActive: boolean;
  status: 'ACTIVE' | 'INACTIVE' | 'ERROR';
  syncStatus: 'synced' | 'pending' | 'error';
  lastSyncedAt?: string;
  syncError?: string;
  metadata?: {
    autoDiscovered?: boolean;
    confidence?: number;
    lastTransaction?: {
      date: string;
      type: string;
    };
  };
  createdAt: string;
  updatedAt: string;
}

interface MappingStats {
  total: number;
  active: number;
  inactive: number;
  error: number;
  pending: number;
  syncNeeded: number;
}

const SkuMapping: React.FC = () => {
  const dispatch = useAppDispatch();
  const { showNotification } = useNotification();
  
  // State
  const [mappings, setMappings] = useState<MappingData[]>([]);
  const [stats, setStats] = useState<MappingStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMappings, setSelectedMappings] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [totalCount, setTotalCount] = useState(0);
  const [statusFilter, setStatusFilter] = useState('all');
  const [syncStatusFilter, setSyncStatusFilter] = useState('all');
  const [vendorFilter, setVendorFilter] = useState('all');
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedMapping, setSelectedMapping] = useState<MappingData | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  
  // Dialogs
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);
  const [autoDiscoverOpen, setAutoDiscoverOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);

  // Debounced search
  const debouncedSearchTerm = useDebounce(searchTerm, 500);

  // 매핑 목록 로드
  const loadMappings = useCallback(async () => {
    setLoading(true);
    try {
      const response = await mappingService.getMappings({
        page: page + 1,
        limit: rowsPerPage,
        search: debouncedSearchTerm,
        status: statusFilter === 'all' ? undefined : statusFilter,
        syncStatus: syncStatusFilter === 'all' ? undefined : syncStatusFilter,
        vendor: vendorFilter === 'all' ? undefined : vendorFilter,
        sortBy: 'updatedAt',
        order: 'desc',
      });

      if (response.data.success) {
        setMappings(response.data.data.mappings);
        setTotalCount(response.data.data.pagination.total);
        setStats(response.data.data.stats);
      }
    } catch (error: any) {
      console.error('Failed to load mappings:', error);
      showNotification('매핑 목록을 불러오는데 실패했습니다.', 'error');
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, debouncedSearchTerm, statusFilter, syncStatusFilter, vendorFilter]);

  // 초기 로드 및 필터 변경 시 재로드
  useEffect(() => {
    loadMappings();
  }, [loadMappings]);

  // 자동 새로고침
  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(() => {
        loadMappings();
      }, 30000); // 30초마다
      return () => clearInterval(interval);
    }
  }, [autoRefresh, loadMappings]);

  // 새 매핑 추가
  const handleAddMapping = () => {
    setSelectedMapping(null);
    setAddDialogOpen(true);
  };

  // 매핑 수정
  const handleEditMapping = (mapping: MappingData) => {
    setSelectedMapping(mapping);
    setEditDialogOpen(true);
  };

  // 매핑 삭제
  const handleDeleteMapping = async (mapping: MappingData) => {
    try {
      await mappingService.deleteMapping(mapping._id);
      showNotification('매핑이 삭제되었습니다.', 'success');
      loadMappings();
    } catch (error) {
      showNotification('매핑 삭제에 실패했습니다.', 'error');
    }
  };

  // 일괄 삭제
  const handleBulkDelete = async () => {
    if (selectedMappings.length === 0) {
      showNotification('삭제할 매핑을 선택해주세요.', 'warning');
      return;
    }

    try {
      await mappingService.bulkDelete(selectedMappings);
      showNotification(`${selectedMappings.length}개 매핑이 삭제되었습니다.`, 'success');
      setSelectedMappings([]);
      loadMappings();
    } catch (error) {
      showNotification('일괄 삭제에 실패했습니다.', 'error');
    }
  };

  // 매핑 검증
  const handleValidateMapping = async (mapping: MappingData) => {
    try {
      const response = await mappingService.validateMapping(mapping._id);
      if (response.data.success) {
        const validation = response.data.data;
        if (validation.isValid) {
          showNotification('매핑이 유효합니다.', 'success');
        } else {
          showNotification(`매핑 검증 실패: ${validation.errors.join(', ')}`, 'error');
        }
      }
      loadMappings();
    } catch (error) {
      showNotification('매핑 검증에 실패했습니다.', 'error');
    }
  };

  // 동기화 실행
  const handleSyncMapping = async (mapping: MappingData) => {
    try {
      await mappingService.syncMapping(mapping._id);
      showNotification('동기화가 시작되었습니다.', 'info');
      setTimeout(() => loadMappings(), 2000);
    } catch (error) {
      showNotification('동기화 실행에 실패했습니다.', 'error');
    }
  };

  // 일괄 동기화
  const handleBulkSync = async () => {
    if (selectedMappings.length === 0) {
      showNotification('동기화할 매핑을 선택해주세요.', 'warning');
      return;
    }

    try {
      await mappingService.bulkSync(selectedMappings);
      showNotification(`${selectedMappings.length}개 매핑 동기화가 시작되었습니다.`, 'info');
      setSelectedMappings([]);
      setTimeout(() => loadMappings(), 2000);
    } catch (error) {
      showNotification('일괄 동기화에 실패했습니다.', 'error');
    }
  };

  // 엑셀 다운로드
  const handleExcelDownload = async () => {
    try {
      const response = await mappingService.exportMappings({
        format: 'excel',
        filters: {
          status: statusFilter === 'all' ? undefined : statusFilter,
          syncStatus: syncStatusFilter === 'all' ? undefined : syncStatusFilter,
        }
      });
      
      // Blob 다운로드 처리
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `mappings_${new Date().getTime()}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      
      showNotification('엑셀 파일이 다운로드되었습니다.', 'success');
    } catch (error) {
      showNotification('엑셀 다운로드에 실패했습니다.', 'error');
    }
  };

  // 상태별 색상
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'success';
      case 'INACTIVE': return 'default';
      case 'ERROR': return 'error';
      default: return 'default';
    }
  };

  const getSyncStatusColor = (status: string) => {
    switch (status) {
      case 'synced': return 'success';
      case 'pending': return 'warning';
      case 'error': return 'error';
      default: return 'default';
    }
  };

  return (
    <Container maxWidth={false}>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          SKU 매핑 관리
        </Typography>
        <Typography variant="body1" color="text.secondary">
          네이버와 Shopify 상품 간의 SKU 매핑을 관리합니다. SKU를 입력하면 자동으로 양쪽 플랫폼에서 상품을 검색합니다.
        </Typography>
      </Box>

      {/* 통계 카드 */}
      {stats && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6} md={2}>
            <Card>
              <CardContent>
                <Typography color="text.secondary" gutterBottom variant="caption">
                  전체 매핑
                </Typography>
                <Typography variant="h5">
                  {stats.total.toLocaleString()}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <Card>
              <CardContent>
                <Typography color="text.secondary" gutterBottom variant="caption">
                  활성 매핑
                </Typography>
                <Typography variant="h5" color="success.main">
                  {stats.active.toLocaleString()}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <Card>
              <CardContent>
                <Typography color="text.secondary" gutterBottom variant="caption">
                  비활성 매핑
                </Typography>
                <Typography variant="h5" color="text.secondary">
                  {stats.inactive.toLocaleString()}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <Card>
              <CardContent>
                <Typography color="text.secondary" gutterBottom variant="caption">
                  오류 매핑
                </Typography>
                <Typography variant="h5" color="error.main">
                  {stats.error.toLocaleString()}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <Card>
              <CardContent>
                <Typography color="text.secondary" gutterBottom variant="caption">
                  대기 중
                </Typography>
                <Typography variant="h5" color="warning.main">
                  {stats.pending.toLocaleString()}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <Card>
              <CardContent>
                <Typography color="text.secondary" gutterBottom variant="caption">
                  동기화 필요
                </Typography>
                <Typography variant="h5" color="info.main">
                  {stats.syncNeeded.toLocaleString()}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* 툴바 */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
          {/* 검색 */}
          <TextField
            size="small"
            placeholder="SKU, 상품명, ID로 검색..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search />
                </InputAdornment>
              ),
            }}
            sx={{ minWidth: 300 }}
          />

          {/* 필터 */}
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>상태</InputLabel>
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              label="상태"
            >
              <MenuItem value="all">전체</MenuItem>
              <MenuItem value="ACTIVE">활성</MenuItem>
              <MenuItem value="INACTIVE">비활성</MenuItem>
              <MenuItem value="ERROR">오류</MenuItem>
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>동기화</InputLabel>
            <Select
              value={syncStatusFilter}
              onChange={(e) => setSyncStatusFilter(e.target.value)}
              label="동기화"
            >
              <MenuItem value="all">전체</MenuItem>
              <MenuItem value="synced">동기화됨</MenuItem>
              <MenuItem value="pending">대기중</MenuItem>
              <MenuItem value="error">오류</MenuItem>
            </Select>
          </FormControl>

          <Box sx={{ flexGrow: 1 }} />

          {/* 액션 버튼 */}
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={handleAddMapping}
          >
            새 매핑
          </Button>

          <Button
            variant="outlined"
            startIcon={<AutoFixHigh />}
            onClick={() => setAutoDiscoverOpen(true)}
          >
            자동 탐색
          </Button>

          <Button
            variant="outlined"
            startIcon={<CloudUpload />}
            onClick={() => setBulkUploadOpen(true)}
          >
            엑셀 업로드
          </Button>

          <Button
            variant="outlined"
            startIcon={<FileDownload />}
            onClick={handleExcelDownload}
          >
            엑셀 다운로드
          </Button>

          <Tooltip title="새로고침">
            <IconButton onClick={() => loadMappings()} disabled={loading}>
              <Refresh />
            </IconButton>
          </Tooltip>

          <FormControlLabel
            control={
              <Switch
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
              />
            }
            label="자동 새로고침"
          />
        </Stack>

        {/* 선택된 항목 액션 */}
        {selectedMappings.length > 0 && (
          <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
            <Alert severity="info" sx={{ flexGrow: 1 }}>
              {selectedMappings.length}개 항목이 선택되었습니다.
            </Alert>
            <Button
              size="small"
              startIcon={<Sync />}
              onClick={handleBulkSync}
            >
              일괄 동기화
            </Button>
            <Button
              size="small"
              color="error"
              startIcon={<Delete />}
              onClick={handleBulkDelete}
            >
              일괄 삭제
            </Button>
          </Stack>
        )}
      </Paper>

      {/* 테이블 */}
      <TableContainer component={Paper}>
        {loading && <LinearProgress />}
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox">
                <Checkbox
                  indeterminate={selectedMappings.length > 0 && selectedMappings.length < mappings.length}
                  checked={mappings.length > 0 && selectedMappings.length === mappings.length}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedMappings(mappings.map(m => m._id));
                    } else {
                      setSelectedMappings([]);
                    }
                  }}
                />
              </TableCell>
              <TableCell>SKU</TableCell>
              <TableCell>상품명</TableCell>
              <TableCell>네이버 ID</TableCell>
              <TableCell>Shopify ID</TableCell>
              <TableCell>벤더</TableCell>
              <TableCell align="center">마진율</TableCell>
              <TableCell align="center">상태</TableCell>
              <TableCell align="center">동기화</TableCell>
              <TableCell>마지막 동기화</TableCell>
              <TableCell align="center">액션</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              // 스켈레톤 로딩
              Array.from({ length: 5 }).map((_, index) => (
                <TableRow key={index}>
                  <TableCell><Skeleton /></TableCell>
                  <TableCell><Skeleton /></TableCell>
                  <TableCell><Skeleton /></TableCell>
                  <TableCell><Skeleton /></TableCell>
                  <TableCell><Skeleton /></TableCell>
                  <TableCell><Skeleton /></TableCell>
                  <TableCell><Skeleton /></TableCell>
                  <TableCell><Skeleton /></TableCell>
                  <TableCell><Skeleton /></TableCell>
                  <TableCell><Skeleton /></TableCell>
                  <TableCell><Skeleton /></TableCell>
                </TableRow>
              ))
            ) : mappings.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} align="center">
                  <Box sx={{ py: 4 }}>
                    <Typography variant="body1" color="text.secondary">
                      매핑 데이터가 없습니다.
                    </Typography>
                  </Box>
                </TableCell>
              </TableRow>
            ) : (
              mappings.map((mapping) => (
                <TableRow
                  key={mapping._id}
                  hover
                  selected={selectedMappings.includes(mapping._id)}
                >
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={selectedMappings.includes(mapping._id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedMappings([...selectedMappings, mapping._id]);
                        } else {
                          setSelectedMappings(selectedMappings.filter(id => id !== mapping._id));
                        }
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight="medium">
                      {mapping.sku}
                    </Typography>
                    {mapping.metadata?.autoDiscovered && (
                      <Chip
                        label={`자동 ${mapping.metadata.confidence}%`}
                        size="small"
                        color="info"
                        sx={{ mt: 0.5 }}
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                      {mapping.productName || '-'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" fontFamily="monospace">
                      {mapping.naverProductId}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" fontFamily="monospace">
                      {mapping.shopifyProductId}
                    </Typography>
                  </TableCell>
                  <TableCell>{mapping.vendor}</TableCell>
                  <TableCell align="center">
                    <Chip
                      label={`${(mapping.priceMargin * 100).toFixed(0)}%`}
                      size="small"
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell align="center">
                    <Chip
                      label={mapping.status}
                      size="small"
                      color={getStatusColor(mapping.status) as any}
                      icon={
                        mapping.status === 'ACTIVE' ? <CheckCircle /> :
                        mapping.status === 'ERROR' ? <Error /> :
                        <Warning />
                      }
                    />
                  </TableCell>
                  <TableCell align="center">
                    <Chip
                      label={mapping.syncStatus}
                      size="small"
                      color={getSyncStatusColor(mapping.syncStatus) as any}
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>
                    {mapping.lastSyncedAt ? (
                      <Tooltip title={formatDateTime(mapping.lastSyncedAt)}>
                        <Typography variant="caption">
                          {new Date(mapping.lastSyncedAt).toLocaleDateString()}
                        </Typography>
                      </Tooltip>
                    ) : (
                      <Typography variant="caption" color="text.secondary">
                        -
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell align="center">
                    <Stack direction="row" spacing={0.5}>
                      <Tooltip title="상세보기">
                        <IconButton
                          size="small"
                          onClick={() => {
                            setSelectedMapping(mapping);
                            setDetailsDialogOpen(true);
                          }}
                        >
                          <Visibility />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="수정">
                        <IconButton
                          size="small"
                          onClick={() => handleEditMapping(mapping)}
                        >
                          <Edit />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="검증">
                        <IconButton
                          size="small"
                          onClick={() => handleValidateMapping(mapping)}
                        >
                          <CheckCircle />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="동기화">
                        <IconButton
                          size="small"
                          onClick={() => handleSyncMapping(mapping)}
                        >
                          <Sync />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="삭제">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => {
                            setSelectedMapping(mapping);
                            setDeleteConfirmOpen(true);
                          }}
                        >
                          <Delete />
                        </IconButton>
                      </Tooltip>
                    </Stack>
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
          onPageChange={(e, newPage) => setPage(newPage)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => {
            setRowsPerPage(parseInt(e.target.value, 10));
            setPage(0);
          }}
          rowsPerPageOptions={[10, 20, 50, 100]}
          labelRowsPerPage="페이지당 항목:"
        />
      </TableContainer>

      {/* Dialogs */}
      <AddMappingDialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        onSave={() => {
          setAddDialogOpen(false);
          loadMappings();
        }}
        initialData={selectedMapping}
      />

      <BulkUploadDialog
        open={bulkUploadOpen}
        onClose={() => setBulkUploadOpen(false)}
        onSuccess={() => {
          setBulkUploadOpen(false);
          loadMappings();
        }}
      />

      <AutoDiscoverDialog
        open={autoDiscoverOpen}
        onClose={() => setAutoDiscoverOpen(false)}
        onSuccess={() => {
          setAutoDiscoverOpen(false);
          loadMappings();
        }}
      />

      {selectedMapping && (
        <MappingDetailsDialog
          open={detailsDialogOpen}
          onClose={() => setDetailsDialogOpen(false)}
          mapping={selectedMapping}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)}>
        <DialogTitle>매핑 삭제 확인</DialogTitle>
        <DialogContent>
          <Typography>
            정말로 "{selectedMapping?.sku}" 매핑을 삭제하시겠습니까?
            이 작업은 되돌릴 수 없습니다.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmOpen(false)}>취소</Button>
          <Button
            onClick={() => {
              if (selectedMapping) {
                handleDeleteMapping(selectedMapping);
              }
              setDeleteConfirmOpen(false);
            }}
            color="error"
            variant="contained"
          >
            삭제
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default SkuMapping;