// packages/frontend/src/components/WebSocketStatus.tsx
import React from 'react';
import { Chip, Tooltip } from '@mui/material';
import { FiberManualRecord } from '@mui/icons-material';
import { useAppSelector } from '@/hooks/redux';

const WebSocketStatus: React.FC = () => {
  const { connected, reconnecting, reconnectAttempts } = useAppSelector((state) => state.websocket);

  const getStatusColor = () => {
    if (connected) return 'success';
    if (reconnecting) return 'warning';
    return 'error';
  };

  const getStatusLabel = () => {
    if (connected) return '연결됨';
    if (reconnecting) return `재연결 중... (${reconnectAttempts})`;
    return '연결 끊김';
  };

  const getTooltipText = () => {
    if (connected) return 'WebSocket 실시간 연결 활성';
    if (reconnecting) return `WebSocket 재연결 시도 중 (${reconnectAttempts}회)`;
    return 'WebSocket 연결 끊김';
  };

  return (
    <Tooltip title={getTooltipText()}>
      <Chip
        icon={<FiberManualRecord />}
        label={getStatusLabel()}
        color={getStatusColor() as any}
        size="small"
        sx={{ 
          mr: 2,
          '& .MuiChip-icon': {
            fontSize: '12px'
          }
        }}
      />
    </Tooltip>
  );
};

export default WebSocketStatus;