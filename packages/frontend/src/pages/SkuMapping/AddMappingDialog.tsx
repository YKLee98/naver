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
  Typography,
  Box,
  Alert,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemAvatar,
  ListItemText,
  Avatar,
  Chip,
  CircularProgress,
  Switch,
  FormControlLabel,
  Paper,
  InputAdornment,
  Fade,
  Zoom,
  Card,
  CardContent,
  CardMedia,
  Stack,
  Divider,
  LinearProgress,
  Badge,
  Skeleton,
} from '@mui/material';
import {
  Search as SearchIcon,
  CheckCircle as CheckCircleIcon,
  Image as ImageIcon,
  Close as CloseIcon,
  LocalOffer as TagIcon,
  Inventory as InventoryIcon,
  AttachMoney as MoneyIcon,
  Store as StoreIcon,
  ShoppingCart as ShoppingCartIcon,
  Percent as PercentIcon,
  Business as BusinessIcon,
} from '@mui/icons-material';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import { mappingService } from '@/services/api/mapping.service';
import { useNotification } from '@/hooks/useNotification';

interface AddMappingDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: any) => Promise<void>;
  initialData?: any;
}

const validationSchema = Yup.object({
  sku: Yup.string().required('SKU는 필수입니다'),
  naverProductId: Yup.string().required('네이버 상품을 선택해주세요'),
  shopifyProductId: Yup.string().required('Shopify 상품을 선택해주세요'),
  shopifyVariantId: Yup.string().required('Shopify Variant를 선택해주세요'),
  priceMargin: Yup.number().min(0).max(100),
  isActive: Yup.boolean(),
});

const formatCurrency = (amount: number, currency: string) => {
  if (currency === 'KRW') {
    return `₩${amount.toLocaleString()}`;
  }
  return `$${amount.toLocaleString()}`;
};

