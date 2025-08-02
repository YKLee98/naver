// packages/frontend/src/store/slices/inventorySlice.ts
import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { inventoryApi } from '@/services/api/inventory.service';
import { InventoryStatus, InventoryTransaction } from '@/types/models';

interface InventoryState {
  inventoryStatus: InventoryStatus[];
  transactions: InventoryTransaction[];
  discrepancies: any[];
  selectedSku: string | null;
  loading: boolean;
  error: string | null;
  pagination: {
    page: number;
    totalPages: number;
    total: number;
  };
}

const initialState: InventoryState = {
  inventoryStatus: [],
  transactions: [],
  discrepancies: [],
  selectedSku: null,
  loading: false,
  error: null,
  pagination: {
    page: 1,
    totalPages: 1,
    total: 0,
  },
};

// Async thunks
export const fetchInventoryStatus = createAsyncThunk(
  'inventory/fetchStatus',
  async (params?: Parameters<typeof inventoryApi.getInventoryStatus>[0]) => {
    const response = await inventoryApi.getInventoryStatus(params);
    return response;
  }
);

export const fetchInventoryBySku = createAsyncThunk(
  'inventory/fetchBySku',
  async (sku: string) => {
    const response = await inventoryApi.getInventoryBySku(sku);
    return response;
  }
);

export const fetchTransactions = createAsyncThunk(
  'inventory/fetchTransactions',
  async (params?: Parameters<typeof inventoryApi.getTransactions>[0]) => {
    const response = await inventoryApi.getTransactions(params);
    return response;
  }
);

export const syncInventory = createAsyncThunk(
  'inventory/sync',
  async (sku?: string) => {
    const response = await inventoryApi.syncInventory(sku);
    return response;
  }
);

export const adjustInventory = createAsyncThunk(
  'inventory/adjust',
  async (data: Parameters<typeof inventoryApi.adjustInventory>[0]) => {
    const response = await inventoryApi.adjustInventory(data);
    return response;
  }
);

export const fetchDiscrepancies = createAsyncThunk(
  'inventory/fetchDiscrepancies',
  async () => {
    const response = await inventoryApi.getInventoryDiscrepancies();
    return response.data;
  }
);

export const setLowStockAlert = createAsyncThunk(
  'inventory/setAlert',
  async (data: Parameters<typeof inventoryApi.setLowStockAlert>[0]) => {
    const response = await inventoryApi.setLowStockAlert(data);
    return response;
  }
);

export const generateInventoryReport = createAsyncThunk(
  'inventory/generateReport',
  async (params: Parameters<typeof inventoryApi.generateInventoryReport>[0]) => {
    const response = await inventoryApi.generateInventoryReport(params);
    return response;
  }
);

const inventorySlice = createSlice({
  name: 'inventory',
  initialState,
  reducers: {
    setSelectedSku: (state, action: PayloadAction<string | null>) => {
      state.selectedSku = action.payload;
    },
    clearError: (state) => {
      state.error = null;
    },
    updateInventoryStatus: (state, action: PayloadAction<InventoryStatus>) => {
      const index = state.inventoryStatus.findIndex(
        item => item.sku === action.payload.sku
      );
      if (index !== -1) {
        state.inventoryStatus[index] = action.payload;
      }
    },
    // 실시간 재고 업데이트를 위한 액션 추가
    updateInventoryRealTime: (state, action: PayloadAction<{
      sku: string;
      quantity: number;
      platform: string;
      transactionType: string;
      timestamp: string;
    }>) => {
      const { sku, quantity } = action.payload;
      const index = state.inventoryStatus.findIndex(item => item.sku === sku);
      
      if (index !== -1) {
        // 기존 항목 업데이트
        state.inventoryStatus[index] = {
          ...state.inventoryStatus[index],
          currentStock: quantity,
          lastUpdated: new Date(action.payload.timestamp),
        };
      } else {
        // 새로운 항목 추가
        state.inventoryStatus.push({
          sku,
          currentStock: quantity,
          naverStock: 0,
          shopifyStock: 0,
          status: 'synced',
          lastSynced: new Date(action.payload.timestamp),
          lastUpdated: new Date(action.payload.timestamp),
        } as InventoryStatus);
      }
      
      // 트랜잭션 기록도 추가 (선택적)
      if (state.selectedSku === sku) {
        const newTransaction: Partial<InventoryTransaction> = {
          sku,
          platform: action.payload.platform,
          transactionType: action.payload.transactionType,
          quantity: quantity,
          newQuantity: quantity,
          timestamp: new Date(action.payload.timestamp),
        };
        state.transactions.unshift(newTransaction as InventoryTransaction);
        
        // 최대 100개까지만 유지
        if (state.transactions.length > 100) {
          state.transactions = state.transactions.slice(0, 100);
        }
      }
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch inventory status
      .addCase(fetchInventoryStatus.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchInventoryStatus.fulfilled, (state, action) => {
        state.loading = false;
        state.inventoryStatus = action.payload.data;
        state.pagination = {
          page: action.payload.page,
          totalPages: action.payload.totalPages,
          total: action.payload.total,
        };
      })
      .addCase(fetchInventoryStatus.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || '재고 현황 조회에 실패했습니다.';
      })
      // Fetch transactions
      .addCase(fetchTransactions.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchTransactions.fulfilled, (state, action) => {
        state.loading = false;
        state.transactions = action.payload.data;
        state.pagination = {
          page: action.payload.page,
          totalPages: action.payload.totalPages,
          total: action.payload.total,
        };
      })
      .addCase(fetchTransactions.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || '거래 내역 조회에 실패했습니다.';
      })
      // Fetch discrepancies
      .addCase(fetchDiscrepancies.fulfilled, (state, action) => {
        state.discrepancies = action.payload;
      })
      // Sync inventory
      .addCase(syncInventory.pending, (state) => {
        state.loading = true;
      })
      .addCase(syncInventory.fulfilled, (state) => {
        state.loading = false;
      })
      .addCase(syncInventory.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || '재고 동기화에 실패했습니다.';
      });
  },
});

export const { 
  setSelectedSku, 
  clearError, 
  updateInventoryStatus,
  updateInventoryRealTime 
} = inventorySlice.actions;

export default inventorySlice.reducer;