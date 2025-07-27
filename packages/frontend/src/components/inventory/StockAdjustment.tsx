// packages/frontend/src/components/inventory/StockAdjustment.tsx
import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box,
  Typography,
  Alert,
  Grid,
  Divider,
  RadioGroup,
  FormControlLabel,
  Radio,
  InputAdornment,
} from '@mui/material';
import { useFormik } from 'formik';
import * as yup from 'yup';
import { useAdjustInventoryMutation } from '@/store/api/apiSlice';
import { useNotification } from '@/hooks/useNotification';
import { formatNumber } from '@/utils/formatters';

interface StockAdjustmentProps {
  open: boolean;
  onClose: () => void;
  sku: string;
  currentQuantity: {
    naver: number;
    shopify: number;
  };
}

const validationSchema = yup.object({
  platform: yup.string().required('플랫폼을 선택해주세요'),
  adjustmentType: yup.string().required('조정 타입을 선택해주세요'),
  quantity: yup.number()
    .required('수량을 입력해주세요')
    .integer('정수를 입력해주세요')
    .min(0, '0 이상의 값을 입력해주세요'),
  reason: yup.string().required('조정 사유를 입력해주세요'),
});

const StockAdjustment: React.FC<StockAdjustmentProps> = ({
  open,
  onClose,
  sku,
  currentQuantity,
}) => {
  const notify = useNotification();
  const [adjustInventory, { isLoading }] = useAdjustInventoryMutation();

  const formik = useFormik({
    initialValues: {
      platform: 'both',
      adjustmentType: 'set',
      quantity: 0,
      reason: '',
    },
    validationSchema,
    onSubmit: async (values) => {
      try {
        await adjustInventory({
          sku,
          ...values,
        }).unwrap();
        
        notify.success('재고 조정 완료', '재고가 성공적으로 조정되었습니다.');
        onClose();
      } catch (error: any) {
        notify.error('재고 조정 실패', error.data?.message || '재고 조정 중 오류가 발생했습니다.');
      }
    },
  });

  const getNewQuantity = () => {
    const { platform, adjustmentType, quantity } = formik.values;
    const current = platform === 'naver' ? currentQuantity.naver : currentQuantity.shopify;
    
    switch (adjustmentType) {
      case 'set':
        return quantity;
      case 'add':
        return current + quantity;
      case 'subtract':
        return Math.max(0, current - quantity);
      default:
        return current;
    }
  };

  const getAffectedPlatforms = () => {
    switch (formik.values.platform) {
      case 'both':
        return ['네이버', 'Shopify'];
      case 'naver':
        return ['네이버'];
      case 'shopify':
        return ['Shopify'];
      default:
        return [];
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <form onSubmit={formik.handleSubmit}>
        <DialogTitle>재고 조정 - {sku}</DialogTitle>
        
        <DialogContent>
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle2" gutterBottom>
              현재 재고
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={6}>
                <Box sx={{ p: 2, bgcolor: 'grey.100', borderRadius: 1 }}>
                  <Typography variant="body2" color="text.secondary">
                    네이버
                  </Typography>
                  <Typography variant="h6">
                    {formatNumber(currentQuantity.naver)}
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={6}>
                <Box sx={{ p: 2, bgcolor: 'grey.100', borderRadius: 1 }}>
                  <Typography variant="body2" color="text.secondary">
                    Shopify
                  </Typography>
                  <Typography variant="h6">
                    {formatNumber(currentQuantity.shopify)}
                  </Typography>
                </Box>
              </Grid>
            </Grid>
          </Box>

          <Divider sx={{ mb: 3 }} />

          <Grid container spacing={2}>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>플랫폼</InputLabel>
                <Select
                  name="platform"
                  value={formik.values.platform}
                  onChange={formik.handleChange}
                  error={formik.touched.platform && Boolean(formik.errors.platform)}
                >
                  <MenuItem value="both">모든 플랫폼</MenuItem>
                  <MenuItem value="naver">네이버만</MenuItem>
                  <MenuItem value="shopify">Shopify만</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12}>
              <FormControl>
                <Typography variant="subtitle2" gutterBottom>
                  조정 타입
                </Typography>
                <RadioGroup
                  name="adjustmentType"
                  value={formik.values.adjustmentType}
                  onChange={formik.handleChange}
                  row
                >
                  <FormControlLabel value="set" control={<Radio />} label="설정" />
                  <FormControlLabel value="add" control={<Radio />} label="추가" />
                  <FormControlLabel value="subtract" control={<Radio />} label="차감" />
                </RadioGroup>
              </FormControl>
            </Grid>

            <Grid item xs={12}>
              <TextField
                fullWidth
                name="quantity"
                label="수량"
                type="number"
                value={formik.values.quantity}
                onChange={formik.handleChange}
                error={formik.touched.quantity && Boolean(formik.errors.quantity)}
                helperText={formik.touched.quantity && formik.errors.quantity}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      {formik.values.adjustmentType === 'add' && '+'}
                      {formik.values.adjustmentType === 'subtract' && '-'}
                    </InputAdornment>
                  ),
                }}
              />
            </Grid>

            <Grid item xs={12}>
              <TextField
                fullWidth
                multiline
                rows={3}
                name="reason"
                label="조정 사유"
                value={formik.values.reason}
                onChange={formik.handleChange}
                error={formik.touched.reason && Boolean(formik.errors.reason)}
                helperText={formik.touched.reason && formik.errors.reason}
              />
            </Grid>
          </Grid>

          {formik.values.quantity > 0 && (
            <Alert severity="info" sx={{ mt: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                조정 후 예상 재고:
              </Typography>
              {getAffectedPlatforms().map((platform) => (
                <Typography key={platform} variant="body2">
                  {platform}: {formatNumber(getNewQuantity())}
                </Typography>
              ))}
            </Alert>
          )}
        </DialogContent>

        <DialogActions>
          <Button onClick={onClose} disabled={isLoading}>
            취소
          </Button>
          <Button type="submit" variant="contained" disabled={isLoading}>
            {isLoading ? '처리 중...' : '조정하기'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default StockAdjustment;