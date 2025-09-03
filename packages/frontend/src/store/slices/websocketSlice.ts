// packages/frontend/src/store/slices/websocketSlice.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface WebSocketState {
  connected: boolean;
  reconnecting: boolean;
  reconnectAttempts: number;
  error: string | null;
}

const initialState: WebSocketState = {
  connected: true, // WebSocket 비활성화 상태에서도 연결된 것으로 표시
  reconnecting: false,
  reconnectAttempts: 0,
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
        state.reconnectAttempts = 0;
      }
    },
    setReconnecting: (state, action: PayloadAction<boolean>) => {
      state.reconnecting = action.payload;
    },
    incrementReconnectAttempts: (state) => {
      state.reconnectAttempts++;
    },
    resetReconnectAttempts: (state) => {
      state.reconnectAttempts = 0;
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
    resetWebSocketState: () => initialState,
  },
});

export const { 
  setConnected, 
  setReconnecting, 
  incrementReconnectAttempts,
  resetReconnectAttempts,
  setError,
  resetWebSocketState
} = websocketSlice.actions;

export default websocketSlice.reducer;