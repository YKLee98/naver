// packages/frontend/src/pages/Inventory/InventoryAdjustDialog.tsx
import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  RadioGroup,
  FormControlLabel,
  Radio,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Grid,
  Alert,
  Divider,
  InputAdornment,
} from '@mui/material';
import { inventoryService } from '@/services/api/inventory.service';
import { useNotification } from '@/hooks/useNotification';
import { formatNumber } from '@/utils/formatters';

interface InventoryAdjustDialogProps {
  open: boolean;
  onClose: () => void;
  inventory: {
    sku: string;
    productName: string;
    naverStock: number;
    shopifyStock: number;
  };
  onSuccess: () => void;
}

type AdjustType = 'absolute' | 'relative' | 'sync';
type Platform = 'naver' | 'shopify' | 'both';

const adjustReasons = [
  { value: 'physical_count', label: '실물 재고 실사' },
  { value: 'return', label: '반품 입고' },
  { value: 'damage', label: '불량품 폐기' },
  { value: 'transfer', label: '재고 이동' },
  { value: 'correction', label: '오류 수정' },
  { value: 'other', label: '기타' },
];

const InventoryAdjustDialog: React.FC<InventoryAdjustDialogProps> = ({
  open,
  onClose,
  inventory,
  onSuccess,
}) => {
  const { showNotification } = useNotification();
  
  const [adjustType, setAdjustType] = useState<AdjustType>('absolute');
  const [platform, setPlatform] = useState<Platform>('both');
  const [naverValue, setNaverValue] = useState(inventory.naverStock.toString());
  const [shopifyValue, setShopifyValue] = useState(inventory.shopifyStock.toString());
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 초기값으로 리셋
  const resetForm = () => {
    setAdjustType('absolute');
    setPlatform('both');
    setNaverValue(inventory.naverStock.toString());
    setShopifyValue(inventory.shopifyStock.toString());
    setReason('');
    setNotes('');
  };

  // 닫기 처리
  const handleClose = () => {
    resetForm();
    onClose();
  };

  // 제출 처리
  const handleSubmit = async () => {
    if (!reason) {
      showNotification('조정 사유를 선택해주세요.', 'warning');
      return;
    }

    const naverQuantity = parseInt(naverValue);
    const shopifyQuantity = parseInt(shopifyValue);

    if (isNaN(naverQuantity) || isNaN(shopifyQuantity)) {
      showNotification('올바른 수량을 입력해주세요.', 'warning');
      return;
    }

    setSubmitting(true);
    try {
      await inventoryService.adjustInventory({
        sku: inventory.sku,
        platform,
        adjustType: adjustType === 'sync' ? 'set' : adjustType === 'absolute' ? 'set' : 'add',
        naverQuantity: platform === 'shopify' ? undefined : naverQuantity,
        shopifyQuantity: platform === 'naver' ? undefined : shopifyQuantity,
        reason,
        notes,
      });

      showNotification('재고가 성공적으로 조정되었습니다.', 'success');
      onSuccess();
      handleClose();
    } catch (error) {
      showNotification('재고 조정에 실패했습니다.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // 양쪽 일치시키기
  const handleSync = () => {
    const syncValue = Math.max(inventory.naverStock, inventory.shopifyStock).toString();
    setNaverValue(syncValue);
    setShopifyValue(syncValue);
  };

  // 조정 후 예상 재고
  const getExpectedStock = (current: number, value: string): number => {
    const numValue = parseInt(value) || 0;
    if (adjustType === 'absolute' || adjustType === 'sync') {
      return numValue;
    } else {
      return current + numValue;
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>재고 조정</DialogTitle>
      
      <DialogContent>
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" gutterBottom>
            {inventory.sku} - {inventory.productName}
          </Typography>
          <Box display="flex" gap={2} mt={1}>
            <Chip
              label={`네이버: ${formatNumber(inventory.naverStock)}`}
              size="small"
            />
            <Chip
              label={`Shopify: ${formatNumber(inventory.shopifyStock)}`}
              size="small"
            />
          </Box>
        </Box>

        <Divider sx={{ mb: 3 }} />

        {/* 조정 방식 */}
        <Typography variant="subtitle2" gutterBottom>
          조정 방식
        </Typography>
        <RadioGroup
          value={adjustType}
          onChange={(e) => setAdjustType(e.target.value as AdjustType)}
          sx={{ mb: 3 }}
        >
          <FormControlLabel
            value="absolute"
            control={<Radio size="small" />}
            label="절대값 설정 (특정 수량으로)"
          />
          <FormControlLabel
            value="relative"
            control={<Radio size="small" />}
            label="상대값 조정 (증가/감소)"
          />
          <FormControlLabel
            value="sync"
            control={<Radio size="small" />}
            label="양쪽 일치시키기"
          />
        </RadioGroup>

        {/* 플랫폼 선택 */}
        {adjustType !== 'sync' && (
          <>
            <Typography variant="subtitle2" gutterBottom>
              적용 대상
            </Typography>
            <RadioGroup
              value={platform}
              onChange={(e) => setPlatform(e.target.value as Platform)}
              row
              sx={{ mb: 3 }}
            >
              <FormControlLabel
                value="both"
                control={<Radio size="small" />}
                label="양쪽 모두"
              />
              <FormControlLabel
                value="naver"
                control={<Radio size="small" />}
                label="네이버만"
              />
              <FormControlLabel
                value="shopify"
                control={<Radio size="small" />}
                label="Shopify만"
              />
            </RadioGroup>
          </>
        )}

        {/* 수량 입력 */}
        <Grid container spacing={2} sx={{ mb: 3 }}>
          {(platform === 'both' || platform === 'naver') && (
            <Grid item xs={6}>
              <TextField
                fullWidth
                label={adjustType === 'relative' ? '네이버 조정량' : '네이버 재고'}
                type="number"
                value={naverValue}
                onChange={(e) => setNaverValue(e.target.value)}
                disabled={adjustType === 'sync'}
                InputProps={{
                  startAdornment: adjustType === 'relative' && parseInt(naverValue) >= 0 && (
                    <InputAdornment position="start">+</InputAdornment>
                  ),
                }}
                helperText={
                  adjustType !== 'sync' &&
                  `조정 후: ${formatNumber(getExpectedStock(inventory.naverStock, naverValue))}`
                }
              />
            </Grid>
          )}
          
          {(platform === 'both' || platform === 'shopify') && (
            <Grid item xs={6}>
              <TextField
                fullWidth
                label={adjustType === 'relative' ? 'Shopify 조정량' : 'Shopify 재고'}
                type="number"
                value={shopifyValue}
                onChange={(e) => setShopifyValue(e.target.value)}
                disabled={adjustType === 'sync'}
                InputProps={{
                  startAdornment: adjustType === 'relative' && parseInt(shopifyValue) >= 0 && (
                    <InputAdornment position="start">+</InputAdornment>
                  ),
                }}
                helperText={
                  adjustType !== 'sync' &&
                  `조정 후: ${formatNumber(getExpectedStock(inventory.shopifyStock, shopifyValue))}`
                }
              />
            </Grid>
          )}
        </Grid>

        {adjustType === 'sync' && (
          <Box sx={{ mb: 3 }}>
            <Button variant="outlined" fullWidth onClick={handleSync}>
              더 높은 수량으로 일치시키기
            </Button>
          </Box>
        )}

        {/* 조정 사유 */}
        <FormControl fullWidth sx={{ mb: 2 }}>
          <InputLabel>조정 사유 *</InputLabel>
          <Select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            label="조정 사유 *"
          >
            {adjustReasons.map((r) => (
              <MenuItem key={r.value} value={r.value}>
                {r.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* 메모 */}
        <TextField
          fullWidth
          label="메모"
          multiline
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="추가 설명이 필요한 경우 입력하세요"
        />

        {/* 경고 메시지 */}
        {(getExpectedStock(inventory.naverStock, naverValue) < 0 || 
          getExpectedStock(inventory.shopifyStock, shopifyValue) < 0) && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            재고가 음수가 될 수 없습니다. 수량을 확인해주세요.
          </Alert>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose}>취소</Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={
            submitting ||
            !reason ||
            getExpectedStock(inventory.naverStock, naverValue) < 0 ||
            getExpectedStock(inventory.shopifyStock, shopifyValue) < 0
          }
        >
          조정하기
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default InventoryAdjustDialog;