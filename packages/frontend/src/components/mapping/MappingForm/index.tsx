// packages/frontend/src/components/mapping/MappingForm/index.tsx
import React, { useEffect } from 'react';
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
} from '@mui/material';
import { useForm, Controller } from 'react-hook-form';
import {
  useCreateMappingMutation,
  useUpdateMappingMutation,
  useGetNaverProductsQuery,
  useGetShopifyProductsQuery,
} from '@/store/api/apiSlice';
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
  productName: string;
  vendor: string;
  priceMargin: number;
  isActive: boolean;
}

const MappingForm: React.FC<MappingFormProps> = ({ mapping, onSuccess, onCancel }) => {
  const [createMapping, { isLoading: isCreating }] = useCreateMappingMutation();
  const [updateMapping, { isLoading: isUpdating }] = useUpdateMappingMutation();
  
  const { data: naverProducts, isLoading: naverLoading } = useGetNaverProductsQuery({});
  const { data: shopifyProducts, isLoading: shopifyLoading } = useGetShopifyProductsQuery({});

  const { control, handleSubmit, setValue, watch, formState: { errors } } = useForm<MappingFormData>({
    defaultValues: {
      sku: mapping?.sku || '',
      naverProductId: mapping?.naverProductId || '',
      shopifyProductId: mapping?.shopifyProductId || '',
      productName: mapping?.productName || '',
      vendor: mapping?.vendor || '',
      priceMargin: (mapping?.priceMargin || 0.1) * 100,
      isActive: mapping?.isActive ?? true,
    },
  });

  const selectedNaverProduct = watch('naverProductId');
  const selectedShopifyProduct = watch('shopifyProductId');

  useEffect(() => {
    // Auto-fill product name when Naver product is selected
    if (selectedNaverProduct && naverProducts?.data) {
      const product = naverProducts.data.find(p => p.id === selectedNaverProduct);
      if (product) {
        setValue('productName', product.name);
        setValue('sku', product.sellerManagementCode || '');
      }
    }
  }, [selectedNaverProduct, naverProducts, setValue]);

  const onSubmit = async (data: MappingFormData) => {
    try {
      const payload = {
        ...data,
        priceMargin: data.priceMargin / 100,
      };

      if (mapping) {
        await updateMapping({ id: mapping._id, ...payload }).unwrap();
      } else {
        await createMapping(payload).unwrap();
      }

      onSuccess?.();
    } catch (error) {
      console.error('Failed to save mapping:', error);
    }
  };

  const isLoading = isCreating || isUpdating || naverLoading || shopifyLoading;

  return (
    <Box component="form" onSubmit={handleSubmit(onSubmit)}>
      <Stack spacing={3}>
        <Controller
          name="sku"
          control={control}
          rules={{ 
            required: 'SKU는 필수입니다',
            pattern: {
              value: /^[A-Za-z0-9\-_]+$/,
              message: 'SKU는 영문, 숫자, 하이픈, 언더스코어만 사용 가능합니다'
            }
          }}
          render={({ field, fieldState }) => (
            <TextField
              {...field}
              label="SKU"
              fullWidth
              error={!!fieldState.error}
              helperText={fieldState.error?.message}
              disabled={!!mapping}
            />
          )}
        />

        <Controller
          name="naverProductId"
          control={control}
          rules={{ required: '네이버 상품을 선택하세요' }}
          render={({ field, fieldState }) => (
            <Autocomplete
              {...field}
              options={naverProducts?.data || []}
              getOptionLabel={(option: any) => option.name || ''}
              getOptionKey={(option: any) => option.id}
              loading={naverLoading}
              onChange={(_, value) => field.onChange(value?.id || '')}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="네이버 상품"
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message}
                  InputProps={{
                    ...params.InputProps,
                    endAdornment: (
                      <>
                        {naverLoading ? <CircularProgress color="inherit" size={20} /> : null}
                        {params.InputProps.endAdornment}
                      </>
                    ),
                  }}
                />
              )}
            />
          )}
        />

        <Controller
          name="shopifyProductId"
          control={control}
          rules={{ required: 'Shopify 상품을 선택하세요' }}
          render={({ field, fieldState }) => (
            <Autocomplete
              {...field}
              options={shopifyProducts?.data || []}
              getOptionLabel={(option: any) => option.title || ''}
              getOptionKey={(option: any) => option.id}
              loading={shopifyLoading}
              onChange={(_, value) => field.onChange(value?.id || '')}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Shopify 상품"
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message}
                  InputProps={{
                    ...params.InputProps,
                    endAdornment: (
                      <>
                        {shopifyLoading ? <CircularProgress color="inherit" size={20} /> : null}
                        {params.InputProps.endAdornment}
                      </>
                    ),
                  }}
                />
              )}
            />
          )}
        />

        <Controller
          name="productName"
          control={control}
          rules={{ required: '상품명은 필수입니다' }}
          render={({ field, fieldState }) => (
            <TextField
              {...field}
              label="상품명"
              fullWidth
              error={!!fieldState.error}
              helperText={fieldState.error?.message}
            />
          )}
        />

        <Controller
          name="vendor"
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              label="공급업체"
              fullWidth
            />
          )}
        />

        <Controller
          name="priceMargin"
          control={control}
          rules={{ 
            required: '마진율은 필수입니다',
            min: { value: 0, message: '마진율은 0% 이상이어야 합니다' },
            max: { value: 100, message: '마진율은 100% 이하여야 합니다' }
          }}
          render={({ field, fieldState }) => (
            <TextField
              {...field}
              type="number"
              label="가격 마진율"
              fullWidth
              error={!!fieldState.error}
              helperText={fieldState.error?.message}
              InputProps={{
                endAdornment: <InputAdornment position="end">%</InputAdornment>,
              }}
            />
          )}
        />

        <Controller
          name="isActive"
          control={control}
          render={({ field }) => (
            <FormControlLabel
              control={<Switch {...field} checked={field.value} />}
              label="동기화 활성화"
            />
          )}
        />

        {mapping && (
          <Alert severity="info">
            마지막 동기화: {mapping.lastSyncedAt ? new Date(mapping.lastSyncedAt).toLocaleString() : '없음'}
          </Alert>
        )}

        <Stack direction="row" spacing={2} justifyContent="flex-end">
          {onCancel && (
            <Button onClick={onCancel} disabled={isLoading}>
              취소
            </Button>
          )}
          <Button
            type="submit"
            variant="contained"
            disabled={isLoading}
          >
            {isLoading ? <CircularProgress size={24} /> : mapping ? '수정' : '생성'}
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
};

export default MappingForm;

