import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { ProductMapping } from '@/types';

interface MappingState {
  selectedMapping: ProductMapping | null;
  filter: {
    search?: string;
    vendor?: string;
    isActive?: boolean;
    syncStatus?: 'synced' | 'pending' | 'error';
  };
  bulkSelection: string[];
  autoDiscoveryResults: Array<{
    sku: string;
    naverProduct: any;
    shopifyVariant: any;
    confidence: number;
  }>;
}

const initialState: MappingState = {
  selectedMapping: null,
  filter: {},
  bulkSelection: [],
  autoDiscoveryResults: [],
};

const mappingSlice = createSlice({
  name: 'mapping',
  initialState,
  reducers: {
    setSelectedMapping: (state, action: PayloadAction<ProductMapping | null>) => {
      state.selectedMapping = action.payload;
    },
    setMappingFilter: (state, action: PayloadAction<typeof initialState.filter>) => {
      state.filter = action.payload;
    },
    clearMappingFilter: (state) => {
      state.filter = {};
    },
    toggleBulkSelection: (state, action: PayloadAction<string>) => {
      const index = state.bulkSelection.indexOf(action.payload);
      if (index > -1) {
        state.bulkSelection.splice(index, 1);
      } else {
        state.bulkSelection.push(action.payload);
      }
    },
    clearBulkSelection: (state) => {
      state.bulkSelection = [];
    },
    setAutoDiscoveryResults: (state, action: PayloadAction<typeof initialState.autoDiscoveryResults>) => {
      state.autoDiscoveryResults = action.payload;
    },
  },
});

export const {
  setSelectedMapping,
  setMappingFilter,
  clearMappingFilter,
  toggleBulkSelection,
  clearBulkSelection,
  setAutoDiscoveryResults,
} = mappingSlice.actions;

export default mappingSlice.reducer;
