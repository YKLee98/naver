// ===== 3. packages/frontend/src/pages/SkuMapping/AutoDiscoverDialog.tsx =====
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
  FormControlLabel,
  Switch,
  Slider,
  Table,
  TableBody,
  TableRow,
  TableCell,
  TableHead,
  Checkbox,
  Chip,
  IconButton,
} from '@mui/material';
import {
  AutoFixHigh,
  CheckCircle,
  Close,
} from '@mui/icons-material';
import { mappingService } from '@/services/api/mapping.service';
import { useNotification } from '@/hooks/useNotification';

interface AutoDiscoverDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface DiscoveredMapping {
  sku: string;
  naverProductId: string;
  naverProductName: string;
  shopifyProductId: string;
  shopifyProductName: string;
  confidence: number;
  selected?: boolean;
}

const AutoDiscoverDialog: React.FC<AutoDiscoverDialogProps> = ({
  open,
  onClose,
  onSuccess,
}) => {
  const { showNotification } = useNotification();
  const [discovering, setDiscovering] = useState(false);
  const [discoveries, setDiscoveries] = useState<DiscoveredMapping[]>([]);
  const [selectedMappings, setSelectedMappings] = useState<string[]>([]);
  
  // 옵션 상태
  const [matchBySku, setMatchBySku] = useState(true);
  const [matchByName, setMatchByName] = useState(false);
  const [nameSimilarity, setNameSimilarity] = useState(80);
  const [priceDifference, setPriceDifference] = useState(20);
  const [autoCreate, setAutoCreate] = useState(false);

  const handleDiscover = async () => {
    setDiscovering(true);
    setDiscoveries([]);
    setSelectedMappings([]);

    try {
      const response = await mappingService.autoDiscoverMappings({
        matchBySku,
        matchByName,
        nameSimilarity,
        priceDifference,
      });

      if (response.data.success) {
        const discovered = response.data.data.discovered || [];
        setDiscoveries(discovered);
        
        // 신뢰도 80% 이상인 항목 자동 선택
        const autoSelected = discovered
          .filter((d: DiscoveredMapping) => d.confidence >= 80)
          .map((d: DiscoveredMapping) => d.sku);
        setSelectedMappings(autoSelected);
        
        showNotification(
          `${discovered.length}개의 잠재적 매핑을 발견했습니다.`,
          'info'
        );
      }
    } catch (error: any) {
      console.error('Auto discover failed:', error);
      showNotification(
        error.response?.data?.message || '자동 탐색에 실패했습니다.',
        'error'
      );
    } finally {
      setDiscovering(false);
    }
  };

  const handleCreateMappings = async () => {
    if (selectedMappings.length === 0) {
      showNotification('생성할 매핑을 선택해주세요.', 'warning');
      return;
    }

    try {
      const mappingsToCreate = discoveries.filter(d => 
        selectedMappings.includes(d.sku)
      );

      const response = await mappingService.bulkCreateMappings(mappingsToCreate);
      
      if (response.data.success) {
        showNotification(
          `${selectedMappings.length}개의 매핑이 생성되었습니다.`,
          'success'
        );
        onSuccess();
      }
    } catch (error: any) {
      console.error('Create mappings failed:', error);
      showNotification(
        error.response?.data?.message || '매핑 생성에 실패했습니다.',
        'error'
      );
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 90) return 'success';
    if (confidence >= 70) return 'warning';
    return 'error';
  };

  const handleClose = () => {
    setDiscoveries([]);
    setSelectedMappings([]);
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Box display="flex" alignItems="center" gap={1}>
            <AutoFixHigh />
            <Typography variant="h6">자동 매핑 탐색</Typography>
          </Box>
          <IconButton onClick={handleClose} size="small">
            <Close />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        <Stack spacing={3}>
          {/* 옵션 설정 */}
          <Box>
            <Typography variant="subtitle1" gutterBottom>
              탐색 옵션
            </Typography>
            
            <Stack spacing={2}>
              <FormControlLabel
                control={
                  <Switch
                    checked={matchBySku}
                    onChange={(e) => setMatchBySku(e.target.checked)}
                  />
                }
                label="SKU로 매칭"
              />
              
              <FormControlLabel
                control={
                  <Switch
                    checked={matchByName}
                    onChange={(e) => setMatchByName(e.target.checked)}
                  />
                }
                label="상품명으로 매칭"
              />
              
              {matchByName && (
                <Box>
                  <Typography variant="body2" gutterBottom>
                    상품명 유사도: {nameSimilarity}%
                  </Typography>
                  <Slider
                    value={nameSimilarity}
                    onChange={(e, value) => setNameSimilarity(value as number)}
                    min={50}
                    max={100}
                    step={5}
                    marks
                    valueLabelDisplay="auto"
                  />
                </Box>
              )}
              
              <Box>
                <Typography variant="body2" gutterBottom>
                  가격 차이 허용 범위: {priceDifference}%
                </Typography>
                <Slider
                  value={priceDifference}
                  onChange={(e, value) => setPriceDifference(value as number)}
                  min={0}
                  max={50}
                  step={5}
                  marks
                  valueLabelDisplay="auto"
                />
              </Box>
            </Stack>
          </Box>

          {/* 탐색 버튼 */}
          <Box>
            <Button
              variant="contained"
              onClick={handleDiscover}
              disabled={discovering}
              startIcon={<AutoFixHigh />}
              fullWidth
            >
              탐색 시작
            </Button>
          </Box>

          {/* 진행 상태 */}
          {discovering && (
            <Box>
              <Typography variant="body2" gutterBottom>
                매핑 가능한 상품을 탐색 중...
              </Typography>
              <LinearProgress />
            </Box>
          )}

          {/* 탐색 결과 */}
          {discoveries.length > 0 && (
            <Box>
              <Typography variant="h6" gutterBottom>
                탐색 결과: {discoveries.length}개 발견
              </Typography>
              
              <Alert severity="info" sx={{ mb: 2 }}>
                신뢰도 80% 이상인 항목이 자동으로 선택되었습니다.
              </Alert>

              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox">
                      <Checkbox
                        indeterminate={
                          selectedMappings.length > 0 &&
                          selectedMappings.length < discoveries.length
                        }
                        checked={
                          discoveries.length > 0 &&
                          selectedMappings.length === discoveries.length
                        }
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedMappings(discoveries.map(d => d.sku));
                          } else {
                            setSelectedMappings([]);
                          }
                        }}
                      />
                    </TableCell>
                    <TableCell>SKU</TableCell>
                    <TableCell>네이버 상품</TableCell>
                    <TableCell>Shopify 상품</TableCell>
                    <TableCell align="center">신뢰도</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {discoveries.map((discovery) => (
                    <TableRow key={discovery.sku}>
                      <TableCell padding="checkbox">
                        <Checkbox
                          checked={selectedMappings.includes(discovery.sku)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedMappings([...selectedMappings, discovery.sku]);
                            } else {
                              setSelectedMappings(
                                selectedMappings.filter(s => s !== discovery.sku)
                              );
                            }
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight="bold">
                          {discovery.sku}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption">
                          {discovery.naverProductName}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption">
                          {discovery.shopifyProductName}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          label={`${discovery.confidence}%`}
                          size="small"
                          color={getConfidenceColor(discovery.confidence) as any}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          )}
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose}>취소</Button>
        <Button
          onClick={handleCreateMappings}
          variant="contained"
          disabled={selectedMappings.length === 0}
          startIcon={<CheckCircle />}
        >
          선택한 {selectedMappings.length}개 매핑 생성
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AutoDiscoverDialog;