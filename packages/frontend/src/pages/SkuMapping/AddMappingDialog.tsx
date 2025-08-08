// ===== 2. packages/frontend/src/pages/SkuMapping/AddMappingDialog.tsx (자동 SKU 검색 기능 강화) =====
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
  Card,
  CardContent,
  CardMedia,
  Stack,
  LinearProgress,
  IconButton,
  Collapse,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Avatar,
  ListItemSecondaryAction,
  Radio,
  RadioGroup,
} from '@mui/material';
import {
  Search,
  CheckCircle,
  Error,
  Warning,
  Refresh,
  ExpandMore,
  ExpandLess,
  Image as ImageIcon,
  Store,
  ShoppingCart,
} from '@mui/icons-material';
import { useFormik } from 'formik';
import * as yup from 'yup';
import { mappingService } from '@/services/api/mapping.service';
import { useNotification } from '@/hooks/useNotification';
import { formatCurrency } from '@/utils/formatters';

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
  initialData?: MappingFormData | null;
}

interface ProductSearchResult {
  naver: {
    found: boolean;
    products: any[];
    message?: string;
    error?: string;
  };
  shopify: {
    found: boolean;
    products: any[];
    message?: string;
    error?: string;
  };
}

const validationSchema = yup.object({
  sku: yup
    .string()
    .required('SKU는 필수입니다')
    .matches(/^[A-Za-z0-9_-]{3,50}$/, 'SKU는 영문, 숫자, 하이픈, 언더스코어만 사용 가능합니다 (3-50자)'),
  naverProductId: yup.string().required('네이버 상품 ID는 필수입니다'),
  shopifyProductId: yup.string().required('Shopify 상품 ID는 필수입니다'),
  priceMargin: yup
    .number()
    .min(0, '마진율은 0% 이상이어야 합니다')
    .max(100, '마진율은 100% 이하여야 합니다'),
});

