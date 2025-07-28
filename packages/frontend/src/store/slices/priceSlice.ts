// packages/frontend/src/store/slices/priceSlice.ts
import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { priceApi } from '@/services/api/price.service';
import { PriceHistory, ExchangeRate } from '@/types/models';

interface PriceState {
  priceHistory: PriceHistory[];
  currentPrices: any[];
  exchangeRate: ExchangeRate | null;
  pricingRules: any;
  loading: boolean;
  error: string | null;
}

const initialState: PriceState = {
  priceHistory: [],
  currentPrices: [],
  exchangeRate: null,
  pricingRules: null,
  loading: false,
  error: null,
};

// Async thunks
export const fetchPriceHistory = createAsyncThunk(
  'price/fetchHistory',
  async (params?: Parameters<typeof priceApi.getPriceHistory>[0]) => {
    const response = await priceApi.getPriceHistory(params);
    return response;
  }
);

export const fetchCurrentPrices = createAsyncThunk(
  'price/fetchCurrent',
  async (sku?: string) => {
    const response = await priceApi.getCurrentPrices(sku);
    return response;
  }
);

export const updatePrice = createAsyncThunk(
  'price/update',
  async (data: Parameters<typeof priceApi.updatePrice>[0]) => {
    const response = await priceApi.updatePrice(data);
    return response;
  }
);

export const bulkUpdatePrices = createAsyncThunk(
  'price/bulkUpdate',
  async (data: Parameters<typeof priceApi.bulkUpdatePrices>[0]) => {
    const response = await priceApi.bulkUpdatePrices(data);
    return response;
  }
);

export const fetchExchangeRate = createAsyncThunk(
  'price/fetchExchangeRate',
  async () => {
    const response = await priceApi.getCurrentExchangeRate();
    return response;
  }
);

export const updateExchangeRate = createAsyncThunk(
  'price/updateExchangeRate',
  async (data: Parameters<typeof priceApi.updateExchangeRate>[0]) => {
    const response = await priceApi.updateExchangeRate(data);
    return response;
  }
);

export const fetchPricingRules = createAsyncThunk(
  'price/fetchRules',
  async () => {
    const response = await priceApi.getPricingRules();
    return response;
  }
);

export const updatePricingRules = createAsyncThunk(
  'price/updateRules',
  async (data: Parameters<typeof priceApi.setPricingRules>[0]) => {
    const response = await priceApi.setPricingRules(data);
    return response;
  }
);

const priceSlice = createSlice({
  name: 'price',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    setExchangeRate: (state, action: PayloadAction<ExchangeRate>) => {
      state.exchangeRate = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch price history
      .addCase(fetchPriceHistory.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchPriceHistory.fulfilled, (state, action) => {
        state.loading = false;
        state.priceHistory = action.payload.data;
      })
      .addCase(fetchPriceHistory.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || '가격 이력 조회에 실패했습니다.';
      })
      // Fetch current prices
      .addCase(fetchCurrentPrices.fulfilled, (state, action) => {
        state.currentPrices = action.payload;
      })
      // Fetch exchange rate
      .addCase(fetchExchangeRate.fulfilled, (state, action) => {
        state.exchangeRate = action.payload;
      })
      // Update exchange rate
      .addCase(updateExchangeRate.fulfilled, (state, action) => {
        state.exchangeRate = action.payload;
      })
      // Fetch pricing rules
      .addCase(fetchPricingRules.fulfilled, (state, action) => {
        state.pricingRules = action.payload;
      })
      // Update pricing rules
      .addCase(updatePricingRules.fulfilled, (state, action) => {
        state.pricingRules = action.payload;
      });
  },
});

export const { clearError, setExchangeRate } = priceSlice.actions;
export default priceSlice.reducer;