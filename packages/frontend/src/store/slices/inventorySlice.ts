// packages/frontend/src/store/slices/inventorySlice.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { InventoryStatus, InventoryTransaction } from '@/types/models';

interface InventoryState {
  inventoryStatus: Record<string, InventoryStatus>;
  transactions: InventoryTransaction[];
  filter: {
    platform?: 'naver' | 'shopify' | 'all';
    status?: 'in_sync' | 'out_of_sync' | 'critical' | 'all';
    search?: string;
  };
  sort: {
    field: string;
    order: 'asc' | 'desc';
  };
  loading: boolean;
  error: string | null;
}

const initialState: InventoryState = {
  inventoryStatus: {},
  transactions: [],
  filter: {
    platform: 'all',
    status: 'all',
    search: '',
  },
  sort: {
    field: 'sku',
    order: 'asc',
  },
  loading: false,
  error: null,
};

const inventorySlice = createSlice({
  name: 'inventory',
  initialState,
  reducers: {
    setInventoryStatus: (state, action: PayloadAction<Record<string, InventoryStatus>>) => {
      state.inventoryStatus = action.payload;
    },
    
    updateInventoryRealTime: (state, action: PayloadAction<InventoryStatus>) => {
      state.inventoryStatus[action.payload.sku] = action.payload;
    },
    
    addTransaction: (state, action: PayloadAction<InventoryTransaction>) => {
      state.transactions.unshift(action.payload);
      // 최대 1000개까지만 보관
      if (state.transactions.length > 1000) {
        state.transactions = state.transactions.slice(0, 1000);
      }
    },
    
    setTransactions: (state, action: PayloadAction<InventoryTransaction[]>) => {
      state.transactions = action.payload;
    },
    
    setInventoryFilter: (state, action: PayloadAction<Partial<InventoryState['filter']>>) => {
      state.filter = { ...state.filter, ...action.payload };
    },
    
    setInventorySort: (state, action: PayloadAction<InventoryState['sort']>) => {
      state.sort = action.payload;
    },
    
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
    
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
    
    clearInventoryState: (state) => {
      return initialState;
    },
  },
});

export const {
  setInventoryStatus,
  updateInventoryRealTime,
  addTransaction,
  setTransactions,
  setInventoryFilter,
  setInventorySort,
  setLoading,
  setError,
  clearInventoryState,
} = inventorySlice.actions;

export default inventorySlice.reducer;