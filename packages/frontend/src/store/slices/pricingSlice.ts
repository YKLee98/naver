// packages/frontend/src/store/slices/pricingSlice.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { PriceHistory, ExchangeRate } from '@/types/models';

interface PricingState {
  priceHistory: PriceHistory[];
  exchangeRate: ExchangeRate | null;
  filter: {
    dateRange?: {
      start: string;
      end: string;
    };
    sku?: string;
  };
  loading: boolean;
  error: string | null;
}

const initialState: PricingState = {
  priceHistory: [],
  exchangeRate: null,
  filter: {},
  loading: false,
  error: null,
};

const pricingSlice = createSlice({
  name: 'pricing',
  initialState,
  reducers: {
    setPriceHistory: (state, action: PayloadAction<PriceHistory[]>) => {
      state.priceHistory = action.payload;
    },
    
    addPriceHistory: (state, action: PayloadAction<PriceHistory>) => {
      state.priceHistory.unshift(action.payload);
      // 최대 500개까지만 보관
      if (state.priceHistory.length > 500) {
        state.priceHistory = state.priceHistory.slice(0, 500);
      }
    },
    
    updatePriceRealTime: (state, action: PayloadAction<PriceHistory>) => {
      const index = state.priceHistory.findIndex(p => p._id === action.payload._id);
      if (index !== -1) {
        state.priceHistory[index] = action.payload;
      } else {
        state.priceHistory.unshift(action.payload);
      }
    },
    
    setExchangeRate: (state, action: PayloadAction<ExchangeRate>) => {
      state.exchangeRate = action.payload;
    },
    
    updateExchangeRate: (state, action: PayloadAction<ExchangeRate>) => {
      state.exchangeRate = action.payload;
    },
    
    setPriceFilter: (state, action: PayloadAction<Partial<PricingState['filter']>>) => {
      state.filter = { ...state.filter, ...action.payload };
    },
    
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
    
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
    
    clearPricingState: (state) => {
      return initialState;
    },
  },
});

export const {
  setPriceHistory,
  addPriceHistory,
  updatePriceRealTime,
  setExchangeRate,
  updateExchangeRate,
  setPriceFilter,
  setLoading,
  setError,
  clearPricingState,
} = pricingSlice.actions;

export default pricingSlice.reducer;