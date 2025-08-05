// packages/frontend/src/pages/SkuMapping/index.tsx
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
} from '@mui/icons-material';
import { useAppDispatch, useAppSelector } from '@/hooks';
import { mappingService } from '@/services/api/mapping.service';
import { useNotification } from '@/hooks/useNotification';
import AddMappingDialog from './AddMappingDialog';
import BulkUploadDialog from './BulkUploadDialog';
import AutoDiscoverDialog from './AutoDiscoverDialog';

interface MappingData {
  _id: string;
  sku: string;
  naverProductId: string;
  shopifyProductId: string;
  productName: string;
  priceMargin: number;
  isActive: boolean;
  status: string;
  syncStatus?: string;
  lastSyncAt: string;
  updatedAt: string;
}

const SkuMapping: React.FC = () => {
  const dispatch = useAppDispatch();
  const { showNotification } = useNotification();
  
  // State
  const [mappings, setMappings] = useState<MappingData[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMappings, setSelectedMappings] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [totalCount, setTotalCount] = useState(0);
  const [statusFilter, setStatusFilter] = useState('all');
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedMapping, setSelectedMapping] = useState<MappingData | null>(null);
  
  // Dialogs
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);
  const [autoDiscoverOpen, setAutoDiscoverOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // 매핑 목록 로드
  const loadMappings = async () => {
    setLoading(true);
    try {
      const response = await mappingService.getMappings({
        page: page + 1,
        limit: rowsPerPage,
        search: searchTerm,
        status: statusFilter === 'all' ? undefined : statusFilter,
      });
      
      // 백엔드의 MappingController를 보면 response.data.data 구조입니다
      if (response.data && response.data.data) {
        setMappings(response.data.data.mappings || []);
        setTotalCount(response.data.data.pagination?.total || 0);
      } else {
        setMappings([]);
        setTotalCount(0);
      }
    } catch (error) {
      console.error('Error loading mappings:', error);
      showNotification('매핑 목록을 불러오는데 실패했습니다.', 'error');
      setMappings([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  };

  // 초기 로드 및 필터 변경 시 재로드
  useEffect(() => {
    loadMappings();
  }, [page, rowsPerPage, statusFilter]);

  // 검색어 디바운싱
  useEffect(() => {
    const timer = setTimeout(() => {
      if (page === 0) {
        loadMappings();
      } else {
        setPage(0);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  // 전체 선택/해제
  const handleSelectAll = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.checked) {
      const newSelected = mappings.map((mapping) => mapping._id);
      setSelectedMappings(newSelected);
    } else {
      setSelectedMappings([]);
    }
  };

  // 개별 선택
  const handleSelectOne = (id: string) => {
    const selectedIndex = selectedMappings.indexOf(id);
    let newSelected: string[] = [];

    if (selectedIndex === -1) {
      newSelected = newSelected.concat(selectedMappings, id);
    } else if (selectedIndex === 0) {
      newSelected = newSelected.concat(selectedMappings.slice(1));
    } else if (selectedIndex === selectedMappings.length - 1) {
      newSelected = newSelected.concat(selectedMappings.slice(0, -1));
    } else if (selectedIndex > 0) {
      newSelected = newSelected.concat(
        selectedMappings.slice(0, selectedIndex),
        selectedMappings.slice(selectedIndex + 1)
      );
    }

    setSelectedMappings(newSelected);
  };

  // 메뉴 열기/닫기
  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, mapping: MappingData) => {
    setAnchorEl(event.currentTarget);
    setSelectedMapping(mapping);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setSelectedMapping(null);
  };

  // 매핑 수정
  const handleEdit = (mapping?: MappingData) => {
    if (mapping) {
      setSelectedMapping(mapping);
      setEditDialogOpen(true);
    }
    handleMenuClose();
  };

  // 매핑 삭제
  const handleDelete = async (mapping?: MappingData) => {
    if (!mapping) return;
    
    setSelectedMapping(mapping);
    setDeleteConfirmOpen(true);
    handleMenuClose();
  };

  const confirmDelete = async () => {
    if (!selectedMapping) return;

    try {
      await mappingService.deleteMapping(selectedMapping._id);
      showNotification('매핑이 삭제되었습니다.', 'success');
      loadMappings();
    } catch (error) {
      showNotification('매핑 삭제에 실패했습니다.', 'error');
    } finally {
      setDeleteConfirmOpen(false);
      setSelectedMapping(null);
    }
  };

  // 일괄 삭제
  const handleBulkDelete = async () => {
    if (selectedMappings.length === 0) {
      showNotification('선택된 매핑이 없습니다.', 'warning');
      return;
    }

    if (window.confirm(`${selectedMappings.length}개의 매핑을 삭제하시겠습니까?`)) {
      try {
        await mappingService.bulkDelete(selectedMappings);
        showNotification(`${selectedMappings.length}개의 매핑이 삭제되었습니다.`, 'success');
        setSelectedMappings([]);
        loadMappings();
      } catch (error) {
        showNotification('일괄 삭제에 실패했습니다.', 'error');
      }
    }
  };

  // 일괄 활성화/비활성화
  const handleBulkToggle = async (isActive: boolean) => {
    if (selectedMappings.length === 0) {
      showNotification('선택된 매핑이 없습니다.', 'warning');
      return;
    }

    try {
      await mappingService.toggleMappings(selectedMappings, isActive);
      showNotification(
        `${selectedMappings.length}개의 매핑이 ${isActive ? '활성화' : '비활성화'}되었습니다.`,
        'success'
      );
      setSelectedMappings([]);
      loadMappings();
    } catch (error) {
      showNotification('상태 변경에 실패했습니다.', 'error');
    }
  };

  // 매핑 검증
  const handleValidate = async (mapping: MappingData) => {
    try {
      const response = await mappingService.validateMapping(mapping._id);
      const validation = response.data.data;
      
      if (validation.isValid) {
        showNotification('매핑이 유효합니다.', 'success');
      } else {
        showNotification(
          `매핑 검증 실패: ${validation.errors.join(', ')}`,
          'error'
        );
      }
      
      loadMappings();
    } catch (error) {
      showNotification('매핑 검증에 실패했습니다.', 'error');
    }
  };

  // 엑셀 템플릿 다운로드
  const handleDownloadTemplate = async () => {
    try {
      const response = await mappingService.downloadTemplate();
      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'sku-mapping-template.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      showNotification('템플릿 다운로드에 실패했습니다.', 'error');
    }
  };

  // 상태 칩 렌더링
  const renderStatusChip = (status?: string) => {
    if (!status) return null;
    
    const config: Record<string, { color: any; icon: React.ReactElement; label: string }> = {
      synced: { color: 'success', icon: <CheckCircle fontSize="small" />, label: '동기화됨' },
      ACTIVE: { color: 'success', icon: <CheckCircle fontSize="small" />, label: '활성' },
      pending: { color: 'warning', icon: <Warning fontSize="small" />, label: '대기중' },
      PENDING: { color: 'warning', icon: <Warning fontSize="small" />, label: '대기중' },
      error: { color: 'error', icon: <Error fontSize="small" />, label: '오류' },
      ERROR: { color: 'error', icon: <Error fontSize="small" />, label: '오류' },
    };

    const { color, icon, label } = config[status] || {
      color: 'default',
      icon: null,
      label: status,
    };

    return (
      <Chip
        size="small"
        color={color}
        icon={icon}
        label={label}
      />
    );
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        SKU 매핑 관리
      </Typography>

      {/* 알림 메시지 */}
      {selectedMappings.length > 0 && (
        <Alert
          severity="info"
          action={
            <Box>
              <Button
                size="small"
                onClick={() => handleBulkToggle(true)}
              >
                활성화
              </Button>
              <Button
                size="small"
                onClick={() => handleBulkToggle(false)}
              >
                비활성화
              </Button>
              <Button
                size="small"
                color="error"
                onClick={handleBulkDelete}
              >
                삭제
              </Button>
            </Box>
          }
          sx={{ mb: 2 }}
        >
          {selectedMappings.length}개의 매핑이 선택되었습니다.
        </Alert>
      )}

      {/* 필터 및 액션 */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Box display="flex" gap={2} flexWrap="wrap" alignItems="center" justifyContent="space-between">
          <Box display="flex" gap={2} flexWrap="wrap" alignItems="center">
            <TextField
              size="small"
              placeholder="SKU, 상품명으로 검색"
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
                <MenuItem value="ACTIVE">활성</MenuItem>
                <MenuItem value="PENDING">대기중</MenuItem>
                <MenuItem value="ERROR">오류</MenuItem>
              </Select>
            </FormControl>

            <IconButton
              onClick={() => loadMappings()}
              disabled={loading}
            >
              <Refresh />
            </IconButton>
          </Box>

          <Box display="flex" gap={1}>
            <Button
              variant="outlined"
              startIcon={<FileDownload />}
              onClick={handleDownloadTemplate}
            >
              템플릿
            </Button>
            
            <Button
              variant="outlined"
              startIcon={<FileUpload />}
              onClick={() => setBulkUploadOpen(true)}
            >
              엑셀 업로드
            </Button>
            
            <Button
              variant="outlined"
              startIcon={<AutoFixHigh />}
              onClick={() => setAutoDiscoverOpen(true)}
            >
              자동 탐색
            </Button>
            
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={() => setAddDialogOpen(true)}
            >
              새 매핑
            </Button>
          </Box>
        </Box>
      </Paper>

      {/* 테이블 */}
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox">
                <Checkbox
                  indeterminate={
                    selectedMappings.length > 0 && 
                    selectedMappings.length < mappings.length
                  }
                  checked={
                    mappings.length > 0 && 
                    selectedMappings.length === mappings.length
                  }
                  onChange={handleSelectAll}
                />
              </TableCell>
              <TableCell>SKU</TableCell>
              <TableCell>상품명</TableCell>
              <TableCell>네이버 ID</TableCell>
              <TableCell>Shopify ID</TableCell>
              <TableCell align="center">마진율</TableCell>
              <TableCell align="center">상태</TableCell>
              <TableCell align="center">활성화</TableCell>
              <TableCell>마지막 동기화</TableCell>
              <TableCell align="right">작업</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && mappings.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} align="center">
                  <Typography variant="body2" color="text.secondary">
                    로딩 중...
                  </Typography>
                </TableCell>
              </TableRow>
            ) : mappings.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} align="center">
                  <Typography variant="body2" color="text.secondary">
                    매핑 데이터가 없습니다.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              mappings.map((mapping) => (
                <TableRow
                  key={mapping._id}
                  hover
                  selected={selectedMappings.indexOf(mapping._id) !== -1}
                >
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={selectedMappings.indexOf(mapping._id) !== -1}
                      onChange={() => handleSelectOne(mapping._id)}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight="medium">
                      {mapping.sku}
                    </Typography>
                  </TableCell>
                  <TableCell>{mapping.productName}</TableCell>
                  <TableCell>{mapping.naverProductId}</TableCell>
                  <TableCell>{mapping.shopifyProductId}</TableCell>
                  <TableCell align="center">{mapping.priceMargin}%</TableCell>
                  <TableCell align="center">
                    {renderStatusChip(mapping.syncStatus || mapping.status)}
                  </TableCell>
                  <TableCell align="center">
                    <Switch
                      checked={mapping.isActive}
                      size="small"
                      color="primary"
                      onClick={(e) => e.stopPropagation()}
                      onChange={async () => {
                        try {
                          await mappingService.updateMapping(mapping._id, { 
                            isActive: !mapping.isActive 
                          });
                          loadMappings();
                        } catch (error) {
                          showNotification('상태 변경에 실패했습니다.', 'error');
                        }
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <Tooltip title={new Date(mapping.lastSyncAt).toLocaleString()}>
                      <Typography variant="caption">
                        {new Date(mapping.lastSyncAt).toLocaleDateString()}
                      </Typography>
                    </Tooltip>
                  </TableCell>
                  <TableCell align="right">
                    <IconButton
                      size="small"
                      onClick={(e) => handleMenuOpen(e, mapping)}
                    >
                      <MoreVert />
                    </IconButton>
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

      {/* 액션 메뉴 */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={() => handleEdit(selectedMapping)}>
          <ListItemIcon>
            <Edit fontSize="small" />
          </ListItemIcon>
          <ListItemText>수정</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => selectedMapping && handleValidate(selectedMapping)}>
          <ListItemIcon>
            <Check fontSize="small" />
          </ListItemIcon>
          <ListItemText>검증</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => handleDelete(selectedMapping)}>
          <ListItemIcon>
            <Delete fontSize="small" color="error" />
          </ListItemIcon>
          <ListItemText>삭제</ListItemText>
        </MenuItem>
      </Menu>

      {/* 새 매핑 추가 다이얼로그 */}
      <AddMappingDialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        onSuccess={() => {
          loadMappings();
          showNotification('매핑이 추가되었습니다.', 'success');
        }}
      />

      {/* 매핑 수정 다이얼로그 */}
      {selectedMapping && (
        <AddMappingDialog
          open={editDialogOpen}
          onClose={() => {
            setEditDialogOpen(false);
            setSelectedMapping(null);
          }}
          onSuccess={() => {
            loadMappings();
            showNotification('매핑이 수정되었습니다.', 'success');
          }}
          initialData={selectedMapping}
        />
      )}

      {/* 엑셀 업로드 다이얼로그 */}
      <BulkUploadDialog
        open={bulkUploadOpen}
        onClose={() => setBulkUploadOpen(false)}
        onSuccess={() => {
          loadMappings();
          showNotification('엑셀 업로드가 완료되었습니다.', 'success');
        }}
      />

      {/* 자동 탐색 다이얼로그 */}
      <AutoDiscoverDialog
        open={autoDiscoverOpen}
        onClose={() => setAutoDiscoverOpen(false)}
        onSuccess={() => {
          loadMappings();
          showNotification('자동 탐색이 완료되었습니다.', 'success');
        }}
      />

      {/* 삭제 확인 다이얼로그 */}
      <Dialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
      >
        <DialogTitle>매핑 삭제</DialogTitle>
        <DialogContent>
          <Typography>
            선택한 매핑을 삭제하시겠습니까?
            {selectedMapping && (
              <Box mt={1}>
                <Typography variant="body2" color="text.secondary">
                  SKU: {selectedMapping.sku}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  상품명: {selectedMapping.productName}
                </Typography>
              </Box>
            )}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmOpen(false)}>취소</Button>
          <Button onClick={confirmDelete} color="error" variant="contained">
            삭제
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default SkuMapping;