// packages/frontend/src/pages/Mapping.tsx

import React, { useState, useEffect } from 'react';
import {
  Container,
  Typography,
  Box,
  Paper,
  Button,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
  Snackbar,
  Tabs,
  Tab,
  Badge,
} from '@mui/material';
import {
  Add as AddIcon,
  AutoFixHigh as AutoIcon,
  Upload as UploadIcon,
  Download as DownloadIcon,
  Search as SearchIcon,
  Sync as SyncIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import SKUMappingTable from '@/components/mapping/SKUMappingTable';
import MappingForm from '@/components/mapping/MappingForm';
import AutoDiscoverDialog from '@/components/mapping/AutoDiscoverDialog';
import { mappingService } from '@/services/api/mapping.service';
import type { MappingData, MappingListParams } from '@/services/api/mapping.service';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`mapping-tabpanel-${index}`}
      aria-labelledby={`mapping-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
  );
}

const Mapping: React.FC = () => {
  const [formOpen, setFormOpen] = useState(false);
  const [selectedMapping, setSelectedMapping] = useState<MappingData | null>(null);
  const [autoDiscoverOpen, setAutoDiscoverOpen] = useState(false);
  const [mappings, setMappings] = useState<MappingData[]>([]);
  const [loading, setLoading] = useState(false);
  const [tabValue, setTabValue] = useState(0);
  
  // 페이지네이션 및 필터
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [total, setTotal] = useState(0);
  
  // 통계
  const [statistics, setStatistics] = useState({
    total: 0,
    active: 0,
    inactive: 0,
    error: 0,
    warning: 0,
  });

  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error' | 'info' | 'warning';
  }>({
    open: false,
    message: '',
    severity: 'success',
  });

  // 매핑 데이터 로드
  const loadMappings = async () => {
    setLoading(true);
    try {
      const params: MappingListParams = {
        page,
        limit,
        search,
      };
      
      // 탭에 따른 필터 적용
      if (tabValue === 1) params.isActive = true;
      if (tabValue === 2) params.isActive = false;
      if (tabValue === 3) params.status = 'ERROR';
      if (tabValue === 4) params.status = 'WARNING';
      
      const response = await mappingService.getMappings(params);
      setMappings(response.data.data.mappings);
      setTotal(response.data.data.pagination.total);
      
      // 통계 업데이트
      await loadStatistics();
    } catch (error) {
      console.error('Failed to load mappings:', error);
      showSnackbar('매핑 데이터를 불러오는데 실패했습니다.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // 통계 로드
  const loadStatistics = async () => {
    try {
      const response = await mappingService.getMappingStatistics();
      setStatistics(response.data.data);
    } catch (error) {
      console.error('Failed to load statistics:', error);
    }
  };

  useEffect(() => {
    loadMappings();
  }, [page, limit, search, tabValue]);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
    setPage(1); // 탭 변경 시 첫 페이지로
  };

  const handleAdd = () => {
    setSelectedMapping(null);
    setFormOpen(true);
  };

  const handleEdit = (mapping: MappingData) => {
    setSelectedMapping(mapping);
    setFormOpen(true);
  };

  const handleFormSuccess = () => {
    setFormOpen(false);
    setSelectedMapping(null);
    loadMappings();
    showSnackbar('매핑이 성공적으로 저장되었습니다.', 'success');
  };

  const handleAutoDiscover = () => {
    setAutoDiscoverOpen(true);
  };

  const handleAutoDiscoverSuccess = () => {
    setAutoDiscoverOpen(false);
    loadMappings();
    showSnackbar('자동 매핑 탐색이 완료되었습니다.', 'success');
  };

  const handleExport = async () => {
    try {
      const response = await mappingService.exportMappings({
        search,
        isActive: tabValue === 1 ? true : tabValue === 2 ? false : undefined,
      });
      
      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `sku-mappings-${new Date().toISOString().split('T')[0]}.xlsx`;
      link.click();
      window.URL.revokeObjectURL(url);
      showSnackbar('매핑 데이터를 내보냈습니다.', 'success');
    } catch (error) {
      console.error('Export failed:', error);
      showSnackbar('내보내기에 실패했습니다.', 'error');
    }
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xls';
    input.onchange = async (e: any) => {
      const file = e.target.files[0];
      if (file) {
        const formData = new FormData();
        formData.append('file', file);
        
        try {
          const response = await mappingService.bulkUpload(formData);
          loadMappings();
          showSnackbar(
            `${response.data.data.success.length}개 매핑을 성공적으로 가져왔습니다.`,
            'success'
          );
        } catch (error) {
          console.error('Import failed:', error);
          showSnackbar('가져오기에 실패했습니다.', 'error');
        }
      }
    };
    input.click();
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('정말로 이 매핑을 삭제하시겠습니까?')) {
      try {
        await mappingService.deleteMapping(id);
        loadMappings();
        showSnackbar('매핑이 삭제되었습니다.', 'success');
      } catch (error) {
        console.error('Delete failed:', error);
        showSnackbar('삭제에 실패했습니다.', 'error');
      }
    }
  };

  const handleValidate = async (id: string) => {
    try {
      await mappingService.validateMapping(id);
      loadMappings();
      showSnackbar('매핑 검증이 완료되었습니다.', 'info');
    } catch (error) {
      console.error('Validation failed:', error);
      showSnackbar('검증에 실패했습니다.', 'error');
    }
  };

  const showSnackbar = (
    message: string,
    severity: 'success' | 'error' | 'info' | 'warning'
  ) => {
    setSnackbar({ open: true, message, severity });
  };

  return (
    <Container maxWidth="xl">
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          SKU 매핑 관리
        </Typography>
        <Typography variant="body1" color="text.secondary">
          네이버와 Shopify 상품 간의 SKU 매핑을 관리하세요. SKU를 입력하면 자동으로 양쪽 플랫폼에서 상품을 검색합니다.
        </Typography>
      </Box>

      {/* 알림 메시지 */}
      <Alert severity="info" sx={{ mb: 2 }}>
        💡 <strong>새로운 기능!</strong> SKU를 입력하면 네이버와 Shopify에서 자동으로 상품을 검색하여 매핑을 쉽게 생성할 수 있습니다.
      </Alert>

      {/* 통계 카드 */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Paper sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="h4">{statistics.total}</Typography>
            <Typography variant="body2" color="text.secondary">전체 매핑</Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Paper sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="h4" color="success.main">{statistics.active}</Typography>
            <Typography variant="body2" color="text.secondary">활성 매핑</Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Paper sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="h4" color="error.main">{statistics.error}</Typography>
            <Typography variant="body2" color="text.secondary">오류 매핑</Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Paper sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="h4" color="warning.main">{statistics.warning}</Typography>
            <Typography variant="body2" color="text.secondary">경고 매핑</Typography>
          </Paper>
        </Grid>
      </Grid>

      {/* 검색 바 */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <TextField
            placeholder="SKU, 상품명, 상품 ID로 검색..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            fullWidth
            size="small"
            InputProps={{
              startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />,
            }}
          />
          <Button
            variant="outlined"
            startIcon={<SyncIcon />}
            onClick={loadMappings}
          >
            새로고침
          </Button>
        </Stack>
      </Paper>

      {/* 액션 바 */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Stack direction="row" spacing={2} justifyContent="space-between">
          <Stack direction="row" spacing={1}>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={handleAdd}
            >
              새 매핑 추가
            </Button>
            <Button
              startIcon={<AutoIcon />}
              onClick={handleAutoDiscover}
              color="secondary"
            >
              자동 매핑 탐색
            </Button>
          </Stack>
          <Stack direction="row" spacing={1}>
            <Button
              startIcon={<DownloadIcon />}
              onClick={handleExport}
            >
              내보내기
            </Button>
            <Button
              startIcon={<UploadIcon />}
              onClick={handleImport}
            >
              가져오기
            </Button>
          </Stack>
        </Stack>
      </Paper>

      {/* 탭 필터 */}
      <Paper sx={{ mb: 3 }}>
        <Tabs value={tabValue} onChange={handleTabChange} aria-label="mapping tabs">
          <Tab 
            label={
              <Badge badgeContent={statistics.total} color="default">
                전체
              </Badge>
            } 
          />
          <Tab 
            label={
              <Badge badgeContent={statistics.active} color="success">
                활성
              </Badge>
            } 
          />
          <Tab 
            label={
              <Badge badgeContent={statistics.inactive} color="default">
                비활성
              </Badge>
            } 
          />
          <Tab 
            label={
              <Badge badgeContent={statistics.error} color="error">
                오류
              </Badge>
            } 
          />
          <Tab 
            label={
              <Badge badgeContent={statistics.warning} color="warning">
                경고
              </Badge>
            } 
          />
        </Tabs>

        {/* 매핑 테이블 */}
        <TabPanel value={tabValue} index={tabValue}>
          <SKUMappingTable
            mappings={mappings}
            loading={loading}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onValidate={handleValidate}
            page={page}
            limit={limit}
            total={total}
            onPageChange={setPage}
            onLimitChange={(newLimit) => {
              setLimit(newLimit);
              setPage(1);
            }}
          />
        </TabPanel>
      </Paper>

      {/* 매핑 폼 다이얼로그 */}
      <Dialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>
          {selectedMapping ? '매핑 수정' : '새 매핑 추가'}
        </DialogTitle>
        <DialogContent>
          <MappingForm
            mapping={selectedMapping}
            onSuccess={handleFormSuccess}
            onCancel={() => setFormOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* 자동 탐색 다이얼로그 */}
      {autoDiscoverOpen && (
        <AutoDiscoverDialog
          open={autoDiscoverOpen}
          onClose={() => setAutoDiscoverOpen(false)}
          onSuccess={handleAutoDiscoverSuccess}
        />
      )}

      {/* 스낵바 */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Container>
  );
};

export default Mapping;