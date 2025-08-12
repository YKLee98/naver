// packages/frontend/src/components/mapping/MappingForm/index.tsx
import React, { useState, useEffect } from 'react';
import {
  Box,
  TextField,
  Button,
  Stack,
  FormControlLabel,
  Switch,
  InputAdornment,
  Alert,
  CircularProgress,
  Typography,
  Card,
  CardContent,
  Grid,
  IconButton,
  Tooltip,
  Chip,
  Divider,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListItemAvatar,
  Avatar,
  Paper,
} from '@mui/material';
import Icon from '@/components/common/Icon';
import { useForm, Controller } from 'react-hook-form';
import { mappingService, type SkuSearchResult } from '@/services/api/mapping.service';
import { ProductMapping } from '@/types';

interface MappingFormProps {
  mapping?: ProductMapping | null;
  onSuccess?: () => void;
  onCancel?: () => void;
}

interface MappingFormData {
  sku: string;
  naverProductId: string;
  shopifyProductId: string;
  shopifyVariantId: string;
  productName: string;
  vendor: string;
  priceMargin: number;
  isActive: boolean;
}

const MappingForm: React.FC<MappingFormProps> = ({ mapping, onSuccess, onCancel }) => {
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SkuSearchResult | null>(null);
  const [selectedNaverProduct, setSelectedNaverProduct] = useState<any>(null);
  const [selectedShopifyProduct, setSelectedShopifyProduct] = useState<any>(null);
  const [autoSearchEnabled, setAutoSearchEnabled] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  const { control, handleSubmit, setValue, watch, formState: { errors } } = useForm<MappingFormData>({
    defaultValues: {
      sku: mapping?.sku || '',
      naverProductId: mapping?.naverProductId || '',
      shopifyProductId: mapping?.shopifyProductId || '',
      shopifyVariantId: mapping?.shopifyVariantId || '',
      productName: mapping?.productName || '',
      vendor: mapping?.vendor || 'album',
      priceMargin: (mapping?.priceMargin || 0.15) * 100,
      isActive: mapping?.isActive ?? true,
    },
  });

  const skuValue = watch('sku');

  // SKU로 자동 검색
  const handleSkuSearch = async () => {
    if (!skuValue || skuValue.trim().length < 3) {
      setErrorMessage('SKU를 3자 이상 입력해주세요.');
      return;
    }

    setIsSearching(true);
    setSearchResults(null);
    setSelectedNaverProduct(null);
    setSelectedShopifyProduct(null);
    setErrorMessage('');

    try {
      const response = await mappingService.searchProductsBySku(skuValue);
      const data = response.data.data;
      
      setSearchResults(data);

      // 네이버 상품이 1개만 찾아진 경우 자동 선택
      if (data.naver.found && data.naver.products.length === 1) {
        handleSelectNaverProduct(data.naver.products[0]);
      }

      // Shopify 상품이 1개만 찾아진 경우 자동 선택
      if (data.shopify.found && data.shopify.products.length === 1) {
        handleSelectShopifyProduct(data.shopify.products[0]);
      }

    } catch (error: any) {
      console.error('SKU 검색 실패:', error);
      setErrorMessage('상품 검색 중 오류가 발생했습니다.');
    } finally {
      setIsSearching(false);
    }
  };

  // 네이버 상품 선택 처리
  const handleSelectNaverProduct = (product: any) => {
    setSelectedNaverProduct(product);
    setValue('naverProductId', product.id);
    setValue('productName', product.name);
  };

  // Shopify 상품 선택 처리
  const handleSelectShopifyProduct = (product: any) => {
    setSelectedShopifyProduct(product);
    setValue('shopifyProductId', product.id);
    setValue('shopifyVariantId', product.variantId);
    setValue('vendor', product.vendor || 'album');
  };

  // SKU 입력 후 자동 검색
  useEffect(() => {
    const delayTimer = setTimeout(() => {
      if (autoSearchEnabled && skuValue && skuValue.length >= 3 && !mapping) {
        handleSkuSearch();
      }
    }, 1000); // 1초 디바운스

    return () => clearTimeout(delayTimer);
  }, [skuValue, autoSearchEnabled]);

  const onSubmit = async (data: MappingFormData) => {
    try {
      setErrorMessage('');
      
      // 유효성 검사
      if (!data.naverProductId || data.naverProductId === 'PENDING') {
        setErrorMessage('네이버 상품을 선택해주세요.');
        return;
      }
      
      if (!data.shopifyProductId || !data.shopifyVariantId) {
        setErrorMessage('Shopify 상품을 선택해주세요.');
        return;
      }

      const payload = {
        ...data,
        priceMargin: data.priceMargin / 100,
        autoSearch: autoSearchEnabled,
      };

      if (mapping) {
        setIsUpdating(true);
        await mappingService.updateMapping(mapping._id!, payload);
      } else {
        setIsCreating(true);
        await mappingService.createMapping(payload);
      }

      onSuccess?.();
    } catch (error: any) {
      console.error('매핑 저장 실패:', error);
      setErrorMessage(error.response?.data?.message || '매핑 저장 중 오류가 발생했습니다.');
    } finally {
      setIsCreating(false);
      setIsUpdating(false);
    }
  };

  return (
    <Box component="form" onSubmit={handleSubmit(onSubmit)} sx={{ p: 2 }}>
      <Stack spacing={3}>
        {/* 에러 메시지 표시 */}
        {errorMessage && (
          <Alert severity="error" onClose={() => setErrorMessage('')}>
            {errorMessage}
          </Alert>
        )}

        {/* SKU 입력 및 검색 */}
        <Box>
          <Controller
            name="sku"
            control={control}
            rules={{ required: 'SKU는 필수입니다' }}
            render={({ field }) => (
              <TextField
                {...field}
                label="SKU"
                fullWidth
                error={!!errors.sku}
                helperText={errors.sku?.message || 'SKU를 입력하면 자동으로 네이버와 Shopify에서 상품을 검색합니다'}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <Tooltip title="상품 검색">
                        <IconButton 
                          onClick={handleSkuSearch} 
                          disabled={isSearching || !skuValue}
                          edge="end"
                        >
                          {isSearching ? <CircularProgress size={20} /> : <Icon name="Search" />}
                        </IconButton>
                      </Tooltip>
                    </InputAdornment>
                  ),
                }}
                disabled={!!mapping}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSkuSearch();
                  }
                }}
              />
            )}
          />
          
          <FormControlLabel
            control={
              <Switch
                checked={autoSearchEnabled}
                onChange={(e) => setAutoSearchEnabled(e.target.checked)}
              />
            }
            label="SKU 입력 시 자동 검색"
            sx={{ mt: 1 }}
          />
        </Box>

        {/* 검색 결과 표시 */}
        {searchResults && (
          <Grid container spacing={2}>
            {/* 네이버 검색 결과 */}
            <Grid item xs={12} md={6}>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    네이버 상품
                    {searchResults.naver.found && (
                      <Chip 
                        label={`${searchResults.naver.products.length}개 발견`}
                        size="small"
                        color="primary"
                        sx={{ ml: 1 }}
                      />
                    )}
                  </Typography>
                  
                  {searchResults.naver.found && searchResults.naver.products.length > 0 ? (
                    <Paper variant="outlined" sx={{ maxHeight: 300, overflow: 'auto' }}>
                      <List>
                        {searchResults.naver.products.map((product: any, index: number) => (
                          <ListItem key={product.id || index} disablePadding>
                            <ListItemButton
                              selected={selectedNaverProduct?.id === product.id}
                              onClick={() => handleSelectNaverProduct(product)}
                            >
                              {product.imageUrl && (
                                <ListItemAvatar>
                                  <Avatar src={product.imageUrl} variant="square" />
                                </ListItemAvatar>
                              )}
                              <ListItemText
                                primary={product.name}
                                secondary={
                                  <React.Fragment>
                                    <Typography variant="caption" display="block">
                                      ID: {product.id}
                                    </Typography>
                                    <Typography variant="caption" display="block">
                                      가격: {product.price?.toLocaleString()}원 | 재고: {product.stockQuantity}개
                                    </Typography>
                                  </React.Fragment>
                                }
                              />
                              {selectedNaverProduct?.id === product.id && (
                                <Icon name="CheckCircle" color="primary" />
                              )}
                            </ListItemButton>
                          </ListItem>
                        ))}
                      </List>
                    </Paper>
                  ) : (
                    <Alert severity="warning" sx={{ mt: 1 }}>
                      {searchResults.naver.message || '네이버에서 상품을 찾을 수 없습니다'}
                    </Alert>
                  )}
                </CardContent>
              </Card>
            </Grid>

            {/* Shopify 검색 결과 */}
            <Grid item xs={12} md={6}>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Shopify 상품
                    {searchResults.shopify.found && (
                      <Chip 
                        label={`${searchResults.shopify.products.length}개 발견`}
                        size="small"
                        color="success"
                        sx={{ ml: 1 }}
                      />
                    )}
                  </Typography>
                  
                  {searchResults.shopify.found && searchResults.shopify.products.length > 0 ? (
                    <Paper variant="outlined" sx={{ maxHeight: 300, overflow: 'auto' }}>
                      <List>
                        {searchResults.shopify.products.map((product: any, index: number) => (
                          <ListItem key={product.variantId || index} disablePadding>
                            <ListItemButton
                              selected={selectedShopifyProduct?.variantId === product.variantId}
                              onClick={() => handleSelectShopifyProduct(product)}
                            >
                              {product.imageUrl && (
                                <ListItemAvatar>
                                  <Avatar src={product.imageUrl} variant="square" />
                                </ListItemAvatar>
                              )}
                              <ListItemText
                                primary={product.title}
                                secondary={
                                  <React.Fragment>
                                    {product.variantTitle && (
                                      <Typography variant="caption" display="block">
                                        Variant: {product.variantTitle}
                                      </Typography>
                                    )}
                                    <Typography variant="caption" display="block">
                                      SKU: {product.sku} | 가격: ${product.price}
                                    </Typography>
                                  </React.Fragment>
                                }
                              />
                              {selectedShopifyProduct?.variantId === product.variantId && (
                                <Icon name="CheckCircle" color="success" />
                              )}
                            </ListItemButton>
                          </ListItem>
                        ))}
                      </List>
                    </Paper>
                  ) : (
                    <Alert severity="warning" sx={{ mt: 1 }}>
                      {searchResults.shopify.message || 'Shopify에서 상품을 찾을 수 없습니다'}
                    </Alert>
                  )}
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        )}

        {/* 선택된 상품 정보 표시 */}
        {(selectedNaverProduct || selectedShopifyProduct) && (
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>선택된 상품</Typography>
              <Grid container spacing={2}>
                {selectedNaverProduct && (
                  <Grid item xs={12} md={6}>
                    <Alert severity="info">
                      <Typography variant="subtitle2">네이버 상품</Typography>
                      <Typography variant="body2">{selectedNaverProduct.name}</Typography>
                      <Typography variant="caption">ID: {selectedNaverProduct.id}</Typography>
                    </Alert>
                  </Grid>
                )}
                {selectedShopifyProduct && (
                  <Grid item xs={12} md={6}>
                    <Alert severity="success">
                      <Typography variant="subtitle2">Shopify 상품</Typography>
                      <Typography variant="body2">{selectedShopifyProduct.title}</Typography>
                      <Typography variant="caption">ID: {selectedShopifyProduct.variantId}</Typography>
                    </Alert>
                  </Grid>
                )}
              </Grid>
            </CardContent>
          </Card>
        )}

        <Divider />

        {/* 추가 설정 */}
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <Controller
              name="priceMargin"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="가격 마진"
                  fullWidth
                  type="number"
                  InputProps={{
                    endAdornment: <InputAdornment position="end">%</InputAdornment>,
                  }}
                />
              )}
            />
          </Grid>
          
          <Grid item xs={12} md={6}>
            <Controller
              name="vendor"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="벤더"
                  fullWidth
                />
              )}
            />
          </Grid>
        </Grid>

        <Controller
          name="isActive"
          control={control}
          render={({ field }) => (
            <FormControlLabel
              control={<Switch {...field} checked={field.value} />}
              label="활성화"
            />
          )}
        />

        {/* 액션 버튼 */}
        <Stack direction="row" spacing={2} justifyContent="flex-end">
          <Button variant="outlined" onClick={onCancel}>
            취소
          </Button>
          <Button 
            type="submit" 
            variant="contained" 
            disabled={isCreating || isUpdating}
          >
            {isCreating || isUpdating ? (
              <CircularProgress size={20} />
            ) : mapping ? '수정' : '생성'}
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
};

export default MappingForm;