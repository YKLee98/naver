// packages/frontend/src/pages/SkuMapping/AddMappingDialog.tsx
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
  CircularProgress,
  Chip,
} from '@mui/material';
import { useFormik } from 'formik';
import * as yup from 'yup';
import { mappingService } from '@/services/api/mapping.service';
import { productService } from '@/services/api/product.service';
import { useNotification } from '@/hooks/useNotification';

interface MappingFormData {
  sku: string;
  naverProductId: string;
  shopifyProductId: string;
  shopifyVariantId?: string;
  priceMargin: number;
  isActive: boolean;
}

interface AddMappingDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: MappingFormData) => void;
  initialData?: any;
}

const validationSchema = yup.object({
  sku: yup
    .string()
    .required('SKU는 필수입니다')
    .matches(/^[A-Z0-9_-]+$/i, 'SKU는 영문, 숫자, 하이픈(-), 언더바(_)만 사용 가능합니다'),
  naverProductId: yup.string().required('네이버 상품 ID는 필수입니다'),
  shopifyProductId: yup.string().required('Shopify 상품 ID는 필수입니다'),
  priceMargin: yup
    .number()
    .required('마진율은 필수입니다')
    .min(0, '마진율은 0 이상이어야 합니다')
    .max(100, '마진율은 100 이하여야 합니다'),
});

