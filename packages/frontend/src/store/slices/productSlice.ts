// packages/frontend/src/store/slices/productSlice.ts
import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { Mapping } from '@/types/models';
import apiService from '@/services/api';

interface ProductState {
  mappings: Mapping[];
  naverSearchResults: any[];
  shopifySearchResults: any[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
  loading: boolean;
  error: string | null;
}

const initialState: ProductState = {
  mappings: [],
  naverSearchResults: [],
  shopifySearchResults: [],
  pagination: {
    page: 1,
    limit: 20,
    total: 0,
    pages: 0,
  },
  loading: false,
  error: null,
};

// Async thunks
export const fetchProductMappings = createAsyncThunk(
  'products/fetchMappings',
  async (params: { page?: number; limit?: number; search?: string } = {}) => {
    const response = await apiService.get('/mappings', { params });
    return response;
  }
);

export const createMapping = createAsyncThunk(
  'products/createMapping',
  async (data: Partial<Mapping>) => {
    const response = await apiService.post('/mappings', data);
    return response;
  }
);

export const updateMapping = createAsyncThunk(
  'products/updateMapping',
  async ({ id, data }: { id: string; data: Partial<Mapping> }) => {
    const response = await apiService.put(`/mappings/${id}`, data);
    return response;
  }
);

export const deleteMapping = createAsyncThunk(
  'products/deleteMapping',
  async (id: string) => {
    await apiService.delete(`/mappings/${id}`);
    return id;
  }
);

export const autoDiscoverMappings = createAsyncThunk(
  'products/autoDiscover',
  async () => {
    const response = await apiService.post('/mappings/auto-discover');
    return response;
  }
);

export const searchNaverProducts = createAsyncThunk(
  'products/searchNaver',
  async (query: string) => {
    const response = await apiService.get('/products/search/naver', {
      params: { q: query },
    });
    return response;
  }
);

export const searchShopifyProducts = createAsyncThunk(
  'products/searchShopify',
  async (query: string) => {
    const response = await apiService.get('/products/search/shopify', {
      params: { q: query },
    });
    return response;
  }
);

const productSlice = createSlice({
  name: 'products',
  initialState,
  reducers: {
    setMappings: (state, action: PayloadAction<Mapping[]>) => {
      state.mappings = action.payload;
    },
    
    setPagination: (state, action: PayloadAction<ProductState['pagination']>) => {
      state.pagination = action.payload;
    },
    
    clearSearchResults: (state) => {
      state.naverSearchResults = [];
      state.shopifySearchResults = [];
    },
    
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
    
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch mappings
      .addCase(fetchProductMappings.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchProductMappings.fulfilled, (state, action) => {
        state.mappings = action.payload.data;
        state.pagination = action.payload.pagination;
        state.loading = false;
      })
      .addCase(fetchProductMappings.rejected, (state, action) => {
        state.error = action.error.message || 'Failed to fetch mappings';
        state.loading = false;
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
      })
      // Search Naver
      .addCase(searchNaverProducts.fulfilled, (state, action) => {
        state.naverSearchResults = action.payload;
      })
      // Search Shopify
      .addCase(searchShopifyProducts.fulfilled, (state, action) => {
        state.shopifySearchResults = action.payload;
      });
  },
});

export const {
  setMappings,
  setPagination,
  clearSearchResults,
  setLoading,
  setError,
} = productSlice.actions;

export default productSlice.reducer;