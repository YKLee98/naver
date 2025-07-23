// packages/frontend/src/components/inventory/BulkInventoryEditor/index.tsx
import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  Stepper,
  Step,
  StepLabel,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  LinearProgress,
} from '@mui/material';
import {
  Upload as UploadIcon,
  Download as DownloadIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
} from '@mui/icons-material';
import { useDropzone } from 'react-dropzone';
import { useBulkUpdateInventoryMutation } from '@store/api/apiSlice';
import { useNotification } from '@hooks/useNotification';
import { formatNumber } from '@utils/formatters';

interface BulkInventoryEditorProps {
  open: boolean;
  onClose: () => void;
}

const BulkInventoryEditor: React.FC<BulkInventoryEditorProps> = ({ open, onClose }) => {
  const notify = useNotification();
  const [activeStep, setActiveStep] = useState(0);
  const [uploadedData, setUploadedData] = useState<any[]>([]);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [bulkUpdate, { isLoading }] = useBulkUpdateInventoryMutation();

  const steps = ['파일 업로드', '데이터 검증', '미리보기', '적용'];

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
    },
    onDrop: (acceptedFiles) => {
      handleFileUpload(acceptedFiles[0]);
    },
  });

  const handleFileUpload = async (file: File) => {
    try {
      // 파일 파싱 로직
      notify.info('파일 업로드', '파일을 처리하고 있습니다...');
      
      // 시뮬레이션
      setTimeout(() => {
        setUploadedData([
          { sku: 'SKU001', naverQuantity: 100, shopifyQuantity: 95 },
          { sku: 'SKU002', naverQuantity: 50, shopifyQuantity: 48 },
        ]);
        setActiveStep(1);
      }, 1000);
    } catch (error) {
      notify.error('업로드 실패', '파일 처리 중 오류가 발생했습니다.');
    }
  };

  const handleValidation = () => {
    const errors: string[] = [];
    
    uploadedData.forEach((item, index) => {
      if (!item.sku) {
        errors.push(`행 ${index + 1}: SKU가 없습니다`);
      }
      if (item.naverQuantity < 0 || item.shopifyQuantity < 0) {
        errors.push(`행 ${index + 1}: 재고 수량은 0 이상이어야 합니다`);
      }
    });

    setValidationErrors(errors);
    
    if (errors.length === 0) {
      setActiveStep(2);
    }
  };

  const handleApply = async () => {
    try {
      await bulkUpdate({ items: uploadedData }).unwrap();
      notify.success('일괄 수정 완료', `${uploadedData.length}개 항목이 수정되었습니다.`);
      onClose();
    } catch (error) {
      notify.error('수정 실패', '재고 일괄 수정 중 오류가 발생했습니다.');
    }
  };

  const downloadTemplate = () => {
    const csvContent = 'SKU,네이버재고,Shopify재고\nSKU001,100,100\nSKU002,50,50';
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'inventory_template.csv';
    link.click();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>재고 일괄 수정</DialogTitle>
      
      <DialogContent>
        <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
          {steps.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {activeStep === 0 && (
          <Box>
            <Alert severity="info" sx={{ mb: 3 }}>
              CSV 또는 Excel 파일을 업로드하여 재고를 일괄 수정할 수 있습니다.
            </Alert>
            
            <Box
              {...getRootProps()}
              sx={{
                border: '2px dashed #ccc',
                borderRadius: 2,
                p: 4,
                textAlign: 'center',
                cursor: 'pointer',
                bgcolor: isDragActive ? 'action.hover' : 'background.paper',
                mb: 3,
              }}
            >
              <input {...getInputProps()} />
              <UploadIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
              <Typography variant="h6" gutterBottom>
                {isDragActive ? '파일을 놓으세요' : '파일을 드래그하거나 클릭하여 선택'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                CSV, XLSX 파일 지원
              </Typography>
            </Box>

            <Button
              variant="outlined"
              startIcon={<DownloadIcon />}
              onClick={downloadTemplate}
              fullWidth
            >
              템플릿 다운로드
            </Button>
          </Box>
        )}

        {activeStep === 1 && (
          <Box>
            <Typography variant="h6" gutterBottom>
              데이터 검증
            </Typography>
            
            {validationErrors.length > 0 ? (
              <Alert severity="error" sx={{ mb: 3 }}>
                <Typography variant="subtitle2" gutterBottom>
                  다음 오류를 수정해주세요:
                </Typography>
                <ul>
                  {validationErrors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </Alert>
            ) : (
              <Alert severity="success" sx={{ mb: 3 }}>
                모든 데이터가 유효합니다.
              </Alert>
            )}

            <Typography variant="body2" color="text.secondary">
              업로드된 항목: {uploadedData.length}개
            </Typography>
          </Box>
        )}

        {activeStep === 2 && (
          <Box>
            <Typography variant="h6" gutterBottom>
              변경 미리보기
            </Typography>
            
            <TableContainer component={Paper} sx={{ maxHeight: 400 }}>
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>SKU</TableCell>
                    <TableCell align="right">현재 네이버 재고</TableCell>
                    <TableCell align="right">새 네이버 재고</TableCell>
                    <TableCell align="right">현재 Shopify 재고</TableCell>
                    <TableCell align="right">새 Shopify 재고</TableCell>
                    <TableCell>상태</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {uploadedData.map((item) => (
                    <TableRow key={item.sku}>
                      <TableCell>{item.sku}</TableCell>
                      <TableCell align="right">{formatNumber(100)}</TableCell>
                      <TableCell align="right">{formatNumber(item.naverQuantity)}</TableCell>
                      <TableCell align="right">{formatNumber(95)}</TableCell>
                      <TableCell align="right">{formatNumber(item.shopifyQuantity)}</TableCell>
                      <TableCell>
                        <Chip
                          label="변경됨"
                          color="warning"
                          size="small"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}

        {activeStep === 3 && (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            {isLoading ? (
              <>
                <LinearProgress sx={{ mb: 3 }} />
                <Typography>재고를 업데이트하고 있습니다...</Typography>
              </>
            ) : (
              <>
                <Typography variant="h6" gutterBottom>
                  준비 완료
                </Typography>
                <Typography color="text.secondary">
                  {uploadedData.length}개 항목의 재고가 수정됩니다.
                </Typography>
              </>
            )}
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} startIcon={<CancelIcon />}>
          취소
        </Button>
        
        {activeStep === 0 && uploadedData.length > 0 && (
          <Button
            variant="contained"
            onClick={() => setActiveStep(1)}
          >
            다음
          </Button>
        )}
        
        {activeStep === 1 && (
          <Button
            variant="contained"
            onClick={handleValidation}
          >
            검증
          </Button>
        )}
        
        {activeStep === 2 && (
          <Button
            variant="contained"
            onClick={() => setActiveStep(3)}
          >
            적용
          </Button>
        )}
        
        {activeStep === 3 && !isLoading && (
          <Button
            variant="contained"
            startIcon={<SaveIcon />}
            onClick={handleApply}
          >
            확인
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default BulkInventoryEditor;