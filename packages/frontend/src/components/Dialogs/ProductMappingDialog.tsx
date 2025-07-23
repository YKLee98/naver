// packages/frontend/src/components/Dialogs/ProductMappingDialog.tsx
import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormHelperText,
  Alert,
  Autocomplete,
  InputAdornment,
  Switch,
  FormControlLabel,
  Box,
  Typography,
  Divider,
} from '@mui/material';
import { useFormik } from 'formik';
import * as yup from 'yup';
import { useAppDispatch, useAppSelector } from '@/hooks';
import { searchNaverProducts, searchShopifyProducts } from '@/store/slices/productSlice';

interface ProductMappingDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: any) => void;
  initialData?: any;
}

const validationSchema = yup.object({
  sku: yup.string().required('SKU는 필수입니다'),
  naverProductId: yup.string().required('네이버 상품 ID는 필수입니다'),
  shopifyProductId: yup.string().required('Shopify 상품 ID는 필수입니다'),
  shopifyVariantId: yup.string().required('Shopify Variant ID는 필수입니다'),
  priceMargin: yup.number()
    .min(1, '마진은 0% 이상이어야 합니다')
    .max(2, '마진은 100% 이하여야 합니다')
    .required('가격 마진은 필수입니다'),
});

const ProductMappingDialog: React.FC<ProductMappingDialogProps> = ({
  open,
  onClose,
  onSave,
  initialData,
}) => {
  const dispatch = useAppDispatch();
  const [naverSearchTerm, setNaverSearchTerm] = useState('');
  const [shopifySearchTerm, setShopifySearchTerm] = useState('');
  const [naverProducts, setNaverProducts] = useState<any[]>([]);
  const [shopifyProducts, setShopifyProducts] = useState<any[]>([]);
  const [searchingNaver, setSearchingNaver] = useState(false);
  const [searchingShopify, setSearchingShopify] = useState(false);

  const formik = useFormik({
    initialValues: {
      sku: initialData?.sku || '',
      naverProductId: initialData?.naverProductId || '',
      shopifyProductId: initialData?.shopifyProductId || '',
      shopifyVariantId: initialData?.shopifyVariantId || '',
      priceMargin: initialData?.priceMargin || 1.15,
      isActive: initialData?.isActive !== false,
    },
    validationSchema,
    onSubmit: (values) => {
      onSave(values);
    },
  });

  useEffect(() => {
    if (initialData) {
      formik.setValues({
        sku: initialData.sku,
        naverProductId: initialData.naverProductId,
        shopifyProductId: initialData.shopifyProductId,
        shopifyVariantId: initialData.shopifyVariantId,
        priceMargin: initialData.priceMargin,
        isActive: initialData.isActive,
      });
    }
  }, [initialData]);

  const handleNaverSearch = async (searchTerm: string) => {
    if (!searchTerm) return;
    setSearchingNaver(true);
    try {
      const response = await dispatch(searchNaverProducts(searchTerm)).unwrap();
      setNaverProducts(response);
    } catch (error) {
      console.error('Failed to search Naver products:', error);
    } finally {
      setSearchingNaver(false);
    }
  };

  const handleShopifySearch = async (searchTerm: string) => {
    if (!searchTerm) return;
    setSearchingShopify(true);
    try {
      const response = await dispatch(searchShopifyProducts(searchTerm)).unwrap();
      setShopifyProducts(response);
    } catch (error) {
      console.error('Failed to search Shopify products:', error);
    } finally {
      setSearchingShopify(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <form onSubmit={formik.handleSubmit}>
        <DialogTitle>
          {initialData ? '상품 매핑 수정' : '새 상품 매핑'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            {/* SKU */}
            <Grid item xs={12}>
              <TextField
                fullWidth
                id="sku"
                name="sku"
                label="SKU"
                value={formik.values.sku}
                onChange={formik.handleChange}
                error={formik.touched.sku && Boolean(formik.errors.sku)}
                helperText={formik.touched.sku && formik.errors.sku}
                disabled={!!initialData}
              />
            </Grid>

            {/* 네이버 상품 검색 */}
            <Grid item xs={12}>
              <Typography variant="subtitle2" gutterBottom>
                네이버 상품
              </Typography>
              <Autocomplete
                options={naverProducts}
                getOptionLabel={(option) => `${option.name} (${option.productId})`}
                loading={searchingNaver}
                onInputChange={(event, value) => {
                  setNaverSearchTerm(value);
                  if (value) handleNaverSearch(value);
                }}
                onChange={(event, value) => {
                  if (value) {
                    formik.setFieldValue('naverProductId', value.productId);
                  }
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="네이버 상품 검색"
                    error={formik.touched.naverProductId && Boolean(formik.errors.naverProductId)}
                    helperText={formik.touched.naverProductId && formik.errors.naverProductId}
                  />
                )}
              />
              {formik.values.naverProductId && (
                <Typography variant="caption" color="textSecondary">
                  선택된 ID: {formik.values.naverProductId}
                </Typography>
              )}
            </Grid>

            {/* Shopify 상품 검색 */}
            <Grid item xs={12}>
              <Typography variant="subtitle2" gutterBottom>
                Shopify 상품
              </Typography>
              <Autocomplete
                options={shopifyProducts}
                getOptionLabel={(option) => `${option.title} - ${option.variant.sku}`}
                loading={searchingShopify}
                onInputChange={(event, value) => {
                  setShopifySearchTerm(value);
                  if (value) handleShopifySearch(value);
                }}
                onChange={(event, value) => {
                  if (value) {
                    formik.setFieldValue('shopifyProductId', value.id);
                    formik.setFieldValue('shopifyVariantId', value.variant.id);
                  }
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Shopify 상품 검색"
                    error={formik.touched.shopifyVariantId && Boolean(formik.errors.shopifyVariantId)}
                    helperText={formik.touched.shopifyVariantId && formik.errors.shopifyVariantId}
                  />
                )}
              />
              {formik.values.shopifyVariantId && (
                <Typography variant="caption" color="textSecondary">
                  Product ID: {formik.values.shopifyProductId}, Variant ID: {formik.values.shopifyVariantId}
                </Typography>
              )}
            </Grid>

            <Grid item xs={12}>
              <Divider />
            </Grid>

            {/* 가격 마진 */}
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                id="priceMargin"
                name="priceMargin"
                label="가격 마진"
                type="number"
                value={formik.values.priceMargin}
                onChange={formik.handleChange}
                error={formik.touched.priceMargin && Boolean(formik.errors.priceMargin)}
                helperText={formik.touched.priceMargin && formik.errors.priceMargin}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      ({((formik.values.priceMargin - 1) * 100).toFixed(0)}%)
                    </InputAdornment>
                  ),
                }}
                inputProps={{
                  step: 0.01,
                  min: 1,
                  max: 2,
                }}
              />
            </Grid>

            {/* 활성화 상태 */}
            <Grid item xs={12} sm={6}>
              <FormControlLabel
                control={
                  <Switch
                    checked={formik.values.isActive}
                    onChange={(e) => formik.setFieldValue('isActive', e.target.checked)}
                    name="isActive"
                  />
                }
                label="매핑 활성화"
              />
            </Grid>

            {/* 가격 계산 예시 */}
            <Grid item xs={12}>
              <Alert severity="info">
                <Typography variant="body2">
                  가격 계산 예시: 네이버 가격 ₩10,000 × 환율 0.00075 × 마진 {formik.values.priceMargin} = 
                  ${(10000 * 0.00075 * formik.values.priceMargin).toFixed(2)}
                </Typography>
              </Alert>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>취소</Button>
          <Button type="submit" variant="contained">
            {initialData ? '수정' : '저장'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default ProductMappingDialog;