import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  Stack,
  Typography,
  Alert,
  Box,
} from '@mui/material';
import { ProductMapping } from '@/types';
import { formatNumber } from '@/utils/formatters';
import { useAdjustInventoryMutation } from '@/store/api/apiSlice';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';

interface StockAdjustmentProps {
  open: boolean;
  onClose: () => void;
  product: ProductMapping | null;
}

const StockAdjustment: React.FC<StockAdjustmentProps> = ({
  open,
  onClose,
  product,
}) => {
  const [adjustType, setAdjustType] = useState<'set' | 'add' | 'subtract'>('set');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [platform, setPlatform] = useState<'naver' | 'shopify'>('naver');
  
  const [adjustInventory, { isLoading }] = useAdjustInventoryMutation();
  const realTimeUpdates = useSelector(
    (state: RootState) => state.inventory.realTimeUpdates
  );

  const currentQuantity = product ? 
    (realTimeUpdates[product.sku]?.quantity ?? 0) : 0;

  const handleSubmit = async () => {
    if (!product || !quantity || !reason) return;

    try {
      const adjustment = adjustType === 'set' 
        ? parseInt(quantity) - currentQuantity
        : adjustType === 'add'
        ? parseInt(quantity)
        : -parseInt(quantity);

      await adjustInventory({
        sku: product.sku,
        adjustment,
        reason,
        platform,
      }).unwrap();

      handleClose();
    } catch (error) {
      console.error('Stock adjustment failed:', error);
    }
  };

  const handleClose = () => {
    setAdjustType('set');
    setQuantity('');
    setReason('');
    setPlatform('naver');
    onClose();
  };

  const getPreviewQuantity = () => {
    if (!quantity || isNaN(parseInt(quantity))) return currentQuantity;
    
    const qty = parseInt(quantity);
    switch (adjustType) {
      case 'set':
        return qty;
      case 'add':
        return currentQuantity + qty;
      case 'subtract':
        return Math.max(0, currentQuantity - qty);
      default:
        return currentQuantity;
    }
  };

  if (!product) return null;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>재고 조정 - {product.sku}</DialogTitle>
      <DialogContent>
        <Stack spacing={3} sx={{ mt: 2 }}>
          <Box>
            <Typography variant="subtitle2" color="text.secondary">
              상품명
            </Typography>
            <Typography variant="body1">{product.productName}</Typography>
          </Box>

          <Box>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              현재 재고
            </Typography>
            <Typography variant="h5" color="primary">
              {formatNumber(currentQuantity)}개
            </Typography>
          </Box>

          <FormControl component="fieldset">
            <FormLabel component="legend">조정 방식</FormLabel>
            <RadioGroup
              row
              value={adjustType}
              onChange={(e) => setAdjustType(e.target.value as any)}
            >
              <FormControlLabel
                value="set"
                control={<Radio />}
                label="절대값 설정"
              />
              <FormControlLabel
                value="add"
                control={<Radio />}
                label="추가"
              />
              <FormControlLabel
                value="subtract"
                control={<Radio />}
                label="차감"
              />
            </RadioGroup>
          </FormControl>

          <TextField
            fullWidth
            label={
              adjustType === 'set' 
                ? '설정할 수량' 
                : adjustType === 'add'
                ? '추가할 수량'
                : '차감할 수량'
            }
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            inputProps={{ min: 0 }}
            required
          />

          <TextField
            fullWidth
            label="조정 사유"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            multiline
            rows={2}
            required
          />

          <FormControl component="fieldset">
            <FormLabel component="legend">플랫폼</FormLabel>
            <RadioGroup
              row
              value={platform}
              onChange={(e) => setPlatform(e.target.value as any)}
            >
              <FormControlLabel
                value="naver"
                control={<Radio />}
                label="네이버 기준"
              />
              <FormControlLabel
                value="shopify"
                control={<Radio />}
                label="Shopify 기준"
              />
            </RadioGroup>
          </FormControl>

          {quantity && (
            <Alert severity="info">
              조정 후 재고: <strong>{formatNumber(getPreviewQuantity())}개</strong>
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>취소</Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={!quantity || !reason || isLoading}
        >
          {isLoading ? '처리 중...' : '재고 조정'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default StockAdjustment;

