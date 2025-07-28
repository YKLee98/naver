// packages/frontend/src/store/slices/productSlice.ts
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
    totalPages: number;
    total: number;
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
    totalPages: 1,
    total: 0,
  },
};

// Async thunks
export const fetchProducts = createAsyncThunk(
  'product/fetchProducts',
  async (params?: Parameters<typeof productApi.getProducts>[0]) => {
    const response = await productApi.getProducts(params);
    return response;
  }
);

export const fetchMappings = createAsyncThunk(
  'product/fetchMappings',
  async (params?: Parameters<typeof productApi.getMappings>[0]) => {
    const response = await productApi.getMappings(params);
    return response;
  }
);

export const createMapping = createAsyncThunk(
  'product/createMapping',
  async (data: Parameters<typeof productApi.createMapping>[0]) => {
    const response = await productApi.createMapping(data);
    return response;
  }
);

export const updateMapping = createAsyncThunk(
  'product/updateMapping',
  async ({ id, data }: { id: string; data: Partial<Mapping> }) => {
    const response = await productApi.updateMapping(id, data);
    return response;
  }
);

export const deleteMapping = createAsyncThunk(
  'product/deleteMapping',
  async (id: string) => {
    await productApi.deleteMapping(id);
    return id;
  }
);

export const syncMapping = createAsyncThunk(
  'product/syncMapping',
  async (id: string) => {
    const response = await productApi.syncMapping(id);
    return response;
  }
);

const productSlice = createSlice({
  name: 'product',
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
          totalPages: action.payload.totalPages,
          total: action.payload.total,
        };
      })
      .addCase(fetchProducts.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || '상품 조회에 실패했습니다.';
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
          totalPages: action.payload.totalPages,
          total: action.payload.total,
        };
      })
      .addCase(fetchMappings.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || '매핑 조회에 실패했습니다.';
      })
      // Create mapping
      .addCase(createMapping.fulfilled, (state, action) => {
        state.mappings.push(action.payload);
      })
      // Update mapping
      .addCase(updateMapping.fulfilled, (state, action) => {
        const index = state.mappings.findIndex(m => m._id === action.payload._id);
        if (index !== -1) {
          state.mappings[index] = action.payload;
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