// packages/frontend/src/pages/SkuMapping/AutoDiscoverDialog.tsx
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
  ListItemSecondaryAction,
  Checkbox,
  FormControlLabel,
  Slider,
  Divider,
  Chip,
  IconButton,
  Collapse,
  Radio,
  RadioGroup,
  Card,
  CardContent,
} from '@mui/material';
import {
  AutoFixHigh,
  ExpandMore,
  ExpandLess,
  CheckCircle,
  Link,
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
  naverProduct: {
    id: string;
    name: string;
    price: number;
  };
  shopifyMatches: Array<{
    id: string;
    title: string;
    price: string;
    similarity: number;
  }>;
  selectedShopifyId?: string;
}

const AutoDiscoverDialog: React.FC<AutoDiscoverDialogProps> = ({
  open,
  onClose,
  onSuccess,
}) => {
  const { showNotification } = useNotification();
  const [discovering, setDiscovering] = useState(false);
  const [discoveries, setDiscoveries] = useState<DiscoveredMapping[]>([]);
  const [selectedMappings, setSelectedMappings] = useState<Set<string>>(new Set());
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  // 탐색 옵션
  const [matchBySku, setMatchBySku] = useState(true);
  const [matchByName, setMatchByName] = useState(false);
  const [nameSimilarity, setNameSimilarity] = useState(80);
  const [priceDifference, setPriceDifference] = useState(20);

  const handleDiscover = async () => {
    setDiscovering(true);
    setDiscoveries([]);
    setSelectedMappings(new Set());

    try {
      const response = await mappingService.autoDiscoverMappings({
        matchBySku,
        matchByName,
        nameSimilarity,
        priceDifference,
      });

      const discoveredMappings: DiscoveredMapping[] = response.data.mappings.map((m: any) => ({
        ...m,
        selectedShopifyId: m.shopifyMatches.length > 0 ? m.shopifyMatches[0].id : undefined,
      }));

      setDiscoveries(discoveredMappings);

      // 자동으로 첫 번째 매치를 가진 항목들 선택
      const autoSelected = new Set<string>();
      discoveredMappings.forEach((d) => {
        if (d.shopifyMatches.length === 1 || (d.shopifyMatches.length > 0 && d.shopifyMatches[0].similarity >= 90)) {
          autoSelected.add(d.sku);
        }
      });
      setSelectedMappings(autoSelected);

      showNotification(`${response.data.found}개의 잠재적 매핑을 발견했습니다.`, 'info');
    } catch (error) {
      showNotification('자동 탐색에 실패했습니다.', 'error');
    } finally {
      setDiscovering(false);
    }
  };

  const handleSaveSelected = async () => {
    const mappingsToSave = discoveries
      .filter((d) => selectedMappings.has(d.sku) && d.selectedShopifyId)
      .map((d) => ({
        sku: d.sku,
        naverProductId: d.naverProduct.id,
        shopifyProductId: d.selectedShopifyId,
        isActive: true,
      }));

    if (mappingsToSave.length === 0) {
      showNotification('저장할 매핑을 선택해주세요.', 'warning');
      return;
    }

    setSaving(true);
    let successCount = 0;
    let errorCount = 0;

    for (const mapping of mappingsToSave) {
      try {
        await mappingService.createMapping(mapping);
        successCount++;
      } catch (error) {
        errorCount++;
      }
    }

    setSaving(false);

    if (successCount > 0) {
      showNotification(`${successCount}개 매핑이 생성되었습니다.`, 'success');
      onSuccess();
    }

    if (errorCount > 0) {
      showNotification(`${errorCount}개 매핑 생성에 실패했습니다.`, 'error');
    }
  };

  const toggleExpanded = (sku: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(sku)) {
      newExpanded.delete(sku);
    } else {
      newExpanded.add(sku);
    }
    setExpandedItems(newExpanded);
  };

  const toggleSelected = (sku: string) => {
    const newSelected = new Set(selectedMappings);
    if (newSelected.has(sku)) {
      newSelected.delete(sku);
    } else {
      newSelected.add(sku);
    }
    setSelectedMappings(newSelected);
  };

  const handleSelectMatch = (sku: string, shopifyId: string) => {
    setDiscoveries((prev) =>
      prev.map((d) =>
        d.sku === sku ? { ...d, selectedShopifyId: shopifyId } : d
      )
    );
  };

  const handleClose = () => {
    setDiscoveries([]);
    setSelectedMappings(new Set());
    setExpandedItems(new Set());
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        <Box display="flex" alignItems="center" gap={1}>
          <AutoFixHigh />
          자동 매핑 탐색
        </Box>
      </DialogTitle>

      <DialogContent>
        {/* 탐색 옵션 */}
        {discoveries.length === 0 && !discovering && (
          <Box sx={{ mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              탐색 옵션
            </Typography>

            <Box sx={{ p: 2, bgcolor: 'background.paper', borderRadius: 1 }}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={matchBySku}
                    onChange={(e) => setMatchBySku(e.target.checked)}
                  />
                }
                label="SKU 완전 일치"
              />

              <FormControlLabel
                control={
                  <Checkbox
                    checked={matchByName}
                    onChange={(e) => setMatchByName(e.target.checked)}
                  />
                }
                label="상품명 유사도"
              />

              {matchByName && (
                <Box sx={{ ml: 4, mt: 1 }}>
                  <Typography variant="body2" gutterBottom>
                    유사도 임계값: {nameSimilarity}%
                  </Typography>
                  <Slider
                    value={nameSimilarity}
                    onChange={(e, value) => setNameSimilarity(value as number)}
                    min={50}
                    max={100}
                    marks
                    step={10}
                    valueLabelDisplay="auto"
                    sx={{ maxWidth: 300 }}
                  />
                </Box>
              )}

              <Box sx={{ mt: 2 }}>
                <Typography variant="body2" gutterBottom>
                  가격 차이 허용 범위: {priceDifference}%
                </Typography>
                <Slider
                  value={priceDifference}
                  onChange={(e, value) => setPriceDifference(value as number)}
                  min={0}
                  max={50}
                  marks
                  step={5}
                  valueLabelDisplay="auto"
                  sx={{ maxWidth: 300 }}
                />
              </Box>
            </Box>
          </Box>
        )}

        {/* 탐색 중 */}
        {discovering && (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography variant="body1" gutterBottom>
              매핑 가능한 상품을 탐색하고 있습니다...
            </Typography>
            <LinearProgress sx={{ mt: 2 }} />
          </Box>
        )}

        {/* 탐색 결과 */}
        {discoveries.length > 0 && (
          <>
            <Alert severity="info" sx={{ mb: 2 }}>
              {discoveries.length}개의 잠재적 매핑을 발견했습니다. 
              저장할 항목을 선택해주세요.
            </Alert>

            <Box sx={{ mb: 2 }}>
              <Button
                size="small"
                onClick={() => {
                  const allSkus = new Set(discoveries.map((d) => d.sku));
                  setSelectedMappings(allSkus);
                }}
              >
                전체 선택
              </Button>
              <Button
                size="small"
                onClick={() => setSelectedMappings(new Set())}
                sx={{ ml: 1 }}
              >
                전체 해제
              </Button>
              <Chip
                label={`선택: ${selectedMappings.size}/${discoveries.length}`}
                size="small"
                sx={{ ml: 2 }}
              />
            </Box>

            <List>
              {discoveries.map((discovery) => (
                <React.Fragment key={discovery.sku}>
                  <ListItem>
                    <Checkbox
                      checked={selectedMappings.has(discovery.sku)}
                      onChange={() => toggleSelected(discovery.sku)}
                    />
                    <ListItemText
                      primary={
                        <Box display="flex" alignItems="center" gap={1}>
                          <Typography variant="subtitle2">
                            {discovery.sku}
                          </Typography>
                          <Chip
                            label={`${discovery.shopifyMatches.length}개 매치`}
                            size="small"
                            color={discovery.shopifyMatches.length > 0 ? 'primary' : 'default'}
                          />
                        </Box>
                      }
                      secondary={
                        <Box>
                          <Typography variant="body2" color="text.secondary">
                            네이버: {discovery.naverProduct.name}
                          </Typography>
                          {discovery.selectedShopifyId && (
                            <Typography variant="body2" color="primary">
                              선택됨: {
                                discovery.shopifyMatches.find(
                                  (m) => m.id === discovery.selectedShopifyId
                                )?.title
                              }
                            </Typography>
                          )}
                        </Box>
                      }
                    />
                    <ListItemSecondaryAction>
                      <IconButton
                        onClick={() => toggleExpanded(discovery.sku)}
                        disabled={discovery.shopifyMatches.length === 0}
                      >
                        {expandedItems.has(discovery.sku) ? <ExpandLess /> : <ExpandMore />}
                      </IconButton>
                    </ListItemSecondaryAction>
                  </ListItem>

                  <Collapse in={expandedItems.has(discovery.sku)}>
                    <Box sx={{ pl: 8, pr: 2, pb: 2 }}>
                      <RadioGroup
                        value={discovery.selectedShopifyId || ''}
                        onChange={(e) => handleSelectMatch(discovery.sku, e.target.value)}
                      >
                        {discovery.shopifyMatches.map((match) => (
                          <Card key={match.id} sx={{ mb: 1 }}>
                            <CardContent sx={{ py: 1 }}>
                              <FormControlLabel
                                value={match.id}
                                control={<Radio size="small" />}
                                label={
                                  <Box>
                                    <Typography variant="body2">
                                      {match.title}
                                    </Typography>
                                    <Box display="flex" gap={1} mt={0.5}>
                                      <Chip
                                        label={`유사도: ${match.similarity.toFixed(0)}%`}
                                        size="small"
                                        color={match.similarity >= 90 ? 'success' : 'default'}
                                      />
                                      <Chip
                                        label={`가격: $${match.price}`}
                                        size="small"
                                      />
                                    </Box>
                                  </Box>
                                }
                              />
                            </CardContent>
                          </Card>
                        ))}
                      </RadioGroup>
                    </Box>
                  </Collapse>

                  <Divider />
                </React.Fragment>
              ))}
            </List>
          </>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose}>취소</Button>
        {discoveries.length === 0 && !discovering && (
          <Button
            onClick={handleDiscover}
            variant="contained"
            disabled={!matchBySku && !matchByName}
            startIcon={<AutoFixHigh />}
          >
            탐색 시작
          </Button>
        )}
        {discoveries.length > 0 && (
          <Button
            onClick={handleSaveSelected}
            variant="contained"
            disabled={selectedMappings.size === 0 || saving}
            startIcon={saving ? <LinearProgress size={20} /> : <CheckCircle />}
          >
            선택 항목 저장 ({selectedMappings.size})
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default AutoDiscoverDialog;