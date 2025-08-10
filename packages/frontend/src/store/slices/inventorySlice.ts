// packages/frontend/src/store/slices/inventorySlice.ts
import { createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit';
import { inventoryService } from '@/services/api/inventory.service';

interface InventoryItem {
  _id: string;
  sku: string;
  productName: string;
  shopifyQuantity: number;
  naverQuantity: number;
  status: 'synced' | 'discrepancy' | 'error';
  lastSyncedAt: string;
  discrepancy?: number;
}

interface InventoryState {
  items: InventoryItem[];
  selectedSku: string | null;
  selectedItem: InventoryItem | null;
  transactions: any[];
  discrepancies: any[];
  lowStockAlerts: any[];
  loading: boolean;
  error: string | null;
  lastUpdated: string | null;
  filters: {
    status?: string;
    platform?: string;
    search?: string;
  };
}

const initialState: InventoryState = {
  items: [],
  selectedSku: null,
  selectedItem: null,
  transactions: [],
  discrepancies: [],
  lowStockAlerts: [],
  loading: false,
  error: null,
  lastUpdated: null,
  filters: {},
};

// Async thunks
export const fetchInventoryStatus = createAsyncThunk(
  'inventory/fetchStatus',
  async () => {
    const response = await inventoryService.getInventoryStatus();
    return response.data;
  }
);

export const fetchInventoryBySku = createAsyncThunk(
  'inventory/fetchBySku',
  async (sku: string) => {
    const response = await inventoryService.getInventoryBySku(sku);
    return response.data;
  }
);

export const fetchTransactions = createAsyncThunk(
  'inventory/fetchTransactions',
  async (params?: any) => {
    const response = await inventoryService.getTransactions(params);
    return response.data;
  }
);

export const syncInventory = createAsyncThunk(
  'inventory/sync',
  async (params?: { sku?: string }) => {
    const response = params?.sku 
      ? await inventoryService.syncInventoryBySku(params.sku)
      : await inventoryService.syncInventory();
    return response.data;
  }
);

export const adjustInventory = createAsyncThunk(
  'inventory/adjust',
  async ({ sku, quantity, reason }: { sku: string; quantity: number; reason: string }) => {
    const response = await inventoryService.adjustInventory(sku, { quantity, reason });
    return response.data;
  }
);

export const fetchDiscrepancies = createAsyncThunk(
  'inventory/fetchDiscrepancies',
  async () => {
    const response = await inventoryService.getDiscrepancies();
    return response.data;
  }
);

export const setLowStockAlert = createAsyncThunk(
  'inventory/setLowStockAlert',
  async ({ sku, threshold }: { sku: string; threshold: number }) => {
    const response = await inventoryService.setLowStockAlert(sku, threshold);
    return response.data;
  }
);

export const generateInventoryReport = createAsyncThunk(
  'inventory/generateReport',
  async (params: any) => {
    const response = await inventoryService.generateReport(params);
    return response.data;
  }
);

const inventorySlice = createSlice({
  name: 'inventory',
  initialState,
  reducers: {
    setSelectedSku: (state, action: PayloadAction<string | null>) => {
      state.selectedSku = action.payload;
      state.selectedItem = action.payload 
        ? state.items.find(item => item.sku === action.payload) || null
        : null;
    },
    updateInventoryRealTime: (state, action: PayloadAction<any>) => {
      const { sku, shopifyQuantity, naverQuantity, status } = action.payload;
      const index = state.items.findIndex(item => item.sku === sku);
      
      if (index !== -1) {
        state.items[index] = {
          ...state.items[index],
          shopifyQuantity,
          naverQuantity,
          status,
          lastSyncedAt: new Date().toISOString()
        };
        
        // Update selected item if it's the same SKU
        if (state.selectedSku === sku) {
          state.selectedItem = state.items[index];
        }
      } else {
        // Add new item if not exists
        state.items.push({
          _id: Date.now().toString(),
          sku,
          productName: '',
          shopifyQuantity,
          naverQuantity,
          status,
          lastSyncedAt: new Date().toISOString()
        });
      }
      
      state.lastUpdated = new Date().toISOString();
    },
    updateInventoryStatus: (state, action: PayloadAction<{ sku: string; status: string }>) => {
      const index = state.items.findIndex(item => item.sku === action.payload.sku);
      if (index !== -1) {
        state.items[index].status = action.payload.status as any;
      }
    },
    setFilters: (state, action: PayloadAction<InventoryState['filters']>) => {
      state.filters = action.payload;
    },
    clearError: (state) => {
      state.error = null;
    },
    resetInventoryState: () => initialState,
  },
  extraReducers: (builder) => {
    // Fetch inventory status
    builder
      .addCase(fetchInventoryStatus.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchInventoryStatus.fulfilled, (state, action) => {
        state.loading = false;
        state.items = action.payload.items || [];
        state.lastUpdated = new Date().toISOString();
      })
      .addCase(fetchInventoryStatus.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to fetch inventory status';
      })
      // Fetch inventory by SKU
      .addCase(fetchInventoryBySku.fulfilled, (state, action) => {
        const item = action.payload;
        const index = state.items.findIndex(i => i.sku === item.sku);
        
        if (index !== -1) {
          state.items[index] = item;
        } else {
          state.items.push(item);
        }
        
        if (state.selectedSku === item.sku) {
          state.selectedItem = item;
        }
      })
      // Fetch transactions
      .addCase(fetchTransactions.fulfilled, (state, action) => {
        state.transactions = action.payload.transactions || [];
      })
      // Sync inventory
      .addCase(syncInventory.pending, (state) => {
        state.loading = true;
      })
      .addCase(syncInventory.fulfilled, (state, action) => {
        state.loading = false;
        if (action.payload.items) {
          state.items = action.payload.items;
        }
        state.lastUpdated = new Date().toISOString();
      })
      .addCase(syncInventory.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Sync failed';
      })
      // Fetch discrepancies
      .addCase(fetchDiscrepancies.fulfilled, (state, action) => {
        state.discrepancies = action.payload.discrepancies || [];
      })
      // Set low stock alert
      .addCase(setLowStockAlert.fulfilled, (state, action) => {
        state.lowStockAlerts.push(action.payload);
      });
  },
});

export const {
  setSelectedSku,
  updateInventoryRealTime,
  updateInventoryStatus,
  setFilters,
  clearError: clearInventoryError,
  resetInventoryState,
} = inventorySlice.actions;

export default inventorySlice.reducer;