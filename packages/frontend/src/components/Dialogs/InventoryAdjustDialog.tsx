// packages/frontend/src/components/Dialogs/InventoryAdjustDialog.tsx
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
  Box,
  Typography,
  Alert,
} from '@mui/material';
import { Add, Remove } from '@mui/icons-material';

interface InventoryAdjustDialogProps {
  open: boolean;
  onClose: () => void;
  sku: string | null;
  currentQuantity: number;
  onAdjust: (data: {
    sku: string;
    adjustment: number;
    reason: string;
    platform: 'naver' | 'shopify' | 'both';
  }) => void;
}

const InventoryAdjustDialog: React.FC<InventoryAdjustDialogProps> = ({
  open,
  onClose,
  sku,
  currentQuantity,
  onAdjust,
}) => {
  const [adjustmentType, setAdjustmentType] = useState<'add' | 'subtract' | 'set'>('add');
  const [quantity, setQuantity] = useState<number>(0);
  const [reason, setReason] = useState('');
  const [platform, setPlatform] = useState<'naver' | 'shopify' | 'both'>('both');

  const handleSubmit = () => {
    if (!sku) return;

    let adjustment = quantity;
    if (adjustmentType === 'subtract') {
      adjustment = -quantity;
    } else if (adjustmentType === 'set') {
      adjustment = quantity - currentQuantity;
    }

    onAdjust({
      sku,
      adjustment,
      reason,
      platform,
    });

    // Reset form
    setAdjustmentType('add');
    setQuantity(0);
    setReason('');
    setPlatform('both');
  };

  const getNewQuantity = () => {
    if (adjustmentType === 'add') {
      return currentQuantity + quantity;
    } else if (adjustmentType === 'subtract') {
      return currentQuantity - quantity;
    } else {
      return quantity;
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>재고 조정 - {sku}</DialogTitle>
      <DialogContent>
        <Box sx={{ mt: 2 }}>
          <Typography variant="body2" color="textSecondary" gutterBottom>
            현재 재고: {currentQuantity}
          </Typography>

          <FormControl component="fieldset" sx={{ mt: 2 }}>
            <FormLabel component="legend">조정 방식</FormLabel>
            <RadioGroup
              value={adjustmentType}
              onChange={(e) => setAdjustmentType(e.target.value as any)}
            >
              <FormControlLabel
                value="add"
                control={<Radio />}
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Add fontSize="small" />
                    추가
                  </Box>
                }
              />
              <FormControlLabel
                value="subtract"
                control={<Radio />}
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Remove fontSize="small" />
                    차감
                  </Box>
                }
              />
              <FormControlLabel
                value="set"
                control={<Radio />}
                label="절대값 설정"
              />
            </RadioGroup>
          </FormControl>

          <TextField
            fullWidth
            type="number"
            label="수량"
            value={quantity}
            onChange={(e) => setQuantity(parseInt(e.target.value) || 0)}
            sx={{ mt: 2 }}
            inputProps={{ min: 0 }}
          />

          <TextField
            fullWidth
            label="조정 사유"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            sx={{ mt: 2 }}
            multiline
            rows={2}
          />

          <FormControl component="fieldset" sx={{ mt: 2 }}>
            <FormLabel component="legend">적용 플랫폼</FormLabel>
            <RadioGroup
              value={platform}
              onChange={(e) => setPlatform(e.target.value as any)}
            >
              <FormControlLabel value="both" control={<Radio />} label="양쪽 모두" />
              <FormControlLabel value="naver" control={<Radio />} label="네이버만" />
              <FormControlLabel value="shopify" control={<Radio />} label="Shopify만" />
            </RadioGroup>
          </FormControl>

          <Alert severity="info" sx={{ mt: 2 }}>
            조정 후 재고: {getNewQuantity()}
          </Alert>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>취소</Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={quantity === 0 || !reason}
        >
          조정
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default InventoryAdjustDialog;
