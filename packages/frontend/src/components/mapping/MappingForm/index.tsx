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
  Autocomplete,
  Typography,
  Card,
  CardContent,
  Grid,
  IconButton,
  Tooltip,
  Chip,
  Divider,
} from '@mui/material';
import {
  Search as SearchIcon,
  Refresh as RefreshIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
  Image as ImageIcon,
} from '@mui/icons-material';
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
      vendor: mapping?.vendor || '',
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
        const product = data.naver.products[0];
        setSelectedNaverProduct(product);
        setValue('naverProductId', product.id);
        setValue('productName', product.name);
      }

      // Shopify 상품이 1개만 찾아진 경우 자동 선택
      if (data.shopify.found && data.shopify.products.length === 1) {
        const product = data.shopify.products[0];
        setSelectedShopifyProduct(product);
        setValue('shopifyProductId', product.id);
        setValue('shopifyVariantId', product.variantId);
        setValue('vendor', product.vendor || '');
      }

    } catch (error: any) {
      console.error('SKU 검색 실패:', error);
      setErrorMessage('상품 검색 중 오류가 발생했습니다.');
    } finally {
      setIsSearching(false);
    }
  };

  // SKU 입력 후 엔터키 또는 포커스 아웃 시 자동 검색
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
      const payload = {
        ...data,
        priceMargin: data.priceMargin / 100,
        autoSearch: autoSearchEnabled, // 자동 검색 플래그 추가
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
                          {isSearching ? <CircularProgress size={20} /> : <SearchIcon />}
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
                    {searchResults.naver.found ? (
                      <Chip 
                        label={`${searchResults.naver.products.length}개 발견`} 
                        color="success" 
                        size="small" 
                        sx={{ ml: 1 }}
                      />
                    ) : (
                      <Chip label="미발견" color="error" size="small" sx={{ ml: 1 }} />
                    )}
                  </Typography>
                  
                  {searchResults.naver.found ? (
                    <Box>
                      <Autocomplete
                        options={searchResults.naver.products}
                        getOptionLabel={(option) => `${option.name} (${option.id})`}
                        value={selectedNaverProduct}
                        onChange={(_, value) => {
                          setSelectedNaverProduct(value);
                          if (value) {
                            setValue('naverProductId', value.id);
                            setValue('productName', value.name);
                          }
                        }}
                        renderOption={(props, option) => (
                          <Box component="li" {...props}>
                            <Stack>
                              <Typography variant="body2">{option.name}</Typography>
                              <Typography variant="caption" color="text.secondary">
                                ID: {option.id} | 가격: {option.price?.toLocaleString()}원
                              </Typography>
                            </Stack>
                          </Box>
                        )}
                        renderInput={(params) => (
                          <TextField 
                            {...params} 
                            label="네이버 상품 선택" 
                            size="small"
                            fullWidth
                          />
                        )}
                      />
                      
                      {selectedNaverProduct && (
                        <Box sx={{ mt: 2 }}>
                          {selectedNaverProduct.imageUrl && (
                            <img 
                              src={selectedNaverProduct.imageUrl} 
                              alt={selectedNaverProduct.name}
                              style={{ width: '100px', height: '100px', objectFit: 'cover' }}
                            />
                          )}
                          <Typography variant="caption" display="block">
                            재고: {selectedNaverProduct.stockQuantity}개
                          </Typography>
                        </Box>
                      )}
                    </Box>
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
                    {searchResults.shopify.found ? (
                      <Chip 
                        label={`${searchResults.shopify.products.length}개 발견`} 
                        color="success" 
                        size="small" 
                        sx={{ ml: 1 }}
                      />
                    ) : (
                      <Chip label="미발견" color="error" size="small" sx={{ ml: 1 }} />
                    )}
                  </Typography>
                  
                  {searchResults.shopify.found ? (
                    <Box>
                      <Autocomplete
                        options={searchResults.shopify.products}
                        getOptionLabel={(option) => 
                          `${option.title} ${option.variantTitle ? `- ${option.variantTitle}` : ''} (${option.sku})`
                        }
                        value={selectedShopifyProduct}
                        onChange={(_, value) => {
                          setSelectedShopifyProduct(value);
                          if (value) {
                            setValue('shopifyProductId', value.id);
                            setValue('shopifyVariantId', value.variantId);
                            setValue('vendor', value.vendor || '');
                          }
                        }}
                        renderOption={(props, option) => (
                          <Box component="li" {...props}>
                            <Stack>
                              <Typography variant="body2">{option.title}</Typography>
                              <Typography variant="caption" color="text.secondary">
                                SKU: {option.sku} | 가격: ${option.price}
                              </Typography>
                            </Stack>
                          </Box>
                        )}
                        renderInput={(params) => (
                          <TextField 
                            {...params} 
                            label="Shopify 상품 선택" 
                            size="small"
                            fullWidth
                          />
                        )}
                      />
                      
                      {selectedShopifyProduct && (
                        <Box sx={{ mt: 2 }}>
                          {selectedShopifyProduct.imageUrl && (
                            <img 
                              src={selectedShopifyProduct.imageUrl} 
                              alt={selectedShopifyProduct.title}
                              style={{ width: '100px', height: '100px', objectFit: 'cover' }}
                            />
                          )}
                          <Typography variant="caption" display="block">
                            재고: {selectedShopifyProduct.inventoryQuantity}개
                          </Typography>
                          <Typography variant="caption" display="block">
                            벤더: {selectedShopifyProduct.vendor}
                          </Typography>
                        </Box>
                      )}
                    </Box>
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

        <Divider />

        {/* 수동 입력 필드들 (검색 결과가 없거나 수동 입력이 필요한 경우) */}
        <Typography variant="subtitle2" color="text.secondary">
          수동 입력 (검색 결과가 없는 경우)
        </Typography>
        
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <Controller
              name="naverProductId"
              control={control}
              rules={{ required: '네이버 상품 ID는 필수입니다' }}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="네이버 상품 ID"
                  fullWidth
                  error={!!errors.naverProductId}
                  helperText={errors.naverProductId?.message}
                  disabled={!!selectedNaverProduct}
                />
              )}
            />
          </Grid>
          
          <Grid item xs={12} md={6}>
            <Controller
              name="shopifyProductId"
              control={control}
              rules={{ required: 'Shopify 상품 ID는 필수입니다' }}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="Shopify 상품 ID"
                  fullWidth
                  error={!!errors.shopifyProductId}
                  helperText={errors.shopifyProductId?.message}
                  disabled={!!selectedShopifyProduct}
                />
              )}
            />
          </Grid>
        </Grid>

        <Controller
          name="productName"
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              label="상품명"
              fullWidth
            />
          )}
        />

        <Grid container spacing={2}>
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