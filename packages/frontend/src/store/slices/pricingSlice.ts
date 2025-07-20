import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { PriceUpdateEvent, ExchangeRateUpdateEvent } from '@/types';

interface PricingState {
  subscribedSkus: string[];
  realTimePrices: Record<string, {
    naverPrice: number;
    shopifyPrice: number;
    lastUpdated: string;
  }>;
  currentExchangeRate: {
    rate: number;
    lastUpdated: string;
  } | null;
  priceFilter: {
    sku?: string;
    dateRange?: {
      startDate: string;
      endDate: string;
    };
  };
}

const initialState: PricingState = {
  subscribedSkus: [],
  realTimePrices: {},
  currentExchangeRate: null,
  priceFilter: {},
};

const pricingSlice = createSlice({
  name: 'pricing',
  initialState,
  reducers: {
    subscribeToPriceSku: (state, action: PayloadAction<string>) => {
      if (!state.subscribedSkus.includes(action.payload)) {
        state.subscribedSkus.push(action.payload);
      }
    },
    
    unsubscribeFromPriceSku: (state, action: PayloadAction<string>) => {
      state.subscribedSkus = state.subscribedSkus.filter(
        sku => sku !== action.payload
      );
    },
    
    updatePriceRealTime: (state, action: PayloadAction<PriceUpdateEvent>) => {
      const { sku, naverPrice, shopifyPrice, timestamp } = action.payload;
      state.realTimePrices[sku] = {
        naverPrice,
        shopifyPrice,
        lastUpdated: timestamp,
      };
    },
    
    updateExchangeRate: (state, action: PayloadAction<ExchangeRateUpdateEvent>) => {
      state.currentExchangeRate = {
        rate: action.payload.rate,
        lastUpdated: action.payload.timestamp,
      };
    },
    
    setPriceFilter: (state, action: PayloadAction<typeof initialState.priceFilter>) => {
      state.priceFilter = action.payload;
    },
    
    clearPriceFilter: (state) => {
      state.priceFilter = {};
    },
  },
});

export const {
  subscribeToPriceSku,
  unsubscribeFromPriceSku,
  updatePriceRealTime,
  updateExchangeRate,
  setPriceFilter,
  clearPriceFilter,
} = pricingSlice.actions;

export default pricingSlice.reducer;


