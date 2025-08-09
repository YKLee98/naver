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
  recommendations?: {
    autoMappingPossible: boolean;
    confidence: number;
  };
}

const validationSchema = yup.object({
  sku: yup
    .string()
    .required('SKU는 필수입니다')
    .min(3, 'SKU는 최소 3자 이상이어야 합니다')
    .matches(/^[A-Za-z0-9_-]+$/, 'SKU는 영문, 숫자, -, _ 만 사용 가능합니다'),
  naverProductId: yup
    .string()
    .required('네이버 상품 ID는 필수입니다'),
  shopifyProductId: yup
    .string()
    .required('Shopify 상품 ID는 필수입니다'),
  priceMargin: yup
    .number()
    .min(0, '마진율은 0 이상이어야 합니다')
    .max(100, '마진율은 100 이하여야 합니다'),
  isActive: yup.boolean(),
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
  const [expandedSections, setExpandedSections] = useState({
    naver: true,
    shopify: true,
  });

  const handleClose = () => {
    formik.resetForm();
    setSearchResults(null);
    setSelectedNaverProduct(null);
    setSelectedShopifyProduct(null);
    onClose();
  };

  const formik = useFormik({
    initialValues: {
      sku: initialData?.sku || '',
      naverProductId: initialData?.naverProductId || '',
      shopifyProductId: initialData?.shopifyProductId || '',
      shopifyVariantId: initialData?.shopifyVariantId || '',
      priceMargin: initialData?.priceMargin || 15,
      isActive: initialData?.isActive !== undefined ? initialData.isActive : true,
    },
    validationSchema,
    onSubmit: async (values) => {
      try {
        await onSave(values);
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

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        {initialData ? 'SKU 매핑 수정' : '새 SKU 매핑 추가'}
      </DialogTitle>
      <form onSubmit={formik.handleSubmit}>
        <DialogContent>
          <Grid container spacing={3}>
            {/* SKU 입력 및 검색 */}
            <Grid item xs={12}>
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
                            {searchResults.naver.products.map((product, index) => (
                              <ListItem key={`naver-${product.id}-${index}`} divider>
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
                                    <Box component="span">
                                      <Typography variant="caption" display="block">
                                        ID: {product.id}
                                      </Typography>
                                      <Typography variant="caption" display="block">
                                        SKU: {product.sku || '-'}
                                      </Typography>
                                      <Typography variant="caption" display="block">
                                        가격: {formatCurrency(product.price, 'KRW')}
                                      </Typography>
                                      <Typography variant="caption" display="block">
                                        재고: {product.stockQuantity}개
                                      </Typography>
                                    </Box>
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
                            {searchResults.shopify.products.map((product, index) => (
                              <ListItem key={`shopify-${product.variantId || product.id}-${index}`} divider>
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
                                    <Box component="span">
                                      <Typography variant="caption" display="block">
                                        Variant: {product.variantTitle || 'Default'}
                                      </Typography>
                                      <Typography variant="caption" display="block">
                                        SKU: {product.sku || '-'}
                                      </Typography>
                                      <Typography variant="caption" display="block">
                                        가격: ${product.price}
                                      </Typography>
                                      <Typography variant="caption" display="block">
                                        재고: {product.inventoryQuantity}개
                                      </Typography>
                                      <Typography variant="caption" display="block">
                                        벤더: {product.vendor}
                                      </Typography>
                                    </Box>
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
                    <Box sx={{ mt: 2 }}>
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
                        sx={{ mb: 2 }}
                      />
                      <TextField
                        fullWidth
                        id="shopifyVariantId"
                        name="shopifyVariantId"
                        label="Shopify Variant ID (선택사항)"
                        value={formik.values.shopifyVariantId}
                        onChange={formik.handleChange}
                        onBlur={formik.handleBlur}
                        placeholder="수동으로 입력"
                      />
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            )}

            {/* 추가 설정 */}
            <Grid item xs={12}>
              <Divider sx={{ my: 2 }}>추가 설정</Divider>
            </Grid>

            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                id="priceMargin"
                name="priceMargin"
                label="가격 마진율 (%)"
                type="number"
                value={formik.values.priceMargin}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                error={formik.touched.priceMargin && Boolean(formik.errors.priceMargin)}
                helperText={formik.touched.priceMargin && formik.errors.priceMargin}
                InputProps={{
                  endAdornment: <InputAdornment position="end">%</InputAdornment>,
                }}
              />
            </Grid>

            <Grid item xs={12} md={6}>
              <FormControlLabel
                control={
                  <Switch
                    id="isActive"
                    name="isActive"
                    checked={formik.values.isActive}
                    onChange={formik.handleChange}
                    color="primary"
                  />
                }
                label="활성화"
              />
            </Grid>

            {/* 자동 매핑 추천 */}
            {searchResults?.recommendations?.autoMappingPossible && (
              <Grid item xs={12}>
                <Alert severity="success" icon={<CheckCircle />}>
                  자동 매핑 가능: SKU가 {searchResults.recommendations.confidence}% 일치합니다.
                </Alert>
              </Grid>
            )}
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>취소</Button>
          <Button type="submit" variant="contained" color="primary">
            {initialData ? '수정' : '추가'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default AddMappingDialog;