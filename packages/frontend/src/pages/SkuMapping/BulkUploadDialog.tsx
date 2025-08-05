// packages/frontend/src/pages/SkuMapping/BulkUploadDialog.tsx
import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Alert,
  LinearProgress,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Chip,
  Divider,
  IconButton,
} from '@mui/material';
import {
  CloudUpload,
  CheckCircle,
  Error,
  Warning,
  FileDownload,
  Close,
} from '@mui/icons-material';
import { useDropzone } from 'react-dropzone';
import { mappingService } from '@/services/api/mapping.service';
import { useNotification } from '@/hooks/useNotification';

interface BulkUploadDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface UploadResult {
  total: number;
  success: Array<{ row: number; sku: string }>;
  errors: Array<{ row: number; sku: string; error: string }>;
  skipped: Array<{ row: number; sku: string; reason: string }>;
}

const BulkUploadDialog: React.FC<BulkUploadDialogProps> = ({
  open,
  onClose,
  onSuccess,
}) => {
  const { showNotification } = useNotification();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
    },
    maxFiles: 1,
    onDrop: (acceptedFiles) => {
      if (acceptedFiles.length > 0) {
        setFile(acceptedFiles[0]);
        setUploadResult(null);
      }
    },
  });

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await mappingService.bulkUpload(formData);
      setUploadResult(response.data);

      if (response.data.success.length > 0) {
        showNotification(
          `${response.data.success.length}개 매핑이 추가되었습니다.`,
          'success'
        );
      }

      if (response.data.errors.length === 0 && response.data.success.length > 0) {
        setTimeout(() => {
          onSuccess();
        }, 2000);
      }
    } catch (error) {
      showNotification('파일 업로드에 실패했습니다.', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setUploadResult(null);
    onClose();
  };

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

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>
        엑셀 대량 업로드
        <IconButton
          aria-label="close"
          onClick={handleClose}
          sx={{ position: 'absolute', right: 8, top: 8 }}
        >
          <Close />
        </IconButton>
      </DialogTitle>

      <DialogContent>
        {/* 안내 메시지 */}
        <Alert severity="info" sx={{ mb: 2 }}>
          <Typography variant="body2" gutterBottom>
            엑셀 파일을 통해 여러 SKU 매핑을 한 번에 추가할 수 있습니다.
          </Typography>
          <Button
            size="small"
            startIcon={<FileDownload />}
            onClick={handleDownloadTemplate}
            sx={{ mt: 1 }}
          >
            템플릿 다운로드
          </Button>
        </Alert>

        {/* 파일 업로드 영역 */}
        {!uploadResult && (
          <Box
            {...getRootProps()}
            sx={{
              border: '2px dashed',
              borderColor: isDragActive ? 'primary.main' : 'grey.300',
              borderRadius: 2,
              p: 4,
              textAlign: 'center',
              cursor: 'pointer',
              backgroundColor: isDragActive ? 'action.hover' : 'background.default',
              transition: 'all 0.2s',
              '&:hover': {
                borderColor: 'primary.main',
                backgroundColor: 'action.hover',
              },
            }}
          >
            <input {...getInputProps()} />
            <CloudUpload sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
            <Typography variant="h6" gutterBottom>
              {isDragActive
                ? '파일을 놓으세요'
                : '클릭하거나 파일을 드래그하세요'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Excel 파일만 지원됩니다 (.xlsx, .xls)
            </Typography>
          </Box>
        )}

        {/* 선택된 파일 정보 */}
        {file && !uploadResult && (
          <Box sx={{ mt: 2, p: 2, bgcolor: 'background.paper', borderRadius: 1 }}>
            <Typography variant="body2">
              선택된 파일: <strong>{file.name}</strong>
            </Typography>
            <Typography variant="caption" color="text.secondary">
              크기: {(file.size / 1024).toFixed(2)} KB
            </Typography>
          </Box>
        )}

        {/* 업로드 진행 상태 */}
        {uploading && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="body2" gutterBottom>
              업로드 중...
            </Typography>
            <LinearProgress />
          </Box>
        )}

        {/* 업로드 결과 */}
        {uploadResult && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="h6" gutterBottom>
              업로드 결과
            </Typography>

            {/* 요약 */}
            <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
              <Chip
                label={`전체: ${uploadResult.total}`}
                variant="outlined"
              />
              <Chip
                label={`성공: ${uploadResult.success.length}`}
                color="success"
                variant="outlined"
              />
              <Chip
                label={`오류: ${uploadResult.errors.length}`}
                color="error"
                variant="outlined"
              />
              <Chip
                label={`건너뜀: ${uploadResult.skipped.length}`}
                color="warning"
                variant="outlined"
              />
            </Box>

            <Divider sx={{ my: 2 }} />

            {/* 성공 목록 */}
            {uploadResult.success.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" gutterBottom>
                  성공 ({uploadResult.success.length})
                </Typography>
                <List dense>
                  {uploadResult.success.slice(0, 5).map((item) => (
                    <ListItem key={item.row}>
                      <ListItemIcon>
                        <CheckCircle color="success" fontSize="small" />
                      </ListItemIcon>
                      <ListItemText
                        primary={`행 ${item.row}: ${item.sku}`}
                        primaryTypographyProps={{ variant: 'body2' }}
                      />
                    </ListItem>
                  ))}
                  {uploadResult.success.length > 5 && (
                    <ListItem>
                      <ListItemText
                        primary={`... 외 ${uploadResult.success.length - 5}개`}
                        primaryTypographyProps={{
                          variant: 'body2',
                          color: 'text.secondary',
                        }}
                      />
                    </ListItem>
                  )}
                </List>
              </Box>
            )}

            {/* 오류 목록 */}
            {uploadResult.errors.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" gutterBottom color="error">
                  오류 ({uploadResult.errors.length})
                </Typography>
                <List dense>
                  {uploadResult.errors.map((item) => (
                    <ListItem key={item.row}>
                      <ListItemIcon>
                        <Error color="error" fontSize="small" />
                      </ListItemIcon>
                      <ListItemText
                        primary={`행 ${item.row}: ${item.sku || 'Unknown'}`}
                        secondary={item.error}
                        primaryTypographyProps={{ variant: 'body2' }}
                        secondaryTypographyProps={{ variant: 'caption' }}
                      />
                    </ListItem>
                  ))}
                </List>
              </Box>
            )}

            {/* 건너뜀 목록 */}
            {uploadResult.skipped.length > 0 && (
              <Box>
                <Typography variant="subtitle2" gutterBottom color="warning.main">
                  건너뜀 ({uploadResult.skipped.length})
                </Typography>
                <List dense>
                  {uploadResult.skipped.map((item) => (
                    <ListItem key={item.row}>
                      <ListItemIcon>
                        <Warning color="warning" fontSize="small" />
                      </ListItemIcon>
                      <ListItemText
                        primary={`행 ${item.row}: ${item.sku}`}
                        secondary={item.reason}
                        primaryTypographyProps={{ variant: 'body2' }}
                        secondaryTypographyProps={{ variant: 'caption' }}
                      />
                    </ListItem>
                  ))}
                </List>
              </Box>
            )}
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose}>닫기</Button>
        {file && !uploadResult && (
          <Button
            onClick={handleUpload}
            variant="contained"
            disabled={uploading}
            startIcon={<CloudUpload />}
          >
            업로드
          </Button>
        )}
        {uploadResult && uploadResult.errors.length === 0 && (
          <Button onClick={onSuccess} variant="contained" color="primary">
            완료
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default BulkUploadDialog;