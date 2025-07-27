// packages/frontend/src/store/slices/websocketSlice.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import websocketService from '@/services/websocket';
import { AppDispatch } from '@/store';

interface WebSocketState {
  connected: boolean;
  reconnecting: boolean;
  error: string | null;
}

const initialState: WebSocketState = {
  connected: false,
  reconnecting: false,
  error: null,
};

const websocketSlice = createSlice({
  name: 'websocket',
  initialState,
  reducers: {
    setConnected: (state, action: PayloadAction<boolean>) => {
      state.connected = action.payload;
      if (action.payload) {
        state.error = null;
        state.reconnecting = false;
      }
    },
    setReconnecting: (state, action: PayloadAction<boolean>) => {
      state.reconnecting = action.payload;
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
  },
});

export const { setConnected, setReconnecting, setError } = websocketSlice.actions;

// Thunk actions for websocket
export const initializeWebSocket = () => (dispatch: AppDispatch) => {
  websocketService.connect(dispatch);
};

export const disconnectWebSocket = () => () => {
  websocketService.disconnect();
};

export default websocketSlice.reducer;