const AddMappingDialog: React.FC<AddMappingDialogProps> = ({
  open,
  onClose,
  onSave,
  initialData,
}) => {
  const { showNotification } = useNotification();
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<ProductSearchResult | null>(null);
  const [selectedNaverProduct, setSelectedNaverProduct] = useState<any>(null);
  const [selectedShopifyProduct, setSelectedShopifyProduct] = useState<any>(null);
  const [autoSearchEnabled, setAutoSearchEnabled] = useState(true);
  const [validationResult, setValidationResult] = useState<any>(null);
  const [expandedSections, setExpandedSections] = useState({
    naver: true,
    shopify: true,
  });

  const formik = useFormik({
    initialValues: {
      sku: initialData?.sku || '',
      naverProductId: initialData?.naverProductId || '',
      shopifyProductId: initialData?.shopifyProductId || '',
      shopifyVariantId: initialData?.shopifyVariantId || '',
      priceMargin: initialData?.priceMargin || 15,
      isActive: initialData?.isActive ?? true,
    },
    validationSchema,
    onSubmit: async (values) => {
      try {
        const payload = {
          ...values,
          autoSearch: autoSearchEnabled,
        };
        
        await onSave(payload);
        showNotification('매핑이 성공적으로 저장되었습니다.', 'success');
        handleClose();
      } catch (error: any) {
        showNotification(
          error.response?.data?.message || '매핑 저장에 실패했습니다.',
          'error'
        );
      }
    },
  });

  // SKU로 자동 상품 검색
  const handleSkuSearch = async () => {
    const sku = formik.values.sku;
    if (!sku || sku.length < 3) {
      showNotification('SKU를 3자 이상 입력해주세요.', 'warning');
      return;
    }

    setSearching(true);
    setSearchResults(null);
    setSelectedNaverProduct(null);
    setSelectedShopifyProduct(null);

    try {
      const response = await mappingService.searchProductsBySku(sku);
      const data = response.data.data;
      
      setSearchResults(data);

      // 검색 결과 분석
      if (data.naver.found) {
        showNotification(
          `네이버에서 ${data.naver.products.length}개 상품을 찾았습니다.`,
          'info'
        );
        
        // 정확히 하나만 찾은 경우 자동 선택
        if (data.naver.products.length === 1) {
          const product = data.naver.products[0];
          setSelectedNaverProduct(product);
          formik.setFieldValue('naverProductId', product.id);
        }
      } else {
        showNotification(
          data.naver.message || '네이버에서 상품을 찾을 수 없습니다.',
          'warning'
        );
      }

      if (data.shopify.found) {
        showNotification(
          `Shopify에서 ${data.shopify.products.length}개 상품을 찾았습니다.`,
          'info'
        );
        
        // 정확히 하나만 찾은 경우 자동 선택
        if (data.shopify.products.length === 1) {
          const product = data.shopify.products[0];
          setSelectedShopifyProduct(product);
          formik.setFieldValue('shopifyProductId', product.id);
          formik.setFieldValue('shopifyVariantId', product.variantId);
        }
      } else {
        showNotification(
          data.shopify.message || 'Shopify에서 상품을 찾을 수 없습니다.',
          'warning'
        );
      }
    } catch (error: any) {
      console.error('SKU 검색 실패:', error);
      showNotification('상품 검색 중 오류가 발생했습니다.', 'error');
    } finally {
      setSearching(false);
    }
  };

  // 선택한 네이버 상품 적용
  const handleSelectNaverProduct = (product: any) => {
    setSelectedNaverProduct(product);
    formik.setFieldValue('naverProductId', product.id);
  };

  // 선택한 Shopify 상품 적용
  const handleSelectShopifyProduct = (product: any) => {
    setSelectedShopifyProduct(product);
    formik.setFieldValue('shopifyProductId', product.id);
    formik.setFieldValue('shopifyVariantId', product.variantId);
  };

  // 매핑 검증
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

  const handleClose = () => {
    formik.resetForm();
    setSearchResults(null);
    setSelectedNaverProduct(null);
    setSelectedShopifyProduct(null);
    setValidationResult(null);
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="lg" fullWidth>
      <form onSubmit={formik.handleSubmit}>
        <DialogTitle>
          {initialData ? 'SKU 매핑 수정' : 'SKU 매핑 추가'}
        </DialogTitle>
        
        <DialogContent dividers>
          <Grid container spacing={3}>
            {/* SKU 입력 및 검색 */}
            <Grid item xs={12}>
              <Alert severity="info" sx={{ mb: 2 }}>
                💡 SKU를 입력하면 네이버와 Shopify에서 자동으로 상품을 검색합니다.
              </Alert>
              
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
                <TextField
                  fullWidth
                  id="sku"
                  name="sku"
                  label="SKU"
                  value={formik.values.sku}
                  onChange={formik.handleChange}
                  onBlur={formik.handleBlur}
                  error={formik.touched.sku && Boolean(formik.errors.sku)}
                  helperText={formik.touched.sku && formik.errors.sku}
                  placeholder="예: ALBUM-001"
                  disabled={!!initialData}
                  InputProps={{
                    endAdornment: searching && (
                      <InputAdornment position="end">
                        <CircularProgress size={20} />
                      </InputAdornment>
                    ),
                  }}
                />
                <Button
                  variant="contained"
                  onClick={handleSkuSearch}
                  disabled={searching || !formik.values.sku}
                  startIcon={<Search />}
                  sx={{ minWidth: 120, height: 56 }}
                >
                  검색
                </Button>
              </Box>
            </Grid>

            {/* 검색 결과 - 네이버 */}
            {searchResults?.naver && (
              <Grid item xs={12} md={6}>
                <Card>
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                      <Store sx={{ mr: 1 }} />
                      <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
                        네이버 상품
                      </Typography>
                      <IconButton
                        size="small"
                        onClick={() => setExpandedSections({
                          ...expandedSections,
                          naver: !expandedSections.naver
                        })}
                      >
                        {expandedSections.naver ? <ExpandLess /> : <ExpandMore />}
                      </IconButton>
                    </Box>

                    <Collapse in={expandedSections.naver}>
                      {searchResults.naver.found ? (
                        <RadioGroup
                          value={selectedNaverProduct?.id || ''}
                          onChange={(e) => {
                            const product = searchResults.naver.products.find(
                              p => p.id === e.target.value
                            );
                            if (product) handleSelectNaverProduct(product);
                          }}
                        >
                          <List dense>
                            {searchResults.naver.products.map((product) => (
                              <ListItem key={product.id} divider>
                                <Radio value={product.id} />
                                <ListItemAvatar>
                                  {product.imageUrl ? (
                                    <Avatar src={product.imageUrl} variant="rounded" />
                                  ) : (
                                    <Avatar variant="rounded">
                                      <ImageIcon />
                                    </Avatar>
                                  )}
                                </ListItemAvatar>
                                <ListItemText
                                  primary={product.name}
                                  secondary={
                                    <Stack spacing={0.5}>
                                      <Typography variant="caption">
                                        ID: {product.id}
                                      </Typography>
                                      <Typography variant="caption">
                                        SKU: {product.sku || '-'}
                                      </Typography>
                                      <Typography variant="caption">
                                        가격: {formatCurrency(product.price, 'KRW')}
                                      </Typography>
                                      <Typography variant="caption">
                                        재고: {product.stockQuantity}개
                                      </Typography>
                                    </Stack>
                                  }
                                />
                                {product.similarity && (
                                  <Chip
                                    label={`${product.similarity}% 일치`}
                                    size="small"
                                    color={product.similarity >= 80 ? 'success' : 'warning'}
                                  />
                                )}
                              </ListItem>
                            ))}
                          </List>
                        </RadioGroup>
                      ) : (
                        <Alert severity="warning">
                          {searchResults.naver.message || '상품을 찾을 수 없습니다.'}
                        </Alert>
                      )}
                    </Collapse>

                    {/* 수동 입력 */}
                    <TextField
                      fullWidth
                      id="naverProductId"
                      name="naverProductId"
                      label="네이버 상품 ID"
                      value={formik.values.naverProductId}
                      onChange={formik.handleChange}
                      onBlur={formik.handleBlur}
                      error={formik.touched.naverProductId && Boolean(formik.errors.naverProductId)}
                      helperText={formik.touched.naverProductId && formik.errors.naverProductId}
                      placeholder="수동으로 입력"
                      sx={{ mt: 2 }}
                    />
                  </CardContent>
                </Card>
              </Grid>
            )}

            {/* 검색 결과 - Shopify */}
            {searchResults?.shopify && (
              <Grid item xs={12} md={6}>
                <Card>
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                      <ShoppingCart sx={{ mr: 1 }} />
                      <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
                        Shopify 상품
                      </Typography>
                      <IconButton
                        size="small"
                        onClick={() => setExpandedSections({
                          ...expandedSections,
                          shopify: !expandedSections.shopify
                        })}
                      >
                        {expandedSections.shopify ? <ExpandLess /> : <ExpandMore />}
                      </IconButton>
                    </Box>

                    <Collapse in={expandedSections.shopify}>
                      {searchResults.shopify.found ? (
                        <RadioGroup
                          value={selectedShopifyProduct?.variantId || ''}
                          onChange={(e) => {
                            const product = searchResults.shopify.products.find(
                              p => p.variantId === e.target.value
                            );
                            if (product) handleSelectShopifyProduct(product);
                          }}
                        >
                          <List dense>
                            {searchResults.shopify.products.map((product) => (
                              <ListItem key={product.variantId} divider>
                                <Radio value={product.variantId} />
                                <ListItemAvatar>
                                  {product.imageUrl ? (
                                    <Avatar src={product.imageUrl} variant="rounded" />
                                  ) : (
                                    <Avatar variant="rounded">
                                      <ImageIcon />
                                    </Avatar>
                                  )}
                                </ListItemAvatar>
                                <ListItemText
                                  primary={product.title}
                                  secondary={
                                    <Stack spacing={0.5}>
                                      <Typography variant="caption">
                                        Variant: {product.variantTitle || 'Default'}
                                      </Typography>
                                      <Typography variant="caption">
                                        SKU: {product.sku || '-'}
                                      </Typography>
                                      <Typography variant="caption">
                                        가격: ${product.price}
                                      </Typography>
                                      <Typography variant="caption">
                                        재고: {product.inventoryQuantity}개
                                      </Typography>
                                      <Typography variant="caption">
                                        벤더: {product.vendor}
                                      </Typography>
                                    </Stack>
                                  }
                                />
                                {product.similarity && (
                                  <Chip
                                    label={`${product.similarity}% 일치`}
                                    size="small"
                                    color={product.similarity >= 80 ? 'success' : 'warning'}
                                  />
                                )}
                              </ListItem>
                            ))}
                          </List>
                        </RadioGroup>
                      ) : (
                        <Alert severity="warning">
                          {searchResults.shopify.message || '상품을 찾을 수 없습니다.'}
                        </Alert>
                      )}
                    </Collapse>

                    {/* 수동 입력 */}
                    <Stack spacing={2} sx={{ mt: 2 }}>
                      <TextField
                        fullWidth
                        id="shopifyProductId"
                        name="shopifyProductId"
                        label="Shopify 상품 ID"
                        value={formik.values.shopifyProductId}
                        onChange={formik.handleChange}
                        onBlur={formik.handleBlur}
                        error={formik.touched.shopifyProductId && Boolean(formik.errors.shopifyProductId)}
                        helperText={formik.touched.shopifyProductId && formik.errors.shopifyProductId}
                        placeholder="수동으로 입력"
                      />
                      <TextField
                        fullWidth
                        id="shopifyVariantId"
                        name="shopifyVariantId"
                        label="Shopify Variant ID (선택)"
                        value={formik.values.shopifyVariantId}
                        onChange={formik.handleChange}
                        placeholder="수동으로 입력"
                      />
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
            )}

            {/* 설정 */}
            <Grid item xs={12}>
              <Divider sx={{ my: 2 }} />
              <Grid container spacing={2}>
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    id="priceMargin"
                    name="priceMargin"
                    label="마진율 (%)"
                    type="number"
                    value={formik.values.priceMargin}
                    onChange={formik.handleChange}
                    InputProps={{
                      endAdornment: <InputAdornment position="end">%</InputAdornment>,
                    }}
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={formik.values.isActive}
                        onChange={(e) => formik.setFieldValue('isActive', e.target.checked)}
                      />
                    }
                    label="활성화"
                  />
                </Grid>
                <Grid item xs={12} md={4}>
                  <Button
                    fullWidth
                    variant="outlined"
                    onClick={handleValidate}
                    startIcon={<CheckCircle />}
                  >
                    매핑 검증
                  </Button>
                </Grid>
              </Grid>
            </Grid>

            {/* 검증 결과 */}
            {validationResult && (
              <Grid item xs={12}>
                <Alert
                  severity={validationResult.isValid ? 'success' : 'error'}
                  sx={{ mt: 2 }}
                >
                  {validationResult.isValid ? (
                    '✅ 매핑이 유효합니다.'
                  ) : (
                    <>
                      ❌ 매핑 검증 실패:
                      <ul>
                        {validationResult.errors.map((error: string, index: number) => (
                          <li key={index}>{error}</li>
                        ))}
                      </ul>
                    </>
                  )}
                  {validationResult.warnings?.length > 0 && (
                    <>
                      ⚠️ 경고:
                      <ul>
                        {validationResult.warnings.map((warning: string, index: number) => (
                          <li key={index}>{warning}</li>
                        ))}
                      </ul>
                    </>
                  )}
                </Alert>
              </Grid>
            )}
          </Grid>
        </DialogContent>
        
        <DialogActions>
          <Button onClick={handleClose}>취소</Button>
          <Button
            type="submit"
            variant="contained"
            disabled={formik.isSubmitting || !formik.isValid}
          >
            {initialData ? '수정' : '저장'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default AddMappingDialog;