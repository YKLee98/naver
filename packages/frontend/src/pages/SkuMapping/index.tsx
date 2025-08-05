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
      
      setMappings(response.data.mappings);
      setTotalCount(response.data.pagination.total);
    } catch (error) {
      showNotification('매핑 목록을 불러오는데 실패했습니다.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMappings();
  }, [page, rowsPerPage, searchTerm, statusFilter]);

  // 검색 처리
  const handleSearch = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
    setPage(0);
  };

  // 페이지 변경
  const handleChangePage = (event: unknown, newPage: number) => {
    setPage(newPage);
  };

  // 행 수 변경
  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  // 전체 선택/해제
  const handleSelectAll = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.checked) {
      setSelectedMappings(mappings.map(m => m._id));
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

  // 매핑 추가
  const handleAddMapping = async (data: any) => {
    try {
      await mappingService.createMapping(data);
      showNotification('매핑이 추가되었습니다.', 'success');
      loadMappings();
      setAddDialogOpen(false);
    } catch (error) {
      showNotification('매핑 추가에 실패했습니다.', 'error');
    }
  };

  // 매핑 수정
  const handleEditMapping = async (data: any) => {
    if (!selectedMapping) return;
    
    try {
      await mappingService.updateMapping(selectedMapping._id, data);
      showNotification('매핑이 수정되었습니다.', 'success');
      loadMappings();
      setEditDialogOpen(false);
    } catch (error) {
      showNotification('매핑 수정에 실패했습니다.', 'error');
    }
  };

  // 매핑 삭제
  const handleDeleteMapping = async () => {
    if (!selectedMapping) return;
    
    try {
      await mappingService.deleteMapping(selectedMapping._id);
      showNotification('매핑이 삭제되었습니다.', 'success');
      loadMappings();
      setDeleteConfirmOpen(false);
    } catch (error) {
      showNotification('매핑 삭제에 실패했습니다.', 'error');
    }
  };

  // 매핑 검증
  const handleValidateMapping = async (mapping: MappingData) => {
    try {
      const result = await mappingService.validateMapping(mapping._id);
      if (result.data.isValid) {
        showNotification('매핑이 유효합니다.', 'success');
      } else {
        showNotification(`검증 실패: ${result.data.errors.join(', ')}`, 'error');
      }
      loadMappings();
    } catch (error) {
      showNotification('매핑 검증에 실패했습니다.', 'error');
    }
  };

  // 템플릿 다운로드
  const handleDownloadTemplate = async () => {
    try {
      const response = await mappingService.downloadTemplate();
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'sku-mapping-template.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      showNotification('템플릿 다운로드에 실패했습니다.', 'error');
    }
  };

  // 상태 아이콘 렌더링
  const renderStatusIcon = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return <CheckCircle color="success" fontSize="small" />;
      case 'ERROR':
        return <Error color="error" fontSize="small" />;
      case 'WARNING':
        return <Warning color="warning" fontSize="small" />;
      default:
        return null;
    }
  };

  // 상태 칩 렌더링
  const renderStatusChip = (status: string) => {
    const statusConfig = {
      ACTIVE: { label: '정상', color: 'success' as const },
      ERROR: { label: '오류', color: 'error' as const },
      WARNING: { label: '주의', color: 'warning' as const },
      INACTIVE: { label: '비활성', color: 'default' as const },
    };

    const config = statusConfig[status] || { label: status, color: 'default' as const };
    
    return (
      <Chip
        label={config.label}
        color={config.color}
        size="small"
        icon={renderStatusIcon(status)}
      />
    );
  };

  return (
    <Box>
      {/* 헤더 */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" gutterBottom>
          SKU 매핑 관리
        </Typography>
        <Typography variant="body2" color="text.secondary">
          네이버 스마트스토어와 Shopify 상품을 연결하여 재고와 가격을 동기화합니다.
        </Typography>
      </Box>

      {/* 액션 바 */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
          <TextField
            size="small"
            placeholder="SKU, 상품명 검색"
            value={searchTerm}
            onChange={handleSearch}
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
              <MenuItem value="ACTIVE">정상</MenuItem>
              <MenuItem value="ERROR">오류</MenuItem>
              <MenuItem value="WARNING">주의</MenuItem>
              <MenuItem value="INACTIVE">비활성</MenuItem>
            </Select>
          </FormControl>
          
          <Box sx={{ flexGrow: 1 }} />
          
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
      </Paper>

      {/* 테이블 */}
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox">
                <Checkbox
                  indeterminate={selectedMappings.length > 0 && selectedMappings.length < mappings.length}
                  checked={mappings.length > 0 && selectedMappings.length === mappings.length}
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
            {mappings.map((mapping) => (
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
                  <Typography variant="body2" color="text.secondary">
                    {new Date(mapping.lastSyncAt).toLocaleString()}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      setAnchorEl(e.currentTarget);
                      setSelectedMapping(mapping);
                    }}
                  >
                    <MoreVert />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        
        <TablePagination
          component="div"
          count={totalCount}
          page={page}
          onPageChange={handleChangePage}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={handleChangeRowsPerPage}
          rowsPerPageOptions={[10, 20, 50, 100]}
          labelRowsPerPage="페이지당 행:"
        />
      </TableContainer>

      {/* 액션 메뉴 */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
      >
        <MenuItem
          onClick={() => {
            setEditDialogOpen(true);
            setAnchorEl(null);
          }}
        >
          <ListItemIcon>
            <Edit fontSize="small" />
          </ListItemIcon>
          <ListItemText>수정</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            handleValidateMapping(selectedMapping!);
            setAnchorEl(null);
          }}
        >
          <ListItemIcon>
            <Sync fontSize="small" />
          </ListItemIcon>
          <ListItemText>검증</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            setDeleteConfirmOpen(true);
            setAnchorEl(null);
          }}
        >
          <ListItemIcon>
            <Delete fontSize="small" color="error" />
          </ListItemIcon>
          <ListItemText>삭제</ListItemText>
        </MenuItem>
      </Menu>

      {/* 다이얼로그들 */}
      <AddMappingDialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        onSave={handleAddMapping}
      />
      
      {selectedMapping && (
        <AddMappingDialog
          open={editDialogOpen}
          onClose={() => setEditDialogOpen(false)}
          onSave={handleEditMapping}
          initialData={selectedMapping}
        />
      )}
      
      <BulkUploadDialog
        open={bulkUploadOpen}
        onClose={() => setBulkUploadOpen(false)}
        onSuccess={() => {
          loadMappings();
          setBulkUploadOpen(false);
        }}
      />
      
      <AutoDiscoverDialog
        open={autoDiscoverOpen}
        onClose={() => setAutoDiscoverOpen(false)}
        onSuccess={() => {
          loadMappings();
          setAutoDiscoverOpen(false);
        }}
      />
      
      {/* 삭제 확인 다이얼로그 */}
      <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)}>
        <DialogTitle>매핑 삭제</DialogTitle>
        <DialogContent>
          정말로 이 매핑을 삭제하시겠습니까?
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmOpen(false)}>취소</Button>
          <Button onClick={handleDeleteMapping} color="error" variant="contained">
            삭제
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default SkuMapping;