// ===== 2. packages/frontend/src/pages/SkuMapping/BulkUploadDialog.tsx =====
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
  Stack,
  Link,
  Table,
  TableBody,
  TableRow,
  TableCell,
  Chip,
  IconButton,
} from '@mui/material';
import {
  CloudUpload,
  FileDownload,
  CheckCircle,
  Error,
  Warning,
  Close,
} from '@mui/icons-material';
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
  failed: Array<{ row: number; sku: string; error: string }>;
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

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.type !== 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' &&
          selectedFile.type !== 'application/vnd.ms-excel') {
        showNotification('엑셀 파일만 업로드 가능합니다.', 'error');
        return;
      }
      setFile(selectedFile);
      setUploadResult(null);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      showNotification('파일을 선택해주세요.', 'warning');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await mappingService.bulkUploadMappings(formData);
      
      if (response.data.success) {
        setUploadResult(response.data.data);
        showNotification(
          `업로드 완료: ${response.data.data.success.length}개 성공`,
          'success'
        );
        
        if (response.data.data.success.length > 0) {
          setTimeout(() => {
            onSuccess();
          }, 2000);
        }
      }
    } catch (error: any) {
      console.error('Upload failed:', error);
      showNotification(
        error.response?.data?.message || '업로드에 실패했습니다.',
        'error'
      );
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const response = await mappingService.downloadTemplate();
      
      // Blob 다운로드 처리
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'sku_mapping_template.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
      
      showNotification('템플릿이 다운로드되었습니다.', 'success');
    } catch (error) {
      showNotification('템플릿 다운로드에 실패했습니다.', 'error');
    }
  };

  const handleClose = () => {
    setFile(null);
    setUploadResult(null);
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Typography variant="h6">엑셀 대량 업로드</Typography>
          <IconButton onClick={handleClose} size="small">
            <Close />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        <Stack spacing={3}>
          {/* 안내 메시지 */}
          <Alert severity="info">
            <Typography variant="subtitle2" gutterBottom>
              업로드 방법
            </Typography>
            <ol style={{ margin: 0, paddingLeft: 20 }}>
              <li>템플릿 파일을 다운로드합니다.</li>
              <li>엑셀 파일에 SKU 매핑 정보를 입력합니다.</li>
              <li>작성한 파일을 업로드합니다.</li>
            </ol>
          </Alert>

          {/* 템플릿 다운로드 */}
          <Box>
            <Button
              variant="outlined"
              startIcon={<FileDownload />}
              onClick={handleDownloadTemplate}
              fullWidth
            >
              템플릿 다운로드
            </Button>
          </Box>

          {/* 파일 선택 */}
          <Box>
            <input
              accept=".xlsx,.xls"
              style={{ display: 'none' }}
              id="bulk-upload-file"
              type="file"
              onChange={handleFileSelect}
            />
            <label htmlFor="bulk-upload-file">
              <Button
                variant="contained"
                component="span"
                startIcon={<CloudUpload />}
                fullWidth
                disabled={uploading}
              >
                파일 선택
              </Button>
            </label>
            {file && (
              <Typography variant="body2" sx={{ mt: 1 }}>
                선택된 파일: {file.name}
              </Typography>
            )}
          </Box>

          {/* 업로드 진행 상태 */}
          {uploading && (
            <Box>
              <Typography variant="body2" gutterBottom>
                업로드 중...
              </Typography>
              <LinearProgress />
            </Box>
          )}

          {/* 업로드 결과 */}
          {uploadResult && (
            <Box>
              <Typography variant="h6" gutterBottom>
                업로드 결과
              </Typography>
              
              <Stack spacing={2}>
                <Alert severity="info">
                  전체: {uploadResult.total}개
                </Alert>

                {uploadResult.success.length > 0 && (
                  <Alert severity="success">
                    성공: {uploadResult.success.length}개
                    <Box sx={{ mt: 1 }}>
                      {uploadResult.success.slice(0, 5).map((item) => (
                        <Chip
                          key={item.sku}
                          label={`Row ${item.row}: ${item.sku}`}
                          size="small"
                          color="success"
                          sx={{ mr: 1, mb: 0.5 }}
                        />
                      ))}
                      {uploadResult.success.length > 5 && (
                        <Typography variant="caption">
                          외 {uploadResult.success.length - 5}개...
                        </Typography>
                      )}
                    </Box>
                  </Alert>
                )}

                {uploadResult.failed.length > 0 && (
                  <Alert severity="error">
                    실패: {uploadResult.failed.length}개
                    <Table size="small" sx={{ mt: 1 }}>
                      <TableBody>
                        {uploadResult.failed.slice(0, 5).map((item) => (
                          <TableRow key={item.sku}>
                            <TableCell>Row {item.row}</TableCell>
                            <TableCell>{item.sku}</TableCell>
                            <TableCell>{item.error}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {uploadResult.failed.length > 5 && (
                      <Typography variant="caption">
                        외 {uploadResult.failed.length - 5}개...
                      </Typography>
                    )}
                  </Alert>
                )}

                {uploadResult.skipped.length > 0 && (
                  <Alert severity="warning">
                    건너뜀: {uploadResult.skipped.length}개
                    <Table size="small" sx={{ mt: 1 }}>
                      <TableBody>
                        {uploadResult.skipped.slice(0, 5).map((item) => (
                          <TableRow key={item.sku}>
                            <TableCell>Row {item.row}</TableCell>
                            <TableCell>{item.sku}</TableCell>
                            <TableCell>{item.reason}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {uploadResult.skipped.length > 5 && (
                      <Typography variant="caption">
                        외 {uploadResult.skipped.length - 5}개...
                      </Typography>
                    )}
                  </Alert>
                )}
              </Stack>
            </Box>
          )}
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose}>닫기</Button>
        <Button
          onClick={handleUpload}
          variant="contained"
          disabled={!file || uploading}
        >
          업로드
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default BulkUploadDialog;