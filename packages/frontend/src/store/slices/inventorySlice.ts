import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { InventoryTransaction, InventoryUpdateEvent } from '@/types';

interface InventoryState {
  subscribedSkus: string[];
  realTimeUpdates: Record<string, {
    quantity: number;
    lastUpdated: string;
  }>;
  selectedSku: string | null;
  filter: {
    platform?: 'naver' | 'shopify';
    transactionType?: string;
    dateRange?: {
      startDate: string;
      endDate: string;
    };
  };
}

const initialState: InventoryState = {
  subscribedSkus: [],
  realTimeUpdates: {},
  selectedSku: null,
  filter: {},
};

const inventorySlice = createSlice({
  name: 'inventory',
  initialState,
  reducers: {
    subscribeToSku: (state, action: PayloadAction<string>) => {
      if (!state.subscribedSkus.includes(action.payload)) {
        state.subscribedSkus.push(action.payload);
      }
    },
    
    unsubscribeFromSku: (state, action: PayloadAction<string>) => {
      state.subscribedSkus = state.subscribedSkus.filter(
        sku => sku !== action.payload
      );
    },
    
    updateInventoryRealTime: (state, action: PayloadAction<InventoryUpdateEvent>) => {
      const { sku, quantity, timestamp } = action.payload;
      state.realTimeUpdates[sku] = {
        quantity,
        lastUpdated: timestamp,
      };
    },
    
    setSelectedSku: (state, action: PayloadAction<string | null>) => {
      state.selectedSku = action.payload;
    },
    
    setInventoryFilter: (state, action: PayloadAction<typeof initialState.filter>) => {
      state.filter = action.payload;
    },
    
    clearInventoryFilter: (state) => {
      state.filter = {};
    },
  },
});

export const {
  subscribeToSku,
  unsubscribeFromSku,
  updateInventoryRealTime,
  setSelectedSku,
  setInventoryFilter,
  clearInventoryFilter,
} = inventorySlice.actions;

export default inventorySlice.reducer;
