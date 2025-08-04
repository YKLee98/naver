// ===== 3. packages/frontend/src/store/slices/productSlice.ts =====
// createMapping action 수정
import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { productApi } from '@/services/api/product.service';
import { Product, Mapping } from '@/types/models';

interface ProductState {
  products: Product[];
  mappings: Mapping[];
  selectedProduct: Product | null;
  selectedMapping: Mapping | null;
  loading: boolean;
  error: string | null;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

const initialState: ProductState = {
  products: [],
  mappings: [],
  selectedProduct: null,
  selectedMapping: null,
  loading: false,
  error: null,
  pagination: {
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  },
};

// Async thunks
export const fetchProducts = createAsyncThunk(
  'products/fetchProducts',
  async (params?: { page?: number; limit?: number; search?: string; status?: string }) => {
    const response = await productApi.getProducts(params);
    return response;
  }
);

export const fetchMappings = createAsyncThunk(
  'products/fetchMappings',
  async (params?: { page?: number; limit?: number; search?: string; status?: string }) => {
    const response = await productApi.getMappings(params);
    return response;
  }
);

export const createMapping = createAsyncThunk(
  'products/createMapping',
  async (data: {
    sku: string;
    naverProductId: string;
    shopifyProductId: string;
    shopifyVariantId: string;
    productName?: string;
    vendor?: string;
    priceMargin?: number;
    isActive?: boolean;
  }) => {
    const response = await productApi.createMapping(data);
    return response;
  }
);

export const updateMapping = createAsyncThunk(
  'products/updateMapping',
  async ({ id, data }: { id: string; data: Partial<Mapping> }) => {
    const response = await productApi.updateMapping(id, data);
    return response;
  }
);

export const deleteMapping = createAsyncThunk(
  'products/deleteMapping',
  async (id: string) => {
    await productApi.deleteMapping(id);
    return id;
  }
);

export const syncMapping = createAsyncThunk(
  'products/syncMapping',
  async (id: string) => {
    const response = await productApi.syncMapping(id);
    return response;
  }
);

const productSlice = createSlice({
  name: 'products',
  initialState,
  reducers: {
    setSelectedProduct: (state, action: PayloadAction<Product | null>) => {
      state.selectedProduct = action.payload;
    },
    setSelectedMapping: (state, action: PayloadAction<Mapping | null>) => {
      state.selectedMapping = action.payload;
    },
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch products
      .addCase(fetchProducts.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchProducts.fulfilled, (state, action) => {
        state.loading = false;
        state.products = action.payload.data;
        state.pagination = {
          page: action.payload.page,
          limit: action.payload.limit || 20,
          total: action.payload.total,
          totalPages: action.payload.totalPages,
        };
      })
      .addCase(fetchProducts.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to fetch products';
      })
      // Fetch mappings
      .addCase(fetchMappings.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchMappings.fulfilled, (state, action) => {
        state.loading = false;
        state.mappings = action.payload.data;
        state.pagination = {
          page: action.payload.page,
          limit: action.payload.limit || 20,
          total: action.payload.total,
          totalPages: action.payload.totalPages,
        };
      })
      .addCase(fetchMappings.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to fetch mappings';
      })
      // Create mapping
      .addCase(createMapping.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(createMapping.fulfilled, (state, action) => {
        state.loading = false;
        // API 응답 구조에 따라 처리
        const newMapping = action.payload.data || action.payload;
        state.mappings.unshift(newMapping);
      })
      .addCase(createMapping.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to create mapping';
      })
      // Update mapping
      .addCase(updateMapping.fulfilled, (state, action) => {
        const updatedMapping = action.payload.data || action.payload;
        const index = state.mappings.findIndex(m => m._id === updatedMapping._id);
        if (index !== -1) {
          state.mappings[index] = updatedMapping;
        }
      })
      // Delete mapping
      .addCase(deleteMapping.fulfilled, (state, action) => {
        state.mappings = state.mappings.filter(m => m._id !== action.payload);
      });
  },
});

export const { setSelectedProduct, setSelectedMapping, clearError } = productSlice.actions;
export default productSlice.reducer;