const AddMappingDialog: React.FC<AddMappingDialogProps> = ({
  open,
  onClose,
  onSave,
  initialData,
}) => {
  const { showNotification } = useNotification();
  const [searchingNaver, setSearchingNaver] = useState(false);
  const [searchingShopify, setSearchingShopify] = useState(false);
  const [naverProducts, setNaverProducts] = useState<any[]>([]);
  const [shopifyProducts, setShopifyProducts] = useState<any[]>([]);
  const [validationResult, setValidationResult] = useState<any>(null);

  const formik = useFormik({
    initialValues: {
      sku: initialData?.sku || '',
      naverProductId: initialData?.naverProductId || '',
      shopifyProductId: initialData?.shopifyProductId || '',
      shopifyVariantId: initialData?.shopifyVariantId || '',
      priceMargin: initialData?.priceMargin || 15,
      isActive: initialData?.isActive !== false,
    },
    validationSchema,
    onSubmit: (values) => {
      onSave(values);
    },
  });

  // 네이버 상품 검색
  const searchNaverProducts = async (searchTerm: string) => {
    if (!searchTerm || searchTerm.length < 2) return;

    setSearchingNaver(true);
    try {
      const response = await productService.searchNaverProducts({ query: searchTerm });
      setNaverProducts(response.data.products || []);
    } catch (error) {
      showNotification('네이버 상품 검색에 실패했습니다.', 'error');
    } finally {
      setSearchingNaver(false);
    }
  };

  // Shopify 상품 검색
  const searchShopifyProducts = async (searchTerm: string) => {
    if (!searchTerm || searchTerm.length < 2) return;

    setSearchingShopify(true);
    try {
      const response = await productService.searchShopifyProducts({ query: searchTerm });
      setShopifyProducts(response.data.products || []);
    } catch (error) {
      showNotification('Shopify 상품 검색에 실패했습니다.', 'error');
    } finally {
      setSearchingShopify(false);
    }
  };

  // 검증 실행
  const handleValidate = async () => {
    const { sku, naverProductId, shopifyProductId } = formik.values;
    
    if (!sku || !naverProductId || !shopifyProductId) {
      showNotification('모든 필수 항목을 입력해주세요.', 'warning');
      return;
    }

    try {
      const response = await mappingService.validateMappingData({
        sku,
        naverProductId,
        shopifyProductId,
      });
      setValidationResult(response.data);
      
      if (response.data.isValid) {
        showNotification('매핑이 유효합니다.', 'success');
      } else {
        showNotification('매핑에 문제가 있습니다.', 'warning');
      }
    } catch (error) {
      showNotification('검증에 실패했습니다.', 'error');
    }
  };

  // 폼 초기화
  useEffect(() => {
    if (!open) {
      formik.resetForm();
      setValidationResult(null);
      setNaverProducts([]);
      setShopifyProducts([]);
    }
  }, [open]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <form onSubmit={formik.handleSubmit}>
        <DialogTitle>
          {initialData ? 'SKU 매핑 수정' : 'SKU 매핑 추가'}
        </DialogTitle>
        
        <DialogContent>
          <Grid container spacing={3} sx={{ mt: 1 }}>
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
                placeholder="예: ALBUM-001"
                disabled={!!initialData}
              />
            </Grid>

            {/* 네이버 상품 */}
            <Grid item xs={12} md={6}>
              <Autocomplete
                freeSolo
                options={naverProducts}
                getOptionLabel={(option) => {
                  if (typeof option === 'string') return option;
                  return `${option.name} (${option.id})`;
                }}
                value={formik.values.naverProductId}
                onInputChange={(event, value) => {
                  formik.setFieldValue('naverProductId', value);
                  searchNaverProducts(value);
                }}
                onChange={(event, value) => {
                  if (value && typeof value !== 'string') {
                    formik.setFieldValue('naverProductId', value.id);
                  }
                }}
                loading={searchingNaver}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="네이버 상품"
                    error={formik.touched.naverProductId && Boolean(formik.errors.naverProductId)}
                    helperText={formik.touched.naverProductId && formik.errors.naverProductId}
                    placeholder="상품명 또는 ID로 검색"
                    InputProps={{
                      ...params.InputProps,
                      endAdornment: (
                        <>
                          {searchingNaver ? <CircularProgress color="inherit" size={20} /> : null}
                          {params.InputProps.endAdornment}
                        </>
                      ),
                    }}
                  />
                )}
              />
            </Grid>

            {/* Shopify 상품 */}
            <Grid item xs={12} md={6}>
              <Autocomplete
                freeSolo
                options={shopifyProducts}
                getOptionLabel={(option) => {
                  if (typeof option === 'string') return option;
                  return `${option.title} (${option.id})`;
                }}
                value={formik.values.shopifyProductId}
                onInputChange={(event, value) => {
                  formik.setFieldValue('shopifyProductId', value);
                  searchShopifyProducts(value);
                }}
                onChange={(event, value) => {
                  if (value && typeof value !== 'string') {
                    formik.setFieldValue('shopifyProductId', value.id);
                    // 첫 번째 variant ID 자동 설정
                    if (value.variants && value.variants.length > 0) {
                      formik.setFieldValue('shopifyVariantId', value.variants[0].id);
                    }
                  }
                }}
                loading={searchingShopify}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Shopify 상품"
                    error={formik.touched.shopifyProductId && Boolean(formik.errors.shopifyProductId)}
                    helperText={formik.touched.shopifyProductId && formik.errors.shopifyProductId}
                    placeholder="상품명 또는 ID로 검색"
                    InputProps={{
                      ...params.InputProps,
                      endAdornment: (
                        <>
                          {searchingShopify ? <CircularProgress color="inherit" size={20} /> : null}
                          {params.InputProps.endAdornment}
                        </>
                      ),
                    }}
                  />
                )}
              />
            </Grid>

            {/* 마진율 */}
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                id="priceMargin"
                name="priceMargin"
                label="마진율"
                type="number"
                value={formik.values.priceMargin}
                onChange={formik.handleChange}
                error={formik.touched.priceMargin && Boolean(formik.errors.priceMargin)}
                helperText={formik.touched.priceMargin && formik.errors.priceMargin}
                InputProps={{
                  endAdornment: <InputAdornment position="end">%</InputAdornment>,
                }}
              />
            </Grid>

            {/* 활성화 여부 */}
            <Grid item xs={12} md={6}>
              <FormControlLabel
                control={
                  <Switch
                    checked={formik.values.isActive}
                    onChange={(e) => formik.setFieldValue('isActive', e.target.checked)}
                    name="isActive"
                    color="primary"
                  />
                }
                label="활성화"
                sx={{ mt: 1 }}
              />
            </Grid>

            {/* 검증 결과 */}
            {validationResult && (
              <Grid item xs={12}>
                <Divider sx={{ my: 2 }} />
                <Typography variant="subtitle2" gutterBottom>
                  검증 결과
                </Typography>
                
                {validationResult.isValid ? (
                  <Alert severity="success">
                    모든 검증을 통과했습니다.
                  </Alert>
                ) : (
                  <>
                    {validationResult.errors?.length > 0 && (
                      <Alert severity="error" sx={{ mb: 1 }}>
                        <Typography variant="body2" fontWeight="bold">오류:</Typography>
                        <ul style={{ margin: 0, paddingLeft: 20 }}>
                          {validationResult.errors.map((error: string, index: number) => (
                            <li key={index}>{error}</li>
                          ))}
                        </ul>
                      </Alert>
                    )}
                    
                    {validationResult.warnings?.length > 0 && (
                      <Alert severity="warning">
                        <Typography variant="body2" fontWeight="bold">경고:</Typography>
                        <ul style={{ margin: 0, paddingLeft: 20 }}>
                          {validationResult.warnings.map((warning: string, index: number) => (
                            <li key={index}>{warning}</li>
                          ))}
                        </ul>
                      </Alert>
                    )}
                  </>
                )}
              </Grid>
            )}
          </Grid>
        </DialogContent>
        
        <DialogActions>
          <Button onClick={handleValidate} disabled={!formik.values.sku || !formik.values.naverProductId || !formik.values.shopifyProductId}>
            검증하기
          </Button>
          <Box sx={{ flex: 1 }} />
          <Button onClick={onClose}>취소</Button>
          <Button type="submit" variant="contained" disabled={formik.isSubmitting}>
            {initialData ? '수정' : '추가'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default AddMappingDialog;