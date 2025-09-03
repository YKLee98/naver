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
  createFilterOptions,
} from '@mui/material';
import { useFormik } from 'formik';
import * as yup from 'yup';
import { useAppDispatch, useAppSelector } from '@/hooks';
import { productService } from '@/services/api/product.service';

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

const filterOptions = createFilterOptions({
  limit: 100, // 최대 100개까지 표시
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
  const [selectedShopifyProduct, setSelectedShopifyProduct] = useState<any>(null);
  const [selectedNaverProduct, setSelectedNaverProduct] = useState<any>(null);

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

  const searchNaverByProductName = async (productName: string) => {
    setSearchingNaver(true);
    try {
      // 제품명에서 의미 있는 키워드 추출
      let searchKeyword = productName;
      
      // 아티스트 이름 추출 시도 (예: "SEVENTEEN - Mini Album" -> "SEVENTEEN")
      if (productName.includes(' - ')) {
        searchKeyword = productName.split(' - ')[0].trim();
      } else if (productName.includes(' / ')) {
        searchKeyword = productName.split(' / ')[0].trim();
      }
      
      // "EPR 테스트용" 같은 테스트 상품은 전체 제목으로 검색
      if (searchKeyword.includes('테스트') || searchKeyword.includes('EPR')) {
        searchKeyword = productName;
      }
      
      console.log('🔍 Searching Naver products with keyword:', searchKeyword, 'from title:', productName);
      
      // 상품명으로 네이버 상품 검색 - 50개 가져오기
      const response = await productService.searchNaverByName(searchKeyword, 50);
      
      if (response.data.success && response.data.data) {
        console.log('Naver products found by name:', response.data.data.length);
        
        // 제목 유사도 기반 정렬 (서버에서 이미 처리되지만 추가 정렬)
        const sortedProducts = response.data.data.sort((a: any, b: any) => {
          const aName = (a.name || '').toLowerCase();
          const bName = (b.name || '').toLowerCase();
          const searchTerm = searchKeyword.toLowerCase();
          
          // 정확히 일치하는 경우 우선
          if (aName === searchTerm) return -1;
          if (bName === searchTerm) return 1;
          
          // 포함 여부 체크
          const aIncludes = aName.includes(searchTerm);
          const bIncludes = bName.includes(searchTerm);
          
          if (aIncludes && !bIncludes) return -1;
          if (!aIncludes && bIncludes) return 1;
          
          // 시작 위치가 더 앞인 것 우선
          const aIndex = aName.indexOf(searchTerm);
          const bIndex = bName.indexOf(searchTerm);
          
          if (aIndex !== -1 && bIndex !== -1) {
            return aIndex - bIndex;
          }
          
          // 길이가 더 짧은 것 우선
          return aName.length - bName.length;
        });
        
        // 최대 50개만 표시
        setNaverProducts(sortedProducts.slice(0, 50));
      } else {
        setNaverProducts([]);
      }
    } catch (error) {
      console.error('Failed to search Naver products by name:', error);
      setNaverProducts([]);
    } finally {
      setSearchingNaver(false);
    }
  };

  const handleNaverSearch = async (searchTerm?: string) => {
    // 이제 이 함수는 직접 호출되지 않고, Shopify 선택 후 자동으로 호출됨
    if (selectedShopifyProduct && selectedShopifyProduct.title) {
      await searchNaverByProductName(selectedShopifyProduct.title);
    }
  };

  const handleShopifySearch = async (searchTerm: string) => {
    if (!searchTerm) return;
    setSearchingShopify(true);
    try {
      // SKU로 Shopify 상품 검색
      const response = await productService.searchShopifyBySku(searchTerm);
      
      if (response.data.success && response.data.data) {
        // 단일 상품을 배열로 변환
        const product = response.data.data;
        setShopifyProducts([product]);
        setSelectedShopifyProduct(product);
        
        // formik values 설정
        formik.setFieldValue('sku', product.sku);
        formik.setFieldValue('shopifyProductId', product.id);
        formik.setFieldValue('shopifyVariantId', product.variantId);
        
        // Shopify 상품이 선택되면 자동으로 네이버 상품 검색
        if (product.title) {
          await searchNaverByProductName(product.title);
        }
      } else {
        setShopifyProducts([]);
        setNaverProducts([]);
      }
    } catch (error) {
      console.error('Failed to search Shopify products:', error);
      setShopifyProducts([]);
      setNaverProducts([]);
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
            {/* Step 1: Shopify SKU 검색 */}
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom>
                Step 1: Shopify 상품 선택 (SKU 검색)
              </Typography>
              <Autocomplete
                options={shopifyProducts}
                getOptionLabel={(option) => {
                  if (!option) return '';
                  return option.sku ? `${option.title} - SKU: ${option.sku}` : option.title || '';
                }}
                loading={searchingShopify}
                onInputChange={(event, value) => {
                  setShopifySearchTerm(value);
                  if (value) handleShopifySearch(value);
                }}
                onChange={(event, value) => {
                  if (value) {
                    setSelectedShopifyProduct(value);
                    formik.setFieldValue('sku', value.sku || value.variant?.sku);
                    formik.setFieldValue('shopifyProductId', value.id);
                    formik.setFieldValue('shopifyVariantId', value.variantId || value.variant?.id);
                    // 네이버 선택 초기화
                    setSelectedNaverProduct(null);
                    formik.setFieldValue('naverProductId', '');
                    // Shopify 상품이 선택되면 제품명으로 네이버 상품 검색
                    if (value.title) {
                      searchNaverByProductName(value.title);
                    }
                  } else {
                    // Shopify 선택 해제시 네이버 상품 목록도 초기화
                    setSelectedShopifyProduct(null);
                    setSelectedNaverProduct(null);
                    setNaverProducts([]);
                    formik.setFieldValue('naverProductId', '');
                  }
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="SKU로 Shopify 상품 검색"
                    placeholder="SKU 입력 (예: 2025080501)"
                    error={formik.touched.shopifyVariantId && Boolean(formik.errors.shopifyVariantId)}
                    helperText={formik.touched.shopifyVariantId && formik.errors.shopifyVariantId}
                  />
                )}
              />
              {selectedShopifyProduct && (
                <Box sx={{ mt: 1, p: 1, bgcolor: 'grey.100', borderRadius: 1 }}>
                  <Typography variant="caption" display="block">
                    선택된 Shopify 상품: {selectedShopifyProduct.title}
                  </Typography>
                  <Typography variant="caption" display="block">
                    SKU: {selectedShopifyProduct.sku || selectedShopifyProduct.variant?.sku}
                  </Typography>
                  <Typography variant="caption" display="block">
                    가격: ${selectedShopifyProduct.price || selectedShopifyProduct.variant?.price}
                  </Typography>
                  <Typography variant="caption" display="block">
                    재고: {selectedShopifyProduct.inventoryQuantity || selectedShopifyProduct.variant?.inventoryQuantity}개
                  </Typography>
                </Box>
              )}
            </Grid>

            <Grid item xs={12}>
              <Divider />
            </Grid>

            {/* Step 2: 네이버 상품 검색 */}
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom>
                Step 2: 네이버 상품 선택 {naverProducts.length > 0 && `(제목 유사도 순 - 총 ${naverProducts.length}개)`}
              </Typography>
              {!selectedShopifyProduct && (
                <Alert severity="info" sx={{ mb: 2 }}>
                  먼저 Shopify 상품을 선택해주세요
                </Alert>
              )}
              {selectedShopifyProduct && searchingNaver && (
                <Alert severity="info" sx={{ mb: 2 }}>
                  네이버 상품을 검색 중입니다...
                </Alert>
              )}
              {selectedShopifyProduct && !searchingNaver && naverProducts.length === 0 && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                  일치하는 네이버 상품을 찾을 수 없습니다. 다른 Shopify 상품을 선택해보세요.
                </Alert>
              )}
              <Autocomplete
                options={naverProducts}
                getOptionLabel={(option) => {
                  if (!option) return '';
                  // 제목만 표시
                  return option.name || '';
                }}
                renderOption={(props, option) => (
                  <Box component="li" {...props}>
                    <Box sx={{ width: '100%' }}>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {option.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {option.sellerManagementCode && `SKU: ${option.sellerManagementCode} | `}
                        ID: {option.channelProductNo || option.originProductNo || option.productId}
                        {option.salePrice && ` | ${option.salePrice.toLocaleString()}원`}
                      </Typography>
                    </Box>
                  </Box>
                )}
                loading={searchingNaver}
                value={selectedNaverProduct} // 명시적으로 value 설정
                onChange={(event, value) => {
                  if (value) {
                    setSelectedNaverProduct(value);
                    // channelProductNo가 있으면 우선 사용, 없으면 originProductNo 사용
                    const naverProductId = value.channelProductNo || value.originProductNo || value.productId;
                    formik.setFieldValue('naverProductId', naverProductId);
                  } else {
                    // 값이 지워졌을 때 초기화
                    setSelectedNaverProduct(null);
                    formik.setFieldValue('naverProductId', '');
                  }
                }}
                disabled={!selectedShopifyProduct}
                ListboxProps={{
                  style: { 
                    maxHeight: 500,  // 높이 제한 증가
                    overflow: 'auto'
                  }
                }}
                filterOptions={(options) => options} // 필터링 비활성화 (이미 서버에서 정렬됨)
                disableListWrap
                openOnFocus
                autoHighlight={false} // 자동 하이라이트 비활성화
                autoSelect={false} // 자동 선택 비활성화
                clearOnBlur={false} // blur 시 자동 선택 방지
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="네이버 상품 선택 (제목 유사도 기준)"
                    placeholder={selectedShopifyProduct ? `${naverProducts.length}개 상품 중에서 선택하세요` : "먼저 Shopify 상품을 선택하세요"}
                    error={formik.touched.naverProductId && Boolean(formik.errors.naverProductId)}
                    helperText={formik.touched.naverProductId && formik.errors.naverProductId || (naverProducts.length > 0 ? `총 ${naverProducts.length}개 상품이 검색되었습니다. 반드시 선택해주세요.` : '')}
                  />
                )}
              />
              {selectedNaverProduct && (
                <Box sx={{ mt: 1, p: 1, bgcolor: 'grey.100', borderRadius: 1 }}>
                  <Typography variant="caption" display="block">
                    선택된 네이버 상품: {selectedNaverProduct.name}
                  </Typography>
                  {selectedNaverProduct.sellerManagementCode && (
                    <Typography variant="caption" display="block" color="primary">
                      네이버 SKU: {selectedNaverProduct.sellerManagementCode}
                    </Typography>
                  )}
                  <Typography variant="caption" display="block">
                    상품 ID: {formik.values.naverProductId}
                  </Typography>
                  <Typography variant="caption" display="block">
                    재고: {selectedNaverProduct.stockQuantity}개
                  </Typography>
                  <Typography variant="caption" display="block">
                    판매가: {selectedNaverProduct.salePrice?.toLocaleString()}원
                    {selectedNaverProduct.discountedPrice && selectedNaverProduct.discountedPrice !== selectedNaverProduct.salePrice && 
                      ` (할인가: ${selectedNaverProduct.discountedPrice.toLocaleString()}원)`
                    }
                  </Typography>
                  {selectedNaverProduct.deliveryFee !== undefined && (
                    <Typography variant="caption" display="block">
                      배송비: {selectedNaverProduct.deliveryFee === 0 ? '무료' : `${selectedNaverProduct.deliveryFee.toLocaleString()}원`}
                      {selectedNaverProduct.deliveryAttributeType && ` (${selectedNaverProduct.deliveryAttributeType})`}
                    </Typography>
                  )}
                </Box>
              )}
            </Grid>

            <Grid item xs={12}>
              <Divider />
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