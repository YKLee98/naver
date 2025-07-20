import React, { useState } from 'react';
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
} from '@mui/material';
import {
  Add as AddIcon,
  AutoFixHigh as AutoIcon,
  Upload as UploadIcon,
  Download as DownloadIcon,
} from '@mui/icons-material';
import SKUMappingTable from '@/components/mapping/SKUMappingTable';
import MappingForm from '@/components/mapping/MappingForm';
import { useGetMappingsQuery } from '@/store/api/apiSlice';

const Mapping: React.FC = () => {
  const [formOpen, setFormOpen] = useState(false);
  const [selectedMapping, setSelectedMapping] = useState<any>(null);
  const [autoDiscoverOpen, setAutoDiscoverOpen] = useState(false);

  const { data: mappingsData, isLoading } = useGetMappingsQuery({
    page: 1,
    limit: 100,
  });

  const handleAdd = () => {
    setSelectedMapping(null);
    setFormOpen(true);
  };

  const handleEdit = (mapping: any) => {
    setSelectedMapping(mapping);
    setFormOpen(true);
  };

  const handleAutoDiscover = () => {
    setAutoDiscoverOpen(true);
  };

  const handleExport = () => {
    console.log('Exporting mappings...');
  };

  const handleImport = () => {
    console.log('Importing mappings...');
  };

  return (
    <Container maxWidth="xl">
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          SKU 매핑 관리
        </Typography>
        <Typography variant="body1" color="text.secondary">
          네이버와 Shopify 상품 간의 SKU 매핑을 관리하세요.
        </Typography>
      </Box>

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

      {/* 매핑 테이블 */}
      <Paper>
        <SKUMappingTable
          mappings={mappingsData?.data || []}
          loading={isLoading}
          onEdit={handleEdit}
        />
      </Paper>

      {/* 매핑 폼 다이얼로그 */}
      <Dialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          {selectedMapping ? 'SKU 매핑 수정' : '새 SKU 매핑'}
        </DialogTitle>
        <DialogContent>
          <MappingForm
            mapping={selectedMapping}
            onSuccess={() => setFormOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* 자동 탐색 다이얼로그 */}
      <Dialog
        open={autoDiscoverOpen}
        onClose={() => setAutoDiscoverOpen(false)}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>자동 매핑 탐색</DialogTitle>
        <DialogContent>
          <Typography>
            SKU를 기반으로 자동으로 매핑을 탐색합니다...
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAutoDiscoverOpen(false)}>닫기</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default Mapping;