const AddMappingDialog: React.FC<AddMappingDialogProps> = ({
  open,
  onClose,
  onSave,
  initialData,
}) => {
  const { showNotification } = useNotification();
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any>(null);
  const [selectedNaverProduct, setSelectedNaverProduct] = useState<any>(null);
  const [selectedShopifyProduct, setSelectedShopifyProduct] = useState<any>(null);

  const formik = useFormik({
    initialValues: {
      sku: initialData?.sku || '',
      naverProductId: initialData?.naverProductId || '',
      shopifyProductId: initialData?.shopifyProductId || '',
      shopifyVariantId: initialData?.shopifyVariantId || '',
      productName: initialData?.productName || '',
      vendor: initialData?.vendor || 'album',
      priceMargin: initialData?.priceMargin ? initialData.priceMargin * 100 : 15,
      isActive: initialData?.isActive !== undefined ? initialData.isActive : true,
    },
    validationSchema,
    onSubmit: async (values) => {
      try {
        // 매핑 생성 데이터 준비
        const mappingData = {
          sku: values.sku,
          naverProductId: values.naverProductId,
          shopifyProductId: values.shopifyProductId,
          shopifyVariantId: values.shopifyVariantId,
          productName: values.productName || selectedNaverProduct?.name || values.sku,
          vendor: values.vendor || 'album',
          priceMargin: values.priceMargin / 100,
          isActive: values.isActive,
          autoSearch: false
        };

        console.log('Saving mapping data:', mappingData);
        
        // 직접 API 호출
        if (initialData) {
          // 수정
          await mappingService.updateMapping(initialData._id, mappingData);
        } else {
          // 생성
          await mappingService.createMapping(mappingData);
        }
        
        showNotification('매핑이 성공적으로 저장되었습니다.', 'success');
        
        // onSave 콜백 호출 (리스트 새로고침용)
        if (onSave) {
          await onSave(mappingData);
        }
        
        handleClose();
      } catch (error: any) {
        console.error('Mapping save error:', error);
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

      // 정확히 하나만 찾은 경우 자동 선택
      if (data.naver.found && data.naver.products.length === 1) {
        handleSelectNaverProduct(data.naver.products[0]);
      }

      if (data.shopify.found && data.shopify.products.length === 1) {
        handleSelectShopifyProduct(data.shopify.products[0]);
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
    console.log('Selected Naver product:', product);
    setSelectedNaverProduct(product);
    formik.setFieldValue('naverProductId', product.id);
    formik.setFieldValue('productName', product.name);
  };

  // 선택한 Shopify 상품 적용
  const handleSelectShopifyProduct = (product: any) => {
    console.log('Selected Shopify product:', product);
    setSelectedShopifyProduct(product);
    formik.setFieldValue('shopifyProductId', product.id);
    formik.setFieldValue('shopifyVariantId', product.variantId);
    formik.setFieldValue('vendor', product.vendor || 'album');
  };

  const handleClose = () => {
    formik.resetForm();
    setSearchResults(null);
    setSelectedNaverProduct(null);
    setSelectedShopifyProduct(null);
    onClose();
  };

  // 유효성 검사 헬퍼
  const isFormValid = () => {
    return !!(
      formik.values.sku &&
      formik.values.naverProductId &&
      formik.values.shopifyProductId &&
      formik.values.shopifyVariantId
    );
  };

  // 상품 카드 컴포넌트
  const ProductCard = ({ product, platform, isSelected, onSelect }: any) => (
    <Card
      sx={{
        mb: 1.5,
        cursor: 'pointer',
        transition: 'all 0.3s ease',
        border: isSelected ? '2px solid' : '1px solid',
        borderColor: isSelected 
          ? (platform === 'naver' ? 'primary.main' : 'success.main')
          : 'divider',
        boxShadow: isSelected ? 3 : 1,
        '&:hover': {
          boxShadow: 4,
          transform: 'translateY(-2px)',
        },
        position: 'relative',
        background: isSelected 
          ? (platform === 'naver' ? 'rgba(25, 118, 210, 0.04)' : 'rgba(46, 125, 50, 0.04)')
          : 'background.paper',
      }}
      onClick={() => onSelect(product)}
    >
      {isSelected && (
        <Zoom in={isSelected}>
          <Badge
            sx={{
              position: 'absolute',
              top: 8,
              right: 8,
              zIndex: 1,
            }}
          >
            <CheckCircleIcon 
              sx={{ 
                color: platform === 'naver' ? 'primary.main' : 'success.main',
                fontSize: 32,
              }} 
            />
          </Badge>
        </Zoom>
      )}
      
      <CardContent sx={{ p: 2.5 }}>
        <Grid container spacing={2} alignItems="flex-start">
          <Grid item xs="auto">
            {product.imageUrl ? (
              <Avatar
                src={product.imageUrl}
                variant="rounded"
                sx={{ width: 80, height: 80 }}
              />
            ) : (
              <Avatar
                variant="rounded"
                sx={{ 
                  width: 80, 
                  height: 80,
                  bgcolor: platform === 'naver' ? 'primary.light' : 'success.light',
                }}
              >
                <ImageIcon sx={{ fontSize: 40 }} />
              </Avatar>
            )}
          </Grid>
          
          <Grid item xs>
            {/* 상품명을 크게 표시 */}
            <Typography 
              variant="h6" 
              fontWeight="bold" 
              sx={{ 
                mb: 1,
                fontSize: '1.25rem',
                lineHeight: 1.3,
                color: isSelected 
                  ? (platform === 'naver' ? 'primary.main' : 'success.main')
                  : 'text.primary',
              }}
            >
              {product.name || product.title}
            </Typography>
            
            {/* ID 정보 */}
            <Typography 
              variant="caption" 
              color="text.secondary"
              sx={{ display: 'block', mb: 1, fontFamily: 'monospace' }}
            >
              ID: {product.id || product.variantId}
            </Typography>
            
            {/* 태그들 */}
            <Stack direction="row" spacing={1} sx={{ mb: 1, flexWrap: 'wrap', gap: 0.5 }}>
              <Chip
                icon={<TagIcon />}
                label={product.sku || 'SKU 없음'}
                size="small"
                variant="outlined"
                sx={{ fontWeight: 'medium' }}
              />
              <Chip
                icon={<MoneyIcon />}
                label={formatCurrency(
                  platform === 'naver' ? product.price : parseFloat(product.price || '0'),
                  platform === 'naver' ? 'KRW' : 'USD'
                )}
                size="small"
                color={platform === 'naver' ? 'primary' : 'success'}
                sx={{ fontWeight: 'bold' }}
              />
              <Chip
                icon={<InventoryIcon />}
                label={`재고: ${product.stockQuantity || product.inventoryQuantity || 0}`}
                size="small"
                variant="outlined"
              />
            </Stack>
            
            {/* 유사도 표시 개선 */}
            {product.similarity && (
              <Box sx={{ mt: 1.5 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="caption" color="text.secondary">
                    SKU 일치도
                  </Typography>
                  <Typography 
                    variant="caption" 
                    fontWeight="bold"
                    color={product.similarity >= 80 ? 'success.main' : 'warning.main'}
                  >
                    {product.similarity}%
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={product.similarity}
                  sx={{ 
                    height: 8, 
                    borderRadius: 4,
                    bgcolor: 'grey.200',
                    '& .MuiLinearProgress-bar': {
                      borderRadius: 4,
                      bgcolor: product.similarity >= 80 ? 'success.main' : 'warning.main',
                    }
                  }}
                />
              </Box>
            )}
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  );

  return (
    <Dialog 
      open={open} 
      onClose={handleClose} 
      maxWidth="lg" 
      fullWidth
      PaperProps={{
        sx: { borderRadius: 2 }
      }}
    >
      <DialogTitle sx={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        borderBottom: 1,
        borderColor: 'divider',
        pb: 2,
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          {initialData ? '🔄 매핑 수정' : '➕ 새 매핑 추가'}
        </Box>
        <IconButton onClick={handleClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      
      <DialogContent sx={{ mt: 3 }}>
        {/* SKU 검색 섹션 */}
        <Paper 
          elevation={0} 
          sx={{ 
            p: 3, 
            mb: 3, 
            bgcolor: 'grey.50',
            borderRadius: 2,
          }}
        >
          <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <SearchIcon /> SKU 검색
          </Typography>
          
          <TextField
            fullWidth
            name="sku"
            label="SKU 입력"
            value={formik.values.sku}
            onChange={formik.handleChange}
            error={formik.touched.sku && Boolean(formik.errors.sku)}
            helperText={formik.touched.sku && formik.errors.sku}
            disabled={!!initialData}
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSkuSearch();
              }
            }}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <Button
                    variant="contained"
                    onClick={handleSkuSearch}
                    disabled={searching || !formik.values.sku}
                    sx={{ borderRadius: 1 }}
                  >
                    {searching ? <CircularProgress size={20} /> : '검색'}
                  </Button>
                </InputAdornment>
              ),
            }}
            sx={{ 
              '& .MuiOutlinedInput-root': {
                bgcolor: 'white',
              }
            }}
          />
        </Paper>

        {searching && (
          <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
            <CircularProgress />
          </Box>
        )}

        {/* 검색 결과 */}
        {searchResults && !searching && (
          <Fade in={true}>
            <Grid container spacing={3}>
              {/* 네이버 상품 */}
              <Grid item xs={12} md={6}>
                <Paper 
                  elevation={0} 
                  sx={{ 
                    p: 2, 
                    borderRadius: 2,
                    border: 1,
                    borderColor: 'divider',
                    bgcolor: 'background.paper',
                  }}
                >
                  <Box sx={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    mb: 2,
                  }}>
                    <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <StoreIcon color="primary" />
                      네이버 상품
                    </Typography>
                    <Chip
                      label={searchResults.naver.found 
                        ? `${searchResults.naver.products.length}개 발견` 
                        : '미발견'}
                      color={searchResults.naver.found ? 'primary' : 'default'}
                      size="small"
                    />
                  </Box>

                  {searchResults.naver.found ? (
                    <Box sx={{ maxHeight: 400, overflow: 'auto', pr: 1 }}>
                      {searchResults.naver.products.map((product: any, index: number) => (
                        <ProductCard
                          key={`naver-${product.id}-${index}`}
                          product={product}
                          platform="naver"
                          isSelected={selectedNaverProduct?.id === product.id}
                          onSelect={handleSelectNaverProduct}
                        />
                      ))}
                    </Box>
                  ) : (
                    <Alert severity="info" icon={false} sx={{ borderRadius: 1 }}>
                      {searchResults.naver.message || '네이버에서 상품을 찾을 수 없습니다.'}
                    </Alert>
                  )}
                </Paper>
              </Grid>

              {/* Shopify 상품 */}
              <Grid item xs={12} md={6}>
                <Paper 
                  elevation={0} 
                  sx={{ 
                    p: 2, 
                    borderRadius: 2,
                    border: 1,
                    borderColor: 'divider',
                    bgcolor: 'background.paper',
                  }}
                >
                  <Box sx={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    mb: 2,
                  }}>
                    <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <ShoppingCartIcon color="success" />
                      Shopify 상품
                    </Typography>
                    <Chip
                      label={searchResults.shopify.found 
                        ? `${searchResults.shopify.products.length}개 발견` 
                        : '미발견'}
                      color={searchResults.shopify.found ? 'success' : 'default'}
                      size="small"
                    />
                  </Box>

                  {searchResults.shopify.found ? (
                    <Box sx={{ maxHeight: 400, overflow: 'auto', pr: 1 }}>
                      {searchResults.shopify.products.map((product: any, index: number) => (
                        <ProductCard
                          key={`shopify-${product.variantId}-${index}`}
                          product={product}
                          platform="shopify"
                          isSelected={selectedShopifyProduct?.variantId === product.variantId}
                          onSelect={handleSelectShopifyProduct}
                        />
                      ))}
                    </Box>
                  ) : (
                    <Alert severity="info" icon={false} sx={{ borderRadius: 1 }}>
                      {searchResults.shopify.message || 'Shopify에서 상품을 찾을 수 없습니다.'}
                    </Alert>
                  )}
                </Paper>
              </Grid>
            </Grid>
          </Fade>
        )}

        {/* 선택된 상품 정보 - 더 크고 명확하게 표시 */}
        {(selectedNaverProduct || selectedShopifyProduct) && (
          <Fade in={true}>
            <Paper 
              elevation={0} 
              sx={{ 
                p: 3, 
                mt: 3,
                bgcolor: 'success.50',
                borderRadius: 2,
                border: 2,
                borderColor: 'success.main',
              }}
            >
              <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
                <CheckCircleIcon color="success" />
                선택된 상품
              </Typography>
              
              <Grid container spacing={3}>
                {selectedNaverProduct && (
                  <Grid item xs={12} md={6}>
                    <Paper elevation={1} sx={{ p: 2, bgcolor: 'background.paper', borderRadius: 2 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                        <StoreIcon color="primary" />
                        <Typography variant="subtitle1" fontWeight="bold" color="primary">
                          네이버 상품
                        </Typography>
                      </Box>
                      <Typography 
                        variant="h5" 
                        fontWeight="bold" 
                        sx={{ mb: 1, color: 'text.primary' }}
                      >
                        {selectedNaverProduct.name}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                        ID: {selectedNaverProduct.id}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        SKU: {selectedNaverProduct.sku}
                      </Typography>
                      <Typography variant="h6" color="primary" sx={{ mt: 1 }}>
                        {formatCurrency(selectedNaverProduct.price, 'KRW')}
                      </Typography>
                    </Paper>
                  </Grid>
                )}
                
                {selectedShopifyProduct && (
                  <Grid item xs={12} md={6}>
                    <Paper elevation={1} sx={{ p: 2, bgcolor: 'background.paper', borderRadius: 2 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                        <ShoppingCartIcon color="success" />
                        <Typography variant="subtitle1" fontWeight="bold" color="success.main">
                          Shopify 상품
                        </Typography>
                      </Box>
                      <Typography 
                        variant="h5" 
                        fontWeight="bold" 
                        sx={{ mb: 1, color: 'text.primary' }}
                      >
                        {selectedShopifyProduct.title}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                        ID: {selectedShopifyProduct.variantId}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        SKU: {selectedShopifyProduct.sku}
                      </Typography>
                      <Typography variant="h6" color="success.main" sx={{ mt: 1 }}>
                        {formatCurrency(parseFloat(selectedShopifyProduct.price || '0'), 'USD')}
                      </Typography>
                    </Paper>
                  </Grid>
                )}
              </Grid>
              {/* 매핑 설정 섹션 */}
              <Box sx={{ mt: 3, pt: 3, borderTop: 1, borderColor: 'divider' }}>
                <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                  매핑 설정
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} md={4}>
                    <TextField
                      fullWidth
                      name="priceMargin"
                      label="가격 마진"
                      type="number"
                      value={formik.values.priceMargin}
                      onChange={formik.handleChange}
                      error={formik.touched.priceMargin && Boolean(formik.errors.priceMargin)}
                      helperText={formik.touched.priceMargin && formik.errors.priceMargin}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <PercentIcon />
                          </InputAdornment>
                        ),
                      }}
                      sx={{ bgcolor: 'white' }}
                    />
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <TextField
                      fullWidth
                      name="vendor"
                      label="벤더"
                      value={formik.values.vendor}
                      onChange={formik.handleChange}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <BusinessIcon />
                          </InputAdornment>
                        ),
                      }}
                      sx={{ bgcolor: 'white' }}
                    />
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <FormControlLabel
                      control={
                        <Switch
                          name="isActive"
                          checked={formik.values.isActive}
                          onChange={formik.handleChange}
                          color="success"
                        />
                      }
                      label={
                        <Typography variant="body1" fontWeight="medium">
                          활성화
                        </Typography>
                      }
                      sx={{ mt: 1 }}
                    />
                  </Grid>
                </Grid>
              </Box>
            </Paper>
          </Fade>
        )}
      </DialogContent>
      
      <Divider />
      
      <DialogActions sx={{ p: 2.5 }}>
        <Button 
          onClick={handleClose}
          variant="outlined"
          size="large"
          sx={{ borderRadius: 1 }}
        >
          취소
        </Button>
        <Button
          onClick={() => {
            console.log('Form values before submit:', formik.values);
            console.log('Form errors:', formik.errors);
            console.log('Is form valid:', isFormValid());
            formik.handleSubmit();
          }}
          variant="contained"
          size="large"
          disabled={searching || !isFormValid()}
          sx={{ borderRadius: 1, minWidth: 120 }}
        >
          {initialData ? '수정하기' : '저장하기'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AddMappingDialog;