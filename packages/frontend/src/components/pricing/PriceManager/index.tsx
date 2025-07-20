import React, { useState } from 'react';
import {
  Card,
  CardContent,
  CardActions,
  Typography,
  TextField,
  Button,
  Stack,
  Box,
  InputAdornment,
  Alert,
  Divider,
  Tooltip,
} from '@mui/material';
import {
  Save as SaveIcon,
  Calculate as CalculateIcon,
  History as HistoryIcon,
} from '@mui/icons-material';
import { useForm, Controller } from 'react-hook-form';
import { useUpdatePricingMutation } from '@/store/api/apiSlice';
import { formatCurrency, formatPercent } from '@/utils/formatters';

interface PriceManagerProps {
  sku: string;
  productName: string;
  currentPricing: {
    naverPrice: number;
    shopifyPrice: number;
    margin: number;
    exchangeRate: number;
  };
  onSuccess?: () => void;
  onViewHistory?: () => void;
}

interface PriceForm {
  naverPrice: number;
  margin: number;
  customShopifyPrice?: number;
}

const PriceManager: React.FC<PriceManagerProps> = ({
  sku,
  productName,
  currentPricing,
  onSuccess,
  onViewHistory,
}) => {
  const [updatePricing, { isLoading }] = useUpdatePricingMutation();
  const [useCustomPrice, setUseCustomPrice] = useState(false);
  
  const { control, handleSubmit, watch, setValue } = useForm<PriceForm>({
    defaultValues: {
      naverPrice: currentPricing.naverPrice,
      margin: currentPricing.margin * 100,
      customShopifyPrice: currentPricing.shopifyPrice,
    },
  });

  const naverPrice = watch('naverPrice');
  const margin = watch('margin');
  const customShopifyPrice = watch('customShopifyPrice');

  const calculateShopifyPrice = () => {
    if (useCustomPrice && customShopifyPrice) {
      return customShopifyPrice;
    }
    const priceInUSD = naverPrice / currentPricing.exchangeRate;
    return priceInUSD * (1 + margin / 100);
  };

  const onSubmit = async (data: PriceForm) => {
    try {
      await updatePricing({
        sku,
        naverPrice: data.naverPrice,
        margin: data.margin / 100,
        customShopifyPrice: useCustomPrice ? data.customShopifyPrice : undefined,
      }).unwrap();
      onSuccess?.();
    } catch (error) {
      console.error('Failed to update pricing:', error);
    }
  };

  return (
    <Card>
      <form onSubmit={handleSubmit(onSubmit)}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            {productName}
          </Typography>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            SKU: {sku}
          </Typography>

          <Divider sx={{ my: 2 }} />

          <Stack spacing={3}>
            <Controller
              name="naverPrice"
              control={control}
              rules={{ required: '네이버 가격을 입력하세요', min: 0 }}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  type="number"
                  label="네이버 가격"
                  fullWidth
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message}
                  InputProps={{
                    endAdornment: <InputAdornment position="end">원</InputAdornment>,
                  }}
                />
              )}
            />

            <Controller
              name="margin"
              control={control}
              rules={{ required: '마진율을 입력하세요', min: 0, max: 100 }}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  type="number"
                  label="마진율"
                  fullWidth
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message}
                  InputProps={{
                    endAdornment: <InputAdornment position="end">%</InputAdornment>,
                  }}
                />
              )}
            />

            {useCustomPrice && (
              <Controller
                name="customShopifyPrice"
                control={control}
                rules={{ required: useCustomPrice ? '커스텀 가격을 입력하세요' : false, min: 0 }}
                render={({ field, fieldState }) => (
                  <TextField
                    {...field}
                    type="number"
                    label="Shopify 커스텀 가격"
                    fullWidth
                    error={!!fieldState.error}
                    helperText={fieldState.error?.message}
                    InputProps={{
                      startAdornment: <InputAdornment position="start">$</InputAdornment>,
                    }}
                  />
                )}
              />
            )}

            <Alert severity="info">
              <Box>
                <Typography variant="body2">
                  현재 환율: ₩{formatCurrency(currentPricing.exchangeRate, 'KRW')} / $1
                </Typography>
                <Typography variant="body2" sx={{ mt: 1 }}>
                  계산된 Shopify 가격: <strong>${calculateShopifyPrice().toFixed(2)}</strong>
                </Typography>
              </Box>
            </Alert>
          </Stack>
        </CardContent>

        <CardActions sx={{ justifyContent: 'space-between', px: 2 }}>
          <Box>
            <Tooltip title="가격 변경 이력 보기">
              <Button
                startIcon={<HistoryIcon />}
                onClick={onViewHistory}
                disabled={!onViewHistory}
              >
                이력
              </Button>
            </Tooltip>
          </Box>
          <Box>
            <Button
              onClick={() => setUseCustomPrice(!useCustomPrice)}
              sx={{ mr: 1 }}
            >
              {useCustomPrice ? '자동 계산' : '커스텀 가격'}
            </Button>
            <Button
              type="submit"
              variant="contained"
              startIcon={<SaveIcon />}
              disabled={isLoading}
            >
              {isLoading ? '저장 중...' : '가격 업데이트'}
            </Button>
          </Box>
        </CardActions>
      </form>
    </Card>
  );
};

export default PriceManager;

