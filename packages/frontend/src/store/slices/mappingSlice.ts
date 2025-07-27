// packages/frontend/src/store/slices/mappingSlice.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Mapping } from '@/types/models';

interface MappingState {
  mappings: Mapping[];
  filter: {
    status?: 'ACTIVE' | 'INACTIVE' | 'ERROR' | 'all';
    syncStatus?: 'synced' | 'pending' | 'error' | 'all';
    search?: string;
  };
  selectedMappings: string[];
  loading: boolean;
  error: string | null;
}

const initialState: MappingState = {
  mappings: [],
  filter: {
    status: 'all',
    syncStatus: 'all',
    search: '',
  },
  selectedMappings: [],
  loading: false,
  error: null,
};

const mappingSlice = createSlice({
  name: 'mapping',
  initialState,
  reducers: {
    setMappings: (state, action: PayloadAction<Mapping[]>) => {
      state.mappings = action.payload;
    },
    
    addMapping: (state, action: PayloadAction<Mapping>) => {
      state.mappings.push(action.payload);
    },
    
    updateMapping: (state, action: PayloadAction<Mapping>) => {
      const index = state.mappings.findIndex(m => m._id === action.payload._id);
      if (index !== -1) {
        state.mappings[index] = action.payload;
      }
    },
    
    updateMappingStatus: (state, action: PayloadAction<{ id: string; status: Mapping['status'] }>) => {
      const mapping = state.mappings.find(m => m._id === action.payload.id);
      if (mapping) {
        mapping.status = action.payload.status;
      }
    },
    
    removeMapping: (state, action: PayloadAction<string>) => {
      state.mappings = state.mappings.filter(m => m._id !== action.payload);
    },
    
    setMappingFilter: (state, action: PayloadAction<Partial<MappingState['filter']>>) => {
      state.filter = { ...state.filter, ...action.payload };
    },
    
    setSelectedMappings: (state, action: PayloadAction<string[]>) => {
      state.selectedMappings = action.payload;
    },
    
    toggleMappingSelection: (state, action: PayloadAction<string>) => {
      const index = state.selectedMappings.indexOf(action.payload);
      if (index !== -1) {
        state.selectedMappings.splice(index, 1);
      } else {
        state.selectedMappings.push(action.payload);
      }
    },
    
    clearSelectedMappings: (state) => {
      state.selectedMappings = [];
    },
    
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
    
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
    
    clearMappingState: (state) => {
      return initialState;
    },
  },
});

export const {
  setMappings,
  addMapping,
  updateMapping,
  updateMappingStatus,
  removeMapping,
  setMappingFilter,
  setSelectedMappings,
  toggleMappingSelection,
  clearSelectedMappings,
  setLoading,
  setError,
  clearMappingState,
} = mappingSlice.actions;

export default mappingSlice.reducer